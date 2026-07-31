import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Observable, catchError, finalize, forkJoin, map, of, shareReplay, tap } from 'rxjs';

import { ManaSymbolPipe } from '../shared/pipes/mana-symbol.pipe';

interface GroupedCards {
	[type: string]: { name: string; count: number }[];
}

interface ImportedCardMetadata {
	name: string;
	typeLine?: string;
	oracleText?: string;
	legalities?: Record<string, string>;
	manaCost?: string;
	manaValue?: number;
	colorIdentity?: string[];
	currentPriceUsd?: number;
	cheapestPriceUsd?: number;
	cheapestPrintLabel?: string;
}

interface MoxfieldCardEntry {
	name: string;
	count: number;
	typeLine?: string;
	oracleText?: string;
	legalities?: Record<string, string>;
	manaCost?: string;
	manaValue?: number;
	colorIdentity?: string[];
	currentPriceUsd?: number;
	cheapestPriceUsd?: number;
	cheapestPrintLabel?: string;
}

interface DeckStatTypeBreakdown {
	label: string;
	count: number;
}

interface DeckStats {
	totalCards: number;
	uniqueCards: number;
	lands: number;
	nonLands: number;
	sideboard: number;
	averageManaValue: number | null;
	colorIdentity: string[];
	colorCounts: Record<string, number>;
	typeBreakdown: DeckStatTypeBreakdown[];
}

interface DeckLegalityIssue {
	name: string;
	details: string;
}

interface DeckLegalitySummary {
	bannedCards: DeckLegalityIssue[];
	suspiciousCounts: DeckLegalityIssue[];
	illegalCommanders: DeckLegalityIssue[];
	offColorCards: DeckLegalityIssue[];
	commanderColorIdentity: string[];
}

interface DeckPriceSummary {
	totalPriceUsd: number | null;
	cheapestPrintTotalUsd: number | null;
	missingCurrentPriceCards: number;
	missingCheapestPriceCards: number;
}

@Component({
	selector: 'app-deck-compare',
	standalone: true,
	imports: [CommonModule, FormsModule, HttpClientModule, ManaSymbolPipe],
	templateUrl: './deck-compare.component.html',
	styleUrls: ['./deck-compare.component.css'],
})
export class DeckCompareComponent {
	private readonly scryfallCardCache = new Map<string, any>();
	private readonly scryfallPendingRequests = new Map<string, Observable<any>>();
	private readonly scryfallPrintPricePendingRequests = new Map<string, Observable<void>>();
	private readonly cardMetadataCache = new Map<string, ImportedCardMetadata>();
	private readonly hoverImageCache = new Map<string, string | null>();
	private readonly hoverImagePendingKeys = new Set<string>();
	private hoveredCardKey: string | null = null;
	private readonly cheapestPrintQueue: Array<{ cacheKey: string; url: string }> = [];
	private readonly queuedCheapestPrintKeys = new Set<string>();
	private processingCheapestPrintQueue = false;

	private readonly sideboardPreferenceKeys = {
		left: 'mtg-helper:deck-compare:left-sideboard-expanded',
		right: 'mtg-helper:deck-compare:right-sideboard-expanded',
	};

	private readonly usdFormatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
	});

	private readonly colorOrder = ['W', 'U', 'B', 'R', 'G'];

	private readonly groupOrder = [
		'Commander',
		'Battles',
		'Planeswalkers',
		'Creatures',
		'Sorceries',
		'Instants',
		'Artifacts',
		'Enchantments',
		'Lands',
		'Attraction Deck',
		'Sticker Sheets',
		'Sideboard',
	];

	leftDeckText: string = '';
	rightDeckText: string = '';
	leftDeckUrl: string = '';
	rightDeckUrl: string = '';
	leftDeckTitle: string = 'Deck 1';
	rightDeckTitle: string = 'Deck 2';

	leftGroupedCards: GroupedCards = {};
	rightGroupedCards: GroupedCards = {};
	leftDeckStats: DeckStats = this.createEmptyDeckStats();
	rightDeckStats: DeckStats = this.createEmptyDeckStats();
	leftDeckLegality: DeckLegalitySummary = this.createEmptyDeckLegality();
	rightDeckLegality: DeckLegalitySummary = this.createEmptyDeckLegality();
	leftDeckPrice: DeckPriceSummary = this.createEmptyDeckPriceSummary();
	rightDeckPrice: DeckPriceSummary = this.createEmptyDeckPriceSummary();

	// Hover preview state
	hoveredCardImage: string | null = null;
	hoverCardPosition = { x: 0, y: 0 };

	// Toggle for showing only differences
	showDifferencesOnly = false;
	leftSideboardExpanded = false;
	rightSideboardExpanded = false;

	// Loading/error states
	leftLoading = false;
	rightLoading = false;
	leftError = '';
	rightError = '';

	// Tab states
	leftUseUrl = true;
	rightUseUrl = true;

	constructor(private http: HttpClient) {
		this.leftSideboardExpanded = this.getStoredSideboardPreference('left');
		this.rightSideboardExpanded = this.getStoredSideboardPreference('right');
	}

	// Track mouse position globally so the image follows
	@HostListener('document:mousemove', ['$event'])
	onMouseMove(event: MouseEvent) {
		const imageWidth = 250; // estimated card width
		const imageHeight = 350; // estimated card height
		const offsetX = 30;
		const offsetY = -20;

		let x = event.clientX + offsetX;
		let y = event.clientY + offsetY;

		if (x + imageWidth > window.innerWidth) {
			x = window.innerWidth - imageWidth - 10;
		}

		if (y < 0) {
			y = 10;
		} else if (y + imageHeight > window.innerHeight) {
			y = window.innerHeight - imageHeight - 10;
		}

		this.hoverCardPosition = { x, y };
	}

	onCardHover(cardName: string) {
		const cacheKey = cardName.trim().toLowerCase();
		if (!cacheKey) {
			return;
		}

		this.hoveredCardKey = cacheKey;

		if (this.hoverImageCache.has(cacheKey)) {
			this.hoveredCardImage = this.hoverImageCache.get(cacheKey) || null;
			return;
		}

		this.hoveredCardImage = null;
		if (this.hoverImagePendingKeys.has(cacheKey)) {
			return;
		}

		this.hoverImagePendingKeys.add(cacheKey);
		this.getScryfallCard(cardName)
			.pipe(
				map((data) => data?.image_uris?.normal || data?.card_faces?.[0]?.image_uris?.normal || null),
				finalize(() => {
					this.hoverImagePendingKeys.delete(cacheKey);
				})
			)
			.subscribe((imageUrl) => {
				this.hoverImageCache.set(cacheKey, imageUrl);
				if (this.hoveredCardKey === cacheKey) {
					this.hoveredCardImage = imageUrl;
				}
			});
	}

	onCardLeave() {
		this.hoveredCardKey = null;
		this.hoveredCardImage = null;
	}

	importFromUrl(url: string, side: 'left' | 'right') {
		if (!url.trim()) {
			this.setError(side, 'Please enter a valid URL');
			return;
		}

		const moxfieldMatch = url.match(/(?:www\.)?moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i);
		const archidektMatch = url.match(/archidekt\.com\/decks\/(\d+)/i);

		if (moxfieldMatch) {
			this.importFromMoxfield(moxfieldMatch[1], side);
		} else if (archidektMatch) {
			this.importFromArchidekt(archidektMatch[1], side);
		} else {
			this.setError(side, 'Invalid URL. Use a Moxfield or Archidekt deck URL, or paste a decklist export.');
		}
	}

	private importFromMoxfield(deckId: string, side: 'left' | 'right') {
		if (side === 'left') {
			this.leftLoading = true;
		} else {
			this.rightLoading = true;
		}
		this.setError(side, '');

		const moxfieldUrl = `/api/moxfield/decks/${encodeURIComponent(deckId)}`;

		this.http.get<any>(moxfieldUrl).subscribe({
			next: (data) => {
				this.setDeckTitle(side, this.extractDeckName(data));

				const cards: { [name: string]: number } = {};
				const sideboard: { [name: string]: number } = {};
				const attractionDeck: { [name: string]: number } = {};
				const stickerSheets: { [name: string]: number } = {};
				const importedCardMetadata: Record<string, ImportedCardMetadata> = {};
				let commander: string | null = null;

				this.extractMoxfieldBoards(data).forEach((board) => {
					if (board.kind === 'tokens') {
						return;
					}

					for (const card of board.cards) {
						if (!card.name || card.count <= 0) {
							continue;
						}

						importedCardMetadata[card.name.toLowerCase()] = {
							name: card.name,
							typeLine: card.typeLine,
							oracleText: card.oracleText,
							legalities: card.legalities,
							manaCost: card.manaCost,
							manaValue: card.manaValue,
							colorIdentity: card.colorIdentity,
							currentPriceUsd: card.currentPriceUsd,
							cheapestPriceUsd: card.cheapestPriceUsd,
							cheapestPrintLabel: card.cheapestPrintLabel,
						};

						if (board.kind === 'commander') {
							commander = card.name;
							continue;
						}

						if (board.kind === 'sideboard') {
							sideboard[card.name] = (sideboard[card.name] || 0) + card.count;
							continue;
						}

						if (board.kind === 'attractions') {
							attractionDeck[card.name] = (attractionDeck[card.name] || 0) + card.count;
							continue;
						}

						if (board.kind === 'stickers') {
							stickerSheets[card.name] = (stickerSheets[card.name] || 0) + card.count;
							continue;
						}

						cards[card.name] = (cards[card.name] || 0) + card.count;
					}
				});

				this.processParsedDeck(
					cards,
					commander,
					Object.keys(sideboard).length ? sideboard : null,
					side,
					importedCardMetadata,
					Object.keys(attractionDeck).length ? attractionDeck : null,
					Object.keys(stickerSheets).length ? stickerSheets : null
				);
			},
			error: (err: { status?: number }) => {
				const message =
					err?.status === 0
						? 'Could not reach the Moxfield proxy from the browser. This is usually a CORS or network issue.'
						: 'Failed to load deck from Moxfield. Make sure the deck is public and the URL is correct.';

				this.setError(side, message);
				if (side === 'left') {
					this.leftLoading = false;
				} else {
					this.rightLoading = false;
				}
			},
		});
	}

	private extractMoxfieldBoards(data: any): Array<{
		kind: 'main' | 'commander' | 'sideboard' | 'attractions' | 'stickers' | 'tokens';
		cards: MoxfieldCardEntry[];
	}> {
		const boards: Array<{
			kind: 'main' | 'commander' | 'sideboard' | 'attractions' | 'stickers' | 'tokens';
			cards: MoxfieldCardEntry[];
		}> = [];
		const sourceBoards = data?.boards && typeof data.boards === 'object' ? data.boards : null;

		if (sourceBoards) {
			Object.entries(sourceBoards).forEach(([boardName, boardValue]) => {
				const normalizedName = String(boardName).toLowerCase();
				const kind = this.mapMoxfieldBoardKind(normalizedName);
				boards.push({
					kind,
					cards: this.extractMoxfieldCards(boardValue),
				});
			});

			const nonEmptyBoards = boards.filter((board) => board.cards.length > 0);
			if (nonEmptyBoards.length > 0) {
				return nonEmptyBoards;
			}
		}

		if (boards.length > 0) {
			return boards;
		}

		// Fallback for alternate payload shapes.
		if (data?.commanders) {
			boards.push({ kind: 'commander', cards: this.extractMoxfieldCards(data.commanders) });
		}
		if (data?.sideboard) {
			boards.push({ kind: 'sideboard', cards: this.extractMoxfieldCards(data.sideboard) });
		}
		if (data?.mainboard) {
			boards.push({ kind: 'main', cards: this.extractMoxfieldCards(data.mainboard) });
		}
		if (data?.attractions) {
			boards.push({ kind: 'attractions', cards: this.extractMoxfieldCards(data.attractions) });
		}
		if (data?.stickers) {
			boards.push({ kind: 'stickers', cards: this.extractMoxfieldCards(data.stickers) });
		}

		return boards;
	}

	private mapMoxfieldBoardKind(
		boardName: string
	): 'main' | 'commander' | 'sideboard' | 'attractions' | 'stickers' | 'tokens' {
		if (/token|emblem|helper|extra/.test(boardName)) {
			return 'tokens';
		}
		if (/commander/.test(boardName)) {
			return 'commander';
		}
		if (/attraction/.test(boardName)) {
			return 'attractions';
		}
		if (/sticker/.test(boardName)) {
			return 'stickers';
		}
		if (/sideboard|maybeboard/.test(boardName)) {
			return 'sideboard';
		}
		return 'main';
	}

	private extractMoxfieldCards(boardData: any): MoxfieldCardEntry[] {
		if (!boardData) {
			return [];
		}

		const normalizedEntries = Array.isArray(boardData)
			? boardData
			: Array.isArray(boardData?.cards)
				? boardData.cards
				: boardData?.cards && typeof boardData.cards === 'object'
					? Object.values(boardData.cards)
					: typeof boardData === 'object'
						? Object.values(boardData)
						: [];

		return normalizedEntries
			.map((entry: any) => {
				const name = entry?.card?.name || entry?.name || entry?.cardName || entry?.card_title || '';
				const count = Number(entry?.quantity ?? entry?.count ?? entry?.qty ?? 1);
				return {
					name: String(name).trim(),
					count: Number.isFinite(count) && count > 0 ? count : 1,
					typeLine: entry?.card?.type_line || entry?.type_line || undefined,
					oracleText: this.normalizeOracleText(entry?.card),
					legalities: this.normalizeLegalities(entry?.card?.legalities),
					manaCost: this.normalizeManaCost(entry?.card),
					manaValue: this.normalizeManaValue(entry?.card?.cmc ?? entry?.cmc ?? entry?.manaValue),
					colorIdentity: this.normalizeColorIdentity(entry?.card?.color_identity ?? entry?.color_identity),
					currentPriceUsd: this.normalizeUsdPrice(this.extractCurrentPrintPrice(entry?.card?.prices)),
				};
			})
			.filter((card: MoxfieldCardEntry) => card.name.length > 0);
	}

	private importFromArchidekt(deckId: string, side: 'left' | 'right') {
		if (side === 'left') this.leftLoading = true;
		else this.rightLoading = true;
		this.setError(side, '');
		const archidektUrl = `/api/archidekt/decks/${encodeURIComponent(deckId)}`;

		this.http.get<any>(archidektUrl).subscribe({
			next: (data) => {
				this.setDeckTitle(side, this.extractDeckName(data));

				const cards: { [name: string]: number } = {};
				const sideboard: { [name: string]: number } = {};
				let commander: string | null = null;

				if (data.cards) {
					data.cards.forEach((cardObj: any) => {
						if (this.isArchidektAuxiliaryCard(cardObj)) {
							return;
						}

						const cardName = cardObj.card.oracleCard.name;
						const quantity = cardObj.quantity || 1;
						const categories = cardObj.categories || [];
						const isCommander = categories.some((category: string) => /^commander$/i.test(category));
						const isSideboard = categories.some((category: string) =>
							/^(sideboard|maybeboard)$/i.test(category)
						);

						if (isCommander) {
							commander = cardName;
						} else if (isSideboard) {
							sideboard[cardName] = (sideboard[cardName] || 0) + quantity;
						} else {
							cards[cardName] = (cards[cardName] || 0) + quantity;
						}
					});
				}

				this.processParsedDeck(cards, commander, Object.keys(sideboard).length ? sideboard : null, side);
			},
			error: (err: { status?: number }) => {
				const message =
					err?.status === 0
						? 'Could not reach the Archidekt proxy from the browser. This is usually a CORS or network issue.'
						: 'Failed to load deck from Archidekt. Make sure the deck is public and the URL is correct.';

				this.setError(side, message);
				if (side === 'left') this.leftLoading = false;
				else this.rightLoading = false;
			},
		});
	}

	private isArchidektAuxiliaryCard(cardObj: any): boolean {
		const oracleCard = cardObj?.card?.oracleCard;
		const layout = String(oracleCard?.layout || '').toLowerCase();
		const categories = Array.isArray(cardObj?.categories)
			? cardObj.categories.map((category: string) => category.toLowerCase())
			: [];

		return (
			['token', 'double_faced_token', 'emblem', 'art_series'].includes(layout) ||
			categories.includes('tokens & extras')
		);
	}

	private processParsedDeck(
		cards: { [name: string]: number },
		commander: string | null,
		sideboard: { [name: string]: number } | null,
		side: 'left' | 'right',
		importedCardMetadata?: Record<string, ImportedCardMetadata>,
		attractionDeck?: { [name: string]: number } | null,
		stickerSheets?: { [name: string]: number } | null
	) {
		const grouped: GroupedCards = {};
		const counts = cards;

		this.addCardsFromCounts(counts, grouped, side, undefined, importedCardMetadata);

		if (sideboard) {
			this.addCardsFromCounts(sideboard, grouped, side, 'Sideboard', importedCardMetadata);
		}

		if (attractionDeck) {
			this.addCardsFromCounts(attractionDeck, grouped, side, 'Attraction Deck', importedCardMetadata);
		}

		if (stickerSheets) {
			this.addCardsFromCounts(stickerSheets, grouped, side, 'Sticker Sheets', importedCardMetadata);
		}

		if (commander) {
			const commanderMetadata = importedCardMetadata?.[commander.toLowerCase()];
			if (commanderMetadata) {
				this.storeCardMetadata(commanderMetadata);
			}

			if (!grouped['Commander']) grouped['Commander'] = [];
			grouped['Commander'].push({ name: commander, count: 1 });
			this.updateGroupedCards(side, grouped);

			if (!commanderMetadata && !this.cardMetadataCache.has(commander.toLowerCase())) {
				this.getScryfallCard(commander).subscribe(() => {
					this.updateGroupedCards(side, grouped);
				});
			}
		}

		if (side === 'left') this.leftLoading = false;
		else this.rightLoading = false;
	}

	processDecklist(rawList: string, side: 'left' | 'right') {
		const allLines = rawList
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => l.length > 0);

		if (allLines.length === 0) return;

		const isArchidekt = allLines.some((line) => /\^.*\{.*\}.*\^/.test(line) || /\[.*\]/.test(line));

		if (isArchidekt) {
			this.processArchidektDeck(allLines, side);
		} else {
			this.processMoxfieldDeck(allLines, side);
		}
	}

	private processMoxfieldDeck(allLines: string[], side: 'left' | 'right') {
		const commanderSectionIndex = allLines.findIndex((line) => /^commander:?$/i.test(line));
		const sideboardIndex = allLines.findIndex((line) => /^sideboard:?$/i.test(line));

		if (commanderSectionIndex !== -1) {
			const mainDeckLines = allLines.slice(0, commanderSectionIndex);
			const commanderLines = allLines.slice(
				commanderSectionIndex + 1,
				sideboardIndex === -1 ? undefined : sideboardIndex
			);
			const commanderLine = commanderLines.find((line) => this.isDeckEntry(line)) || null;
			const sideboardLines = sideboardIndex === -1 ? [] : allLines.slice(sideboardIndex + 1);
			this.buildGroupedDeck(mainDeckLines, sideboardLines, commanderLine, side);
			return;
		}

		if (sideboardIndex !== -1) {
			const mainDeckLines = allLines.slice(0, sideboardIndex);
			const trailingLines = allLines.slice(sideboardIndex + 1);
			const trailingCommanderCandidate =
				trailingLines.length > 0 ? trailingLines[trailingLines.length - 1] : null;
			const sideboardLines = trailingCommanderCandidate ? trailingLines.slice(0, -1) : trailingLines;

			if (trailingCommanderCandidate) {
				this.getCommanderLikelihood(this.cleanCardLine(trailingCommanderCandidate)).subscribe((isCommander) => {
					const commanderLine = isCommander ? trailingCommanderCandidate : null;
					const normalizedSideboard = isCommander ? sideboardLines : trailingLines;
					if (commanderLine) {
						this.buildGroupedDeck(mainDeckLines, normalizedSideboard, commanderLine, side);
						return;
					}

					this.resolveBoundaryCommander(mainDeckLines, normalizedSideboard, side);
				});
				return;
			}

			this.resolveBoundaryCommander(mainDeckLines, sideboardLines, side);
			return;
		}

		this.resolveBoundaryCommander([...allLines], [], side);
	}

	private resolveBoundaryCommander(mainDeckLines: string[], sideboardLines: string[], side: 'left' | 'right') {
		if (mainDeckLines.length === 0) {
			this.buildGroupedDeck(mainDeckLines, sideboardLines, null, side);
			return;
		}

		const firstLine = mainDeckLines[0];
		const lastLine = mainDeckLines[mainDeckLines.length - 1];
		const firstCardName = this.cleanCardLine(firstLine);
		const lastCardName = this.cleanCardLine(lastLine);

		forkJoin({
			first: this.getCommanderLikelihood(firstCardName),
			last: this.getCommanderLikelihood(lastCardName),
		}).subscribe(({ first, last }) => {
			let commanderLine: string | null = null;
			const normalizedMainDeck = [...mainDeckLines];

			if (first && !last) {
				commanderLine = normalizedMainDeck.shift() || null;
			} else if (last) {
				commanderLine = normalizedMainDeck.pop() || null;
			}

			this.buildGroupedDeck(normalizedMainDeck, sideboardLines, commanderLine, side);
		});
	}

	private buildGroupedDeck(
		mainDeckLines: string[],
		sideboardLines: string[],
		commanderLine: string | null,
		side: 'left' | 'right'
	) {
		const grouped: GroupedCards = {};
		const mainCounts = this.parseCardCounts(mainDeckLines);
		const sideboardCounts = this.parseCardCounts(sideboardLines);

		if (commanderLine) {
			const cleanCommanderName = this.cleanCardLine(commanderLine);
			if (!grouped['Commander']) grouped['Commander'] = [];
			grouped['Commander'].push({ name: cleanCommanderName, count: 1 });
		}

		this.addCardsFromCounts(mainCounts, grouped, side);
		this.addCardsFromCounts(sideboardCounts, grouped, side, 'Sideboard');
		this.updateGroupedCards(side, grouped);
	}

	private cleanCardLine(line: string): string {
		return line.replace(/^(\d+)x?\s+/i, '').trim();
	}

	private isDeckEntry(line: string): boolean {
		return /^(\d+)x?\s+.+$/i.test(line);
	}

	private getCommanderLikelihood(cardName: string) {
		if (!cardName) {
			return of(false);
		}

		return this.getScryfallCard(cardName).pipe(
			map((data) => {
				return data ? this.isCommanderMetadataEligible(this.createImportedCardMetadata(data)) : false;
			})
		);
	}

	private processArchidektDeck(allLines: string[], side: 'left' | 'right') {
		const grouped: GroupedCards = {};
		const mainLines: string[] = [];
		const sideboardLines: string[] = [];
		let commanderLine: string | null = null;

		for (const line of allLines) {
			let count = 1;
			let namePart = line;
			const countMatch = line.match(/^(\d+)x?\s+/i);
			if (countMatch) {
				count = parseInt(countMatch[1], 10);
				namePart = line.substring(countMatch[0].length);
			}

			let cardName = namePart.split(/[\(\[\^]/)[0].trim();
			const isCommander = /\bCommander\b/i.test(line);
			const isSideboard = /\b(Maybeboard|noDeck)\b/i.test(line);

			if (isCommander) {
				commanderLine = `${count} ${cardName}`;
			} else if (isSideboard) {
				sideboardLines.push(`${count} ${cardName}`);
			} else {
				mainLines.push(`${count} ${cardName}`);
			}
		}

		const mainCounts = this.parseCardCounts(mainLines);
		const sideboardCounts = this.parseCardCounts(sideboardLines);

		this.addCardsFromCounts(mainCounts, grouped, side);
		this.addCardsFromCounts(sideboardCounts, grouped, side, 'Sideboard');

		if (commanderLine) {
			const cleanCommanderName = commanderLine.replace(/^(\d+)x?\s+/i, '').trim();
			if (!grouped['Commander']) grouped['Commander'] = [];
			grouped['Commander'].push({ name: cleanCommanderName, count: 1 });
		}

		this.updateGroupedCards(side, grouped);
	}

	private parseCardCounts(list: string[]): { [name: string]: number } {
		const counts: { [name: string]: number } = {};
		for (const line of list) {
			const match = line.match(/^(\d+)x?\s+(.+)$/i);
			if (match) {
				const count = parseInt(match[1], 10);
				const name = match[2];
				counts[name] = (counts[name] || 0) + count;
			} else {
				counts[line] = (counts[line] || 0) + 1;
			}
		}
		return counts;
	}

	private addCardsFromCounts(
		counts: { [name: string]: number },
		grouped: GroupedCards,
		side: 'left' | 'right',
		groupOverride?: string,
		importedCardMetadata?: Record<string, ImportedCardMetadata>
	) {
		let pending = Object.keys(counts).length;
		if (pending === 0) {
			this.updateGroupedCards(side, grouped);
			return;
		}
		Object.keys(counts).forEach((cardName) => {
			const metadata = importedCardMetadata?.[cardName.toLowerCase()];
			if (metadata?.name && (groupOverride || metadata.typeLine)) {
				this.storeCardMetadata(metadata);
				if (metadata.currentPriceUsd === undefined || metadata.cheapestPriceUsd === undefined) {
					this.getScryfallCard(metadata.name).subscribe();
				}
				const group = groupOverride || this.mapTypeToGroup(metadata.typeLine || 'Other');
				this.upsertGroupedCard(grouped, group, metadata.name, counts[cardName]);

				if (--pending === 0) {
					this.updateGroupedCards(side, grouped);
				}
				return;
			}

			this.getScryfallCard(cardName).subscribe((data) => {
				if (data) {
					this.storeCardMetadata(this.createImportedCardMetadata(data));
					const typeLine = data.card_faces?.[0]?.type_line || data.type_line || 'Other';
					const group = groupOverride || this.mapTypeToGroup(typeLine);
					this.upsertGroupedCard(grouped, group, data.name, counts[cardName]);
				} else {
					const group = groupOverride || 'Unknown';
					this.upsertGroupedCard(grouped, group, metadata?.name || cardName, counts[cardName]);
				}

				if (--pending === 0) {
					this.updateGroupedCards(side, grouped);
				}
			});
		});
	}

	private upsertGroupedCard(grouped: GroupedCards, group: string, name: string, count: number) {
		if (!grouped[group]) grouped[group] = [];

		const normalizedName = this.normalizeCardName(name);
		const existing = grouped[group].find((card) => this.normalizeCardName(card.name) === normalizedName);
		if (existing) {
			existing.count += count;
		} else {
			grouped[group].push({ name, count });
		}
	}

	private getScryfallCard(cardName: string): Observable<any> {
		const normalizedName = cardName.trim();
		if (!normalizedName) {
			return of(null);
		}

		const cacheKey = normalizedName.toLowerCase();
		const cachedCard = this.scryfallCardCache.get(cacheKey);
		if (cachedCard) {
			return of(cachedCard);
		}

		const pendingRequest = this.scryfallPendingRequests.get(cacheKey);
		if (pendingRequest) {
			return pendingRequest;
		}

		const request$ = this.http
			.get<any>(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(normalizedName)}`)
			.pipe(
				tap((data) => {
					if (data) {
						this.scryfallCardCache.set(cacheKey, data);
						this.storeCardMetadata(this.createImportedCardMetadata(data));
						this.ensureCheapestPrintPrice(cacheKey, data);
						this.reclassifyCardInBothDecks(normalizedName);
						this.refreshDerivedDeckState();
					}
				}),
				catchError(() => of(null)),
				finalize(() => {
					this.scryfallPendingRequests.delete(cacheKey);
				}),
				shareReplay(1)
			);

		this.scryfallPendingRequests.set(cacheKey, request$);
		return request$;
	}

	private updateGroupedCards(side: 'left' | 'right', grouped: GroupedCards) {
		if (side === 'left') {
			this.leftGroupedCards = this.sortGroups(grouped);
		} else {
			this.rightGroupedCards = this.sortGroups(grouped);
		}

		this.refreshDerivedDeckState();
	}

	hasDeckData(side: 'left' | 'right'): boolean {
		const stats = side === 'left' ? this.leftDeckStats : this.rightDeckStats;
		return stats.totalCards > 0 || stats.sideboard > 0;
	}

	formatAverageManaValue(value: number | null): string {
		return value === null ? '--' : value.toFixed(2);
	}

	formatUsd(value: number | null): string {
		return value === null ? '--' : this.usdFormatter.format(value);
	}

	formatUsdDelta(value: number | null): string {
		if (value === null) {
			return '--';
		}

		const sign = value > 0 ? '+' : value < 0 ? '-' : '';
		return `${sign}${this.formatUsd(Math.abs(value))}`;
	}

	hasPriceData(side: 'left' | 'right'): boolean {
		const summary = side === 'left' ? this.leftDeckPrice : this.rightDeckPrice;
		return (
			summary.totalPriceUsd !== null ||
			summary.cheapestPrintTotalUsd !== null ||
			summary.missingCurrentPriceCards > 0 ||
			summary.missingCheapestPriceCards > 0
		);
	}

	getDeckPriceDelta(kind: 'current' | 'cheapest'): number | null {
		const leftValue =
			kind === 'current' ? this.leftDeckPrice.totalPriceUsd : this.leftDeckPrice.cheapestPrintTotalUsd;
		const rightValue =
			kind === 'current' ? this.rightDeckPrice.totalPriceUsd : this.rightDeckPrice.cheapestPrintTotalUsd;

		if (leftValue === null || rightValue === null) {
			return null;
		}

		return leftValue - rightValue;
	}

	hasLegalityFindings(side: 'left' | 'right'): boolean {
		return this.getLegalityIssueCount(side) > 0;
	}

	hasCommanderIdentityComparison(): boolean {
		return (
			this.leftDeckLegality.commanderColorIdentity.length > 0 &&
			this.rightDeckLegality.commanderColorIdentity.length > 0
		);
	}

	isCommanderIdentityMismatch(): boolean {
		if (!this.hasCommanderIdentityComparison()) {
			return false;
		}

		return (
			this.getCommanderIdentityExclusiveColors('left').length > 0 ||
			this.getCommanderIdentityExclusiveColors('right').length > 0
		);
	}

	getCommanderIdentityExclusiveColors(side: 'left' | 'right'): string[] {
		const ownColors = new Set(
			side === 'left'
				? this.leftDeckLegality.commanderColorIdentity
				: this.rightDeckLegality.commanderColorIdentity
		);
		const oppositeColors = new Set(
			side === 'left'
				? this.rightDeckLegality.commanderColorIdentity
				: this.leftDeckLegality.commanderColorIdentity
		);

		return this.colorOrder.filter((colorCode) => ownColors.has(colorCode) && !oppositeColors.has(colorCode));
	}

	getLegalityIssueCount(side: 'left' | 'right'): number {
		const summary = side === 'left' ? this.leftDeckLegality : this.rightDeckLegality;
		return (
			summary.bannedCards.length +
			summary.suspiciousCounts.length +
			summary.illegalCommanders.length +
			summary.offColorCards.length
		);
	}

	getColorLabel(colorCode: string): string {
		switch (colorCode) {
			case 'W':
				return 'White';
			case 'U':
				return 'Blue';
			case 'B':
				return 'Black';
			case 'R':
				return 'Red';
			case 'G':
				return 'Green';
			default:
				return colorCode;
		}
	}

	getCardManaCost(cardName: string): string | null {
		return this.cardMetadataCache.get(cardName.toLowerCase())?.manaCost || null;
	}

	getCardCurrentPrice(cardName: string): number | null {
		const price = this.cardMetadataCache.get(cardName.toLowerCase())?.currentPriceUsd;
		return typeof price === 'number' ? price : null;
	}

	getCardPriceLabel(cardName: string): string | null {
		const price = this.getCardCurrentPrice(cardName);
		return price === null ? null : this.formatUsd(price);
	}

	mapTypeToGroup(typeLine: string): string {
		const firstFaceTypeLine = typeLine.split('//')[0].trim();
		const primaryTypeText = firstFaceTypeLine.split(/[—-]/)[0].trim();
		const typeText = primaryTypeText.toLowerCase();

		if (typeText.includes('battle')) return 'Battles';
		if (typeText.includes('planeswalker')) return 'Planeswalkers';
		if (typeText.includes('creature')) return 'Creatures';
		if (typeText.includes('instant')) return 'Instants';
		if (typeText.includes('sorcery')) return 'Sorceries';
		if (typeText.includes('enchantment')) return 'Enchantments';
		if (typeText.includes('artifact')) return 'Artifacts';
		if (typeText.includes('land')) return 'Lands';
		return 'Other';
	}

	private createEmptyDeckStats(): DeckStats {
		return {
			totalCards: 0,
			uniqueCards: 0,
			lands: 0,
			nonLands: 0,
			sideboard: 0,
			averageManaValue: null,
			colorIdentity: [],
			colorCounts: {},
			typeBreakdown: [],
		};
	}

	private createEmptyDeckLegality(): DeckLegalitySummary {
		return {
			bannedCards: [],
			suspiciousCounts: [],
			illegalCommanders: [],
			offColorCards: [],
			commanderColorIdentity: [],
		};
	}

	private createEmptyDeckPriceSummary(): DeckPriceSummary {
		return {
			totalPriceUsd: null,
			cheapestPrintTotalUsd: null,
			missingCurrentPriceCards: 0,
			missingCheapestPriceCards: 0,
		};
	}

	private buildDeckStats(grouped: GroupedCards): DeckStats {
		const stats = this.createEmptyDeckStats();
		const colorCounts: Record<string, number> = {};
		const typeBreakdown: DeckStatTypeBreakdown[] = [];
		let manaValueTotal = 0;
		let manaValueCardCount = 0;

		Object.entries(grouped).forEach(([group, cards]) => {
			const groupCount = cards.reduce((total, card) => total + card.count, 0);

			if (group === 'Sideboard') {
				stats.sideboard += groupCount;
				return;
			}

			stats.totalCards += groupCount;
			stats.uniqueCards += cards.length;

			if (group === 'Lands') {
				stats.lands += groupCount;
			} else {
				stats.nonLands += groupCount;
			}

			typeBreakdown.push({ label: group, count: groupCount });

			cards.forEach((card) => {
				const metadata = this.cardMetadataCache.get(card.name.toLowerCase());
				if (metadata?.colorIdentity?.length) {
					metadata.colorIdentity.forEach((colorCode) => {
						colorCounts[colorCode] = (colorCounts[colorCode] || 0) + card.count;
					});
				}

				if (group !== 'Lands' && typeof metadata?.manaValue === 'number') {
					manaValueTotal += metadata.manaValue * card.count;
					manaValueCardCount += card.count;
				}
			});
		});

		stats.averageManaValue = manaValueCardCount > 0 ? manaValueTotal / manaValueCardCount : null;
		stats.colorCounts = colorCounts;
		stats.colorIdentity = this.colorOrder.filter((colorCode) => colorCounts[colorCode] > 0);
		stats.typeBreakdown = typeBreakdown.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

		return stats;
	}

	private buildDeckLegality(grouped: GroupedCards): DeckLegalitySummary {
		const summary = this.createEmptyDeckLegality();
		const commanderColors = new Set<string>();
		const commanderCards = grouped['Commander'] || [];

		commanderCards.forEach((card) => {
			const metadata = this.cardMetadataCache.get(card.name.toLowerCase());
			metadata?.colorIdentity?.forEach((colorCode) => commanderColors.add(colorCode));

			if (metadata && !this.isCommanderMetadataEligible(metadata)) {
				summary.illegalCommanders.push({
					name: card.name,
					details: 'Does not satisfy Commander leader rules.',
				});
			}
		});

		summary.commanderColorIdentity = this.colorOrder.filter((colorCode) => commanderColors.has(colorCode));

		Object.entries(grouped).forEach(([group, cards]) => {
			if (group === 'Sideboard') {
				return;
			}

			cards.forEach((card) => {
				const metadata = this.cardMetadataCache.get(card.name.toLowerCase());
				const commanderLegality = metadata?.legalities?.['commander'];

				if (commanderLegality === 'banned') {
					summary.bannedCards.push({ name: card.name, details: 'Banned in Commander.' });
				} else if (commanderLegality === 'not_legal') {
					summary.bannedCards.push({ name: card.name, details: 'Not legal in Commander.' });
				}

				if (group !== 'Commander') {
					const copyLimit = this.getCommanderCopyLimit(metadata, group);
					if (Number.isFinite(copyLimit) && card.count > copyLimit) {
						summary.suspiciousCounts.push({
							name: card.name,
							details: `${card.count} copies found; Commander limit is ${copyLimit}.`,
						});
					}

					if (commanderColors.size > 0 && metadata?.colorIdentity?.length) {
						const offColorCodes = metadata.colorIdentity.filter(
							(colorCode) => !commanderColors.has(colorCode)
						);
						if (offColorCodes.length > 0) {
							summary.offColorCards.push({
								name: card.name,
								details: `Uses ${offColorCodes
									.map((colorCode) => this.getColorLabel(colorCode))
									.join(', ')} outside commander color identity.`,
							});
						}
					}
				}
			});
		});

		summary.bannedCards = this.sortLegalityIssues(summary.bannedCards);
		summary.suspiciousCounts = this.sortLegalityIssues(summary.suspiciousCounts);
		summary.illegalCommanders = this.sortLegalityIssues(summary.illegalCommanders);
		summary.offColorCards = this.sortLegalityIssues(summary.offColorCards);

		return summary;
	}

	private buildDeckPriceSummary(grouped: GroupedCards): DeckPriceSummary {
		let totalPriceUsd = 0;
		let cheapestPrintTotalUsd = 0;
		let hasCurrentPrice = false;
		let hasCheapestPrice = false;
		let missingCurrentPriceCards = 0;
		let missingCheapestPriceCards = 0;

		Object.entries(grouped).forEach(([group, cards]) => {
			if (group === 'Sideboard') {
				return;
			}

			cards.forEach((card) => {
				const metadata = this.cardMetadataCache.get(card.name.toLowerCase());

				if (typeof metadata?.currentPriceUsd === 'number') {
					totalPriceUsd += metadata.currentPriceUsd * card.count;
					hasCurrentPrice = true;
				} else {
					missingCurrentPriceCards += 1;
				}

				if (typeof metadata?.cheapestPriceUsd === 'number') {
					cheapestPrintTotalUsd += metadata.cheapestPriceUsd * card.count;
					hasCheapestPrice = true;
				} else {
					missingCheapestPriceCards += 1;
				}
			});
		});

		return {
			totalPriceUsd: hasCurrentPrice ? totalPriceUsd : null,
			cheapestPrintTotalUsd: hasCheapestPrice ? cheapestPrintTotalUsd : null,
			missingCurrentPriceCards,
			missingCheapestPriceCards,
		};
	}

	private refreshDerivedDeckState() {
		this.leftDeckStats = this.buildDeckStats(this.leftGroupedCards);
		this.rightDeckStats = this.buildDeckStats(this.rightGroupedCards);
		this.leftDeckLegality = this.buildDeckLegality(this.leftGroupedCards);
		this.rightDeckLegality = this.buildDeckLegality(this.rightGroupedCards);
		this.leftDeckPrice = this.buildDeckPriceSummary(this.leftGroupedCards);
		this.rightDeckPrice = this.buildDeckPriceSummary(this.rightGroupedCards);
	}

	private sortLegalityIssues(issues: DeckLegalityIssue[]): DeckLegalityIssue[] {
		return [...issues].sort((a, b) => a.name.localeCompare(b.name) || a.details.localeCompare(b.details));
	}

	private isCommanderMetadataEligible(metadata: ImportedCardMetadata): boolean {
		const typeLine = metadata.typeLine || '';
		const oracleText = (metadata.oracleText || '').toLowerCase();
		const commanderLegality = metadata.legalities?.['commander'];
		const isLegendaryLeader = /legendary/i.test(typeLine) && /(creature|planeswalker)/i.test(typeLine);
		const hasCommanderText =
			/can be your commander|choose a background|doctor's companion|friends forever|partner/.test(oracleText);

		return Boolean(
			commanderLegality && commanderLegality !== 'not_legal' && (isLegendaryLeader || hasCommanderText)
		);
	}

	private getCommanderCopyLimit(metadata: ImportedCardMetadata | undefined, group: string): number {
		if (group === 'Lands' && /basic land/i.test(metadata?.typeLine || '')) {
			return Number.POSITIVE_INFINITY;
		}

		const oracleText = metadata?.oracleText || '';
		if (/a deck can have any number of cards named/i.test(oracleText)) {
			return Number.POSITIVE_INFINITY;
		}

		const limitedCopiesMatch = oracleText.match(/a deck can have up to ([a-z0-9-]+) cards named/i);
		if (limitedCopiesMatch) {
			const parsedLimit = this.parseCommanderCopyLimit(limitedCopiesMatch[1]);
			if (parsedLimit !== null) {
				return parsedLimit;
			}
		}

		return 1;
	}

	private parseCommanderCopyLimit(value: string): number | null {
		const normalizedValue = value.trim().toLowerCase();
		const numericValue = Number(normalizedValue);
		if (Number.isFinite(numericValue)) {
			return numericValue;
		}

		const valueMap: Record<string, number> = {
			one: 1,
			two: 2,
			three: 3,
			four: 4,
			five: 5,
			six: 6,
			seven: 7,
			eight: 8,
			nine: 9,
			ten: 10,
			eleven: 11,
			twelve: 12,
		};

		return valueMap[normalizedValue] ?? null;
	}

	private createImportedCardMetadata(data: any): ImportedCardMetadata {
		return {
			name: String(data?.name || '').trim(),
			typeLine: data?.type_line || data?.card_faces?.[0]?.type_line || undefined,
			oracleText: this.normalizeOracleText(data),
			legalities: this.normalizeLegalities(data?.legalities),
			manaCost: this.normalizeManaCost(data),
			manaValue: this.normalizeManaValue(data?.cmc ?? data?.manaValue),
			colorIdentity: this.normalizeColorIdentity(data?.color_identity ?? data?.colorIdentity),
			currentPriceUsd: this.normalizeUsdPrice(this.extractCurrentPrintPrice(data?.prices)),
		};
	}

	private storeCardMetadata(metadata: ImportedCardMetadata) {
		if (!metadata.name) {
			return;
		}

		const cacheKey = metadata.name.toLowerCase();
		const existing = this.cardMetadataCache.get(cacheKey);

		this.cardMetadataCache.set(cacheKey, {
			name: metadata.name,
			typeLine: metadata.typeLine ?? existing?.typeLine,
			oracleText: metadata.oracleText ?? existing?.oracleText,
			legalities: metadata.legalities ?? existing?.legalities,
			manaCost: metadata.manaCost ?? existing?.manaCost,
			manaValue: metadata.manaValue ?? existing?.manaValue,
			colorIdentity: metadata.colorIdentity ?? existing?.colorIdentity,
			currentPriceUsd: metadata.currentPriceUsd ?? existing?.currentPriceUsd,
			cheapestPriceUsd: metadata.cheapestPriceUsd ?? existing?.cheapestPriceUsd,
			cheapestPrintLabel: metadata.cheapestPrintLabel ?? existing?.cheapestPrintLabel,
		});
	}

	private ensureCheapestPrintPrice(cacheKey: string, data: any) {
		const existing = this.cardMetadataCache.get(cacheKey);
		if (existing?.cheapestPriceUsd !== undefined || !data?.prints_search_uri) {
			return;
		}

		if (this.scryfallPrintPricePendingRequests.has(cacheKey) || this.queuedCheapestPrintKeys.has(cacheKey)) {
			return;
		}

		this.cheapestPrintQueue.push({ cacheKey, url: data.prints_search_uri });
		this.queuedCheapestPrintKeys.add(cacheKey);
		this.processCheapestPrintQueue();
	}

	private processCheapestPrintQueue() {
		if (this.processingCheapestPrintQueue) {
			return;
		}

		const nextRequest = this.cheapestPrintQueue.shift();
		if (!nextRequest) {
			return;
		}

		this.processingCheapestPrintQueue = true;
		const { cacheKey, url } = nextRequest;

		const request$ = this.http.get<any>(url).pipe(
			tap((printsData) => {
				const cheapestPrint = this.findCheapestPrintPrice(printsData?.data);
				if (!cheapestPrint) {
					return;
				}

				const currentMetadata = this.cardMetadataCache.get(cacheKey);
				if (!currentMetadata) {
					return;
				}

				this.storeCardMetadata({
					...currentMetadata,
					cheapestPriceUsd: cheapestPrint.priceUsd,
					cheapestPrintLabel: cheapestPrint.printLabel,
				});
				this.refreshDerivedDeckState();
			}),
			catchError(() => of(void 0)),
			finalize(() => {
				this.queuedCheapestPrintKeys.delete(cacheKey);
				this.scryfallPrintPricePendingRequests.delete(cacheKey);
				this.processingCheapestPrintQueue = false;
				this.processCheapestPrintQueue();
			}),
			shareReplay(1)
		);

		this.scryfallPrintPricePendingRequests.set(cacheKey, request$);
		request$.subscribe();
	}

	private findCheapestPrintPrice(
		prints:
			| Array<{ set_name?: string; collector_number?: string; prices?: Record<string, string | null> }>
			| undefined
	): { priceUsd: number; printLabel: string } | null {
		if (!Array.isArray(prints)) {
			return null;
		}

		let cheapestPrint: { priceUsd: number; printLabel: string } | null = null;

		prints.forEach((print) => {
			const priceUsd = this.normalizeUsdPrice(this.extractCurrentPrintPrice(print?.prices));
			if (priceUsd === undefined) {
				return;
			}

			const printLabel = print?.set_name
				? `${print.set_name}${print.collector_number ? ` #${print.collector_number}` : ''}`
				: 'Cheapest print';

			if (!cheapestPrint || priceUsd < cheapestPrint.priceUsd) {
				cheapestPrint = { priceUsd, printLabel };
			}
		});

		return cheapestPrint;
	}

	private extractCurrentPrintPrice(prices: Record<string, string | null> | undefined): number | undefined {
		if (!prices) {
			return undefined;
		}

		const priceCandidates = [prices['usd'], prices['usd_foil'], prices['usd_etched']]
			.map((value) => this.normalizeUsdPrice(value))
			.filter((value): value is number => value !== undefined);

		return priceCandidates.length > 0 ? Math.min(...priceCandidates) : undefined;
	}

	private normalizeUsdPrice(value: unknown): number | undefined {
		if (value === '' || value === null || value === undefined) {
			return undefined;
		}

		const numericPrice = Number(value);
		return Number.isFinite(numericPrice) && numericPrice >= 0 ? numericPrice : undefined;
	}

	private normalizeOracleText(cardData: any): string | undefined {
		const oracleTextParts = [
			typeof cardData?.oracle_text === 'string' ? cardData.oracle_text.trim() : '',
			...(Array.isArray(cardData?.card_faces)
				? cardData.card_faces.map((face: any) =>
						typeof face?.oracle_text === 'string' ? face.oracle_text.trim() : ''
					)
				: []),
		].filter((value) => value.length > 0);

		return oracleTextParts.length > 0 ? oracleTextParts.join(' ') : undefined;
	}

	private normalizeLegalities(value: unknown): Record<string, string> | undefined {
		if (!value || typeof value !== 'object') {
			return undefined;
		}

		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([key, legalityValue]) => [key, String(legalityValue)])
		);
	}

	private normalizeManaCost(cardData: any): string | undefined {
		const manaCost = typeof cardData?.mana_cost === 'string' ? cardData.mana_cost.trim() : '';
		if (manaCost) {
			return manaCost;
		}

		if (!Array.isArray(cardData?.card_faces)) {
			return undefined;
		}

		const faceManaCosts = cardData.card_faces
			.map((face: any) => (typeof face?.mana_cost === 'string' ? face.mana_cost.trim() : ''))
			.filter((value: string) => value.length > 0);

		return faceManaCosts.length > 0 ? faceManaCosts.join(' // ') : undefined;
	}

	private normalizeManaValue(value: unknown): number | undefined {
		const manaValue = Number(value);
		return Number.isFinite(manaValue) ? manaValue : undefined;
	}

	private normalizeColorIdentity(value: unknown): string[] | undefined {
		if (!Array.isArray(value)) {
			return undefined;
		}

		const normalized = value
			.map((entry) => String(entry).trim().toUpperCase())
			.filter((entry) => this.colorOrder.includes(entry));

		return normalized.length > 0 ? normalized : undefined;
	}

	sortGroups(groups: GroupedCards): GroupedCards {
		const sorted: GroupedCards = {};
		this.groupOrder.forEach((type) => {
			if (groups[type]) {
				sorted[type] = groups[type].sort((a, b) => a.name.localeCompare(b.name));
			}
		});
		return sorted;
	}

	private setError(side: 'left' | 'right', message: string) {
		if (side === 'left') {
			this.leftError = message;
		} else {
			this.rightError = message;
		}
	}

	private setDeckTitle(side: 'left' | 'right', deckName: string | null) {
		const fallbackTitle = side === 'left' ? 'Deck 1' : 'Deck 2';
		const trimmedDeckName = deckName?.trim();
		const finalTitle = trimmedDeckName && trimmedDeckName.length > 0 ? trimmedDeckName : fallbackTitle;

		if (side === 'left') {
			this.leftDeckTitle = finalTitle;
		} else {
			this.rightDeckTitle = finalTitle;
		}
	}

	private extractDeckName(data: any): string | null {
		return data?.name || data?.deckName || data?.title || data?.deck?.name || null;
	}

	private reclassifyCardInBothDecks(cardName: string) {
		const normalizedName = this.normalizeCardName(cardName);
		const cardMetadata = this.cardMetadataCache.get(normalizedName);
		if (!cardMetadata?.typeLine) {
			return;
		}

		const protectedGroups = new Set(['Sideboard', 'Attraction Deck', 'Sticker Sheets', 'Commander']);

		[this.leftGroupedCards, this.rightGroupedCards].forEach((grouped) => {
			Object.entries(grouped).forEach(([group, cards]) => {
				if (protectedGroups.has(group)) {
					return;
				}

				cards.forEach((card) => {
					if (this.normalizeCardName(card.name) !== normalizedName) {
						return;
					}

					const newGroup = this.mapTypeToGroup(cardMetadata.typeLine || 'Other');
					if (newGroup !== group) {
						this.upsertGroupedCard(grouped, newGroup, card.name, card.count);
						grouped[group] = grouped[group].filter(
							(existing) => this.normalizeCardName(existing.name) !== normalizedName
						);
					}
				});
			});
		});
	}

	getGroupKeys(side: 'left' | 'right'): string[] {
		return Object.keys(side === 'left' ? this.leftGroupedCards : this.rightGroupedCards);
	}

	getComparisonGroupKeys(): string[] {
		return this.groupOrder.filter((group) => this.shouldDisplayGroup(group));
	}

	getVisibleCardsForGroup(side: 'left' | 'right', group: string): { name: string; count: number }[] {
		const data = side === 'left' ? this.leftGroupedCards : this.rightGroupedCards;
		const cards = data[group] || [];
		if (this.showDifferencesOnly && ['Sideboard', 'Attraction Deck', 'Sticker Sheets'].includes(group)) {
			return [];
		}
		return this.showDifferencesOnly ? this.filterDifferentCards(cards, side) : cards;
	}

	hasGroupCards(side: 'left' | 'right', group: string): boolean {
		return this.getVisibleCardsForGroup(side, group).length > 0;
	}

	isGroupExpanded(side: 'left' | 'right', group: string): boolean {
		if (group !== 'Sideboard') {
			return true;
		}

		return side === 'left' ? this.leftSideboardExpanded : this.rightSideboardExpanded;
	}

	shouldDisplayGroup(group: string): boolean {
		return this.hasGroupCards('left', group) || this.hasGroupCards('right', group);
	}

	getGroupCount(side: 'left' | 'right', group: string): number {
		return this.getVisibleCardsForGroup(side, group).reduce((acc, c) => acc + c.count, 0);
	}

	private normalizeCardName(cardName: string): string {
		return cardName.trim().replace(/\s+/g, ' ').toLowerCase();
	}

	private readonly comparisonExcludedGroups = new Set(['Sideboard', 'Attraction Deck', 'Sticker Sheets']);

	getCardCountOnSide(cardName: string, side: 'left' | 'right', includeExcludedGroups = true): number {
		const normalizedName = this.normalizeCardName(cardName);
		const grouped = side === 'left' ? this.leftGroupedCards : this.rightGroupedCards;
		return Object.entries(grouped).reduce((total, [group, cards]) => {
			if (!includeExcludedGroups && this.comparisonExcludedGroups.has(group)) {
				return total;
			}
			const matchingCard = cards.find((card) => this.normalizeCardName(card.name) === normalizedName);
			return total + (matchingCard?.count || 0);
		}, 0);
	}

	getCardCountOnOppositeSide(cardName: string, side: 'left' | 'right', includeExcludedGroups = true): number {
		return this.getCardCountOnSide(cardName, side === 'left' ? 'right' : 'left', includeExcludedGroups);
	}

	cardExistsOnSide(cardName: string, side: 'left' | 'right'): boolean {
		return this.getCardCountOnSide(cardName, side, false) > 0;
	}

	isCardUniqueToSide(cardName: string, side: 'left' | 'right'): boolean {
		const ownCount = this.getCardCountOnSide(cardName, side, false);
		const oppositeCount = this.getCardCountOnOppositeSide(cardName, side, false);
		return ownCount > 0 && (oppositeCount === 0 || ownCount !== oppositeCount);
	}

	// Toggle show differences only
	toggleShowDifferences() {
		this.showDifferencesOnly = !this.showDifferencesOnly;
	}

	toggleSideboardVisibility(side: 'left' | 'right') {
		const nextValue = !(side === 'left' ? this.leftSideboardExpanded : this.rightSideboardExpanded);

		if (side === 'left') {
			this.leftSideboardExpanded = nextValue;
		} else {
			this.rightSideboardExpanded = nextValue;
		}

		this.storeSideboardPreference(side, nextValue);
	}

	private getStoredSideboardPreference(side: 'left' | 'right'): boolean {
		try {
			const storedValue = globalThis.localStorage?.getItem(this.sideboardPreferenceKeys[side]);
			return storedValue === 'true';
		} catch {
			return false;
		}
	}

	private storeSideboardPreference(side: 'left' | 'right', isExpanded: boolean) {
		try {
			globalThis.localStorage?.setItem(this.sideboardPreferenceKeys[side], String(isExpanded));
		} catch {
			// Ignore storage failures; the toggle still works for the current session.
		}
	}

	// Filter cards based on showDifferencesOnly toggle
	filterDifferentCards(cards: { name: string; count: number }[], side: 'left' | 'right') {
		if (!this.showDifferencesOnly) {
			return cards;
		}
		return cards.filter((card) => this.isCardUniqueToSide(card.name, side));
	}

	getFilteredGroupCount(cards: { name: string; count: number }[], side: 'left' | 'right'): number {
		return this.filterDifferentCards(cards, side).reduce((acc, c) => acc + c.count, 0);
	}
}
