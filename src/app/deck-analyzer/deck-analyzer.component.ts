import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, map, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface AnalyzerCard {
	name: string;
	count: number;
	typeLine?: string;
	oracleText?: string;
	manaValue?: number;
	isLand: boolean;
	isRamp: boolean;
	isComboPiece: boolean;
}

interface AnalyzerOdds {
	atLeastTwoLandsOpening: number;
	rampByTurnTwo: number;
	comboByTurnFour: number;
	customScenario: number;
}

interface ScryfallLiteCard {
	type_line?: string;
	oracle_text?: string;
	cmc?: number;
}

interface MoxfieldCardEntry {
	name: string;
	count: number;
}

interface MoxfieldBoard {
	kind: 'main' | 'commander' | 'sideboard' | 'attractions' | 'stickers' | 'tokens';
	cards: MoxfieldCardEntry[];
}

interface ComboFinderCombo {
	d?: string;
	c?: string[];
	p?: string;
	s?: string;
	r?: string;
	ci?: Record<string, string>;
}

interface ComboFinderResponse {
	availableCombos?: ComboFinderCombo[];
}

interface AnalyzerComboMatch {
	id: string;
	cards: string[];
	prerequisites: string;
	steps: string;
	result: string;
	imageMap: Record<string, string>;
}

interface ManaToken {
	type: 'text' | 'symbol' | 'linebreak';
	value: string;
}

@Component({
	selector: 'app-deck-analyzer',
	standalone: true,
	imports: [CommonModule, FormsModule, HttpClientModule],
	templateUrl: './deck-analyzer.component.html',
	styleUrls: ['./deck-analyzer.component.css'],
})
export class DeckAnalyzerComponent {
	deckName = 'My Deck';
	moxfieldUrl = '';
	deckText = '';
	analyzerError: string | null = null;
	isImporting = false;
	isRunningSimulation = false;

	cards: AnalyzerCard[] = [];
	simulationRuns = 5000;
	onPlay = true;

	customLabel = 'At least 3 lands by turn 3';
	customTarget: 'lands' | 'ramp' | 'combo' = 'lands';
	customMinCount = 3;
	customTurn = 3;

	odds: AnalyzerOdds | null = null;
	comboMatches: AnalyzerComboMatch[] = [];
	expandedComboId: string | null = null;
	isLoadingCombos = false;
	comboError: string | null = null;

	private readonly scryfallCache = new Map<string, ScryfallLiteCard | null>();
	private readonly comboFinderApiUrl = 'https://combo-finder.com/api/getCombos';
	private readonly manaTokenCache = new Map<string, ManaToken[]>();

	constructor(private http: HttpClient) {}

	importDeck() {
		this.analyzerError = null;
		this.odds = null;
		this.resetComboResults();
		const parsedCards = this.parseDecklist(this.deckText);

		if (parsedCards.length === 0) {
			this.cards = [];
			this.analyzerError = 'Paste at least one valid deck entry (example: 1 Sol Ring).';
			return;
		}

		this.importParsedDeck(parsedCards);
	}

	importFromMoxfieldUrl() {
		this.analyzerError = null;
		this.odds = null;
		this.resetComboResults();

		const trimmedUrl = this.moxfieldUrl.trim();
		if (!trimmedUrl) {
			this.analyzerError = 'Enter a valid Moxfield deck URL.';
			return;
		}

		const deckId = this.extractMoxfieldDeckId(trimmedUrl);
		if (!deckId) {
			this.analyzerError = 'Invalid URL. Use a Moxfield deck URL like https://www.moxfield.com/decks/{id}.';
			return;
		}

		this.isImporting = true;
		const moxfieldApiUrl = `/api/moxfield/decks/${encodeURIComponent(deckId)}`;

		this.http.get<any>(moxfieldApiUrl).subscribe({
			next: (data) => {
				const parsedCards = this.parseMoxfieldDeck(data);
				if (parsedCards.length === 0) {
					this.cards = [];
					this.isImporting = false;
					this.analyzerError = 'This Moxfield deck has no mainboard cards available to analyze.';
					return;
				}

				const extractedDeckName = this.extractDeckName(data);
				if (extractedDeckName) {
					this.deckName = extractedDeckName;
				}

				this.deckText = parsedCards.map((card) => `${card.count} ${card.name}`).join('\n');
				this.importParsedDeck(parsedCards);
			},
			error: (err: { status?: number }) => {
				this.isImporting = false;
				this.analyzerError =
					err?.status === 0
						? 'Could not reach the Moxfield proxy from the browser. This is usually a CORS or network issue.'
						: 'Failed to load deck from Moxfield. Make sure the deck is public and the URL is correct.';
			},
		});
	}

	private importParsedDeck(parsedCards: Array<{ name: string; count: number }>) {
		this.isImporting = true;
		forkJoin(
			parsedCards.map((card) =>
				this.getCardMetadata(card.name).pipe(
					map((metadata) => {
						const typeLine = metadata?.type_line;
						const oracleText = metadata?.oracle_text;
						const manaValue = this.normalizeManaValue(metadata?.cmc);
						const isLand = this.detectLand(typeLine);
						return {
							...card,
							typeLine,
							oracleText,
							manaValue,
							isLand,
							isRamp: this.detectRamp(typeLine, oracleText, manaValue),
							isComboPiece: false,
						};
					})
				)
			)
		).subscribe({
			next: (enrichedCards) => {
				this.cards = this.applyComboDetection(enrichedCards).sort((a, b) => a.name.localeCompare(b.name));
				this.isImporting = false;
				this.loadCombosForCards(this.cards.map((card) => card.name));
				this.runSimulation();
			},
			error: () => {
				this.isImporting = false;
				this.analyzerError = 'Could not fetch card metadata for analysis.';
			},
		});
	}

	runSimulation() {
		if (!this.cards.length) {
			this.analyzerError = 'Import a deck before running simulations.';
			return;
		}

		const runs = Math.max(100, Math.floor(this.simulationRuns || 0));
		const deck = this.expandDeck(this.cards);
		if (deck.length === 0) {
			this.analyzerError = 'Deck has no cards to simulate.';
			return;
		}

		this.isRunningSimulation = true;
		const cardsSeenByTurnTwo = this.onPlay ? 8 : 9;
		const cardsSeenByTurnFour = this.onPlay ? 10 : 11;
		const cardsSeenForCustom = this.onPlay ? 7 + Math.max(0, this.customTurn - 1) : 7 + this.customTurn;

		let openingLandHits = 0;
		let rampByTurnTwoHits = 0;
		let comboByTurnFourHits = 0;
		let customHits = 0;

		for (let i = 0; i < runs; i++) {
			const shuffled = this.shuffleDeck(deck);
			const openingHand = shuffled.slice(0, 7);
			const byTurnTwo = shuffled.slice(0, Math.min(cardsSeenByTurnTwo, shuffled.length));
			const byTurnFour = shuffled.slice(0, Math.min(cardsSeenByTurnFour, shuffled.length));
			const byCustomTurn = shuffled.slice(0, Math.min(cardsSeenForCustom, shuffled.length));

			if (this.countCategory(openingHand, 'lands') >= 2) {
				openingLandHits++;
			}
			if (this.countCastableRamp(byTurnTwo) >= 1) {
				rampByTurnTwoHits++;
			}
			if (this.countCategory(byTurnFour, 'combo') >= 1) {
				comboByTurnFourHits++;
			}
			if (this.countCategory(byCustomTurn, this.customTarget) >= this.customMinCount) {
				customHits++;
			}
		}

		this.odds = {
			atLeastTwoLandsOpening: (openingLandHits / runs) * 100,
			rampByTurnTwo: (rampByTurnTwoHits / runs) * 100,
			comboByTurnFour: (comboByTurnFourHits / runs) * 100,
			customScenario: (customHits / runs) * 100,
		};

		this.isRunningSimulation = false;
	}

	getDeckSize(): number {
		return this.cards.reduce((total, card) => total + card.count, 0);
	}

	getLandCount(): number {
		return this.cards.filter((card) => card.isLand).reduce((total, card) => total + card.count, 0);
	}

	getRampCount(): number {
		return this.cards.filter((card) => card.isRamp).reduce((total, card) => total + card.count, 0);
	}

	getComboCount(): number {
		return this.cards.filter((card) => card.isComboPiece).reduce((total, card) => total + card.count, 0);
	}

	formatPercent(value: number): string {
		return `${value.toFixed(1)}%`;
	}

	autoDetectComboPieces() {
		if (!this.cards.length) {
			this.analyzerError = 'Import a deck before auto-detecting combo pieces.';
			return;
		}

		this.cards = this.applyComboDetection(this.cards.map((card) => ({ ...card })));
		this.runSimulation();
	}

	refreshDetectedCombos() {
		if (!this.cards.length) {
			this.comboError = 'Import a deck before refreshing combos.';
			return;
		}

		this.loadCombosForCards(this.cards.map((card) => card.name));
	}

	toggleComboDetails(comboId: string) {
		this.expandedComboId = this.expandedComboId === comboId ? null : comboId;
	}

	getComboCardImage(combo: AnalyzerComboMatch, cardName: string): string | null {
		if (!combo.imageMap || Object.keys(combo.imageMap).length === 0) {
			return null;
		}

		const normalizedTarget = this.normalizeComboImageKey(cardName);
		const directKey = Object.keys(combo.imageMap).find(
			(key) => this.normalizeComboImageKey(key) === normalizedTarget
		);
		if (directKey) {
			return combo.imageMap[directKey] || null;
		}

		const fallbackImage = Object.values(combo.imageMap)[0];
		return typeof fallbackImage === 'string' ? fallbackImage : null;
	}

	getComboTitle(combo: AnalyzerComboMatch): string {
		return combo.cards.join(' + ');
	}

	getDetailLines(detailText: string): string[] {
		if (!detailText) {
			return [];
		}

		const normalized = detailText
			.replace(/\r\n/g, '\n')
			.replace(/\u2022/g, '\n')
			.replace(/\s+/g, ' ')
			.trim();

		if (!normalized) {
			return [];
		}

		return normalized
			.split(/\.(?=\s+[A-Z0-9{(]|$)|\n+/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
			.map((line) => (/[.!?]$/.test(line) ? line : `${line}.`));
	}

	getManaTokens(text: string): ManaToken[] {
		const cacheKey = text || '';
		if (this.manaTokenCache.has(cacheKey)) {
			return this.manaTokenCache.get(cacheKey) || [];
		}

		const tokens: ManaToken[] = [];
		cacheKey.split(/\n/).forEach((line, lineIndex, lines) => {
			const parts = line.split(/(\{[^}]+\})/g).filter(Boolean);
			for (const part of parts) {
				if (part.startsWith('{') && part.endsWith('}')) {
					const formatted = part.replace(/\{|\}|\//g, '').replace(/ /g, '');
					tokens.push({ type: 'symbol', value: formatted });
				} else {
					tokens.push({ type: 'text', value: part });
				}
			}

			if (lineIndex < lines.length - 1) {
				tokens.push({ type: 'linebreak', value: '' });
			}
		});

		this.manaTokenCache.set(cacheKey, tokens);
		return tokens;
	}

	private parseDecklist(rawList: string): Array<{ name: string; count: number }> {
		const counts = new Map<string, number>();
		const lines = rawList
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
			.filter((line) => !/^commander:?$/i.test(line) && !/^sideboard:?$/i.test(line));

		for (const line of lines) {
			const match = line.match(/^(\d+)x?\s+(.+)$/i);
			const count = match ? Number(match[1]) : 1;
			const name = (match ? match[2] : line).trim();
			if (!name) {
				continue;
			}
			counts.set(name, (counts.get(name) || 0) + (Number.isFinite(count) && count > 0 ? count : 1));
		}

		return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
	}

	private extractMoxfieldDeckId(url: string): string | null {
		const moxfieldMatch = url.match(/(?:www\.)?moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i);
		if (moxfieldMatch?.[1]) {
			return moxfieldMatch[1];
		}

		const proxiedMatch = url.match(/\/api\/moxfield\/decks\/([A-Za-z0-9_-]+)/i);
		if (proxiedMatch?.[1]) {
			return proxiedMatch[1];
		}

		return null;
	}

	private parseMoxfieldDeck(data: any): Array<{ name: string; count: number }> {
		const boards = this.extractMoxfieldBoards(data);
		const mainBoards = boards.filter((board) => board.kind === 'main');
		const selectedBoards = mainBoards.length > 0 ? mainBoards : boards.filter((board) => board.kind !== 'tokens');

		const counts = new Map<string, number>();
		selectedBoards.forEach((board) => {
			if (board.kind === 'sideboard' || board.kind === 'commander') {
				return;
			}

			board.cards.forEach((card) => {
				if (!card.name || card.count <= 0) {
					return;
				}
				counts.set(card.name, (counts.get(card.name) || 0) + card.count);
			});
		});

		return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
	}

	private extractMoxfieldBoards(data: any): MoxfieldBoard[] {
		const boards: MoxfieldBoard[] = [];
		const sourceBoards = data?.boards && typeof data.boards === 'object' ? data.boards : null;

		if (sourceBoards) {
			Object.entries(sourceBoards).forEach(([boardName, boardValue]) => {
				boards.push({
					kind: this.mapMoxfieldBoardKind(String(boardName).toLowerCase()),
					cards: this.extractMoxfieldCards(boardValue),
				});
			});

			const nonEmptyBoards = boards.filter((board) => board.cards.length > 0);
			if (nonEmptyBoards.length > 0) {
				return nonEmptyBoards;
			}
		}

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
				};
			})
			.filter((card: MoxfieldCardEntry) => card.name.length > 0);
	}

	private extractDeckName(data: any): string | null {
		const candidate = data?.name || data?.deckName || data?.title || data?.deck?.name || null;
		if (!candidate) {
			return null;
		}

		const normalized = String(candidate).trim();
		return normalized.length > 0 ? normalized : null;
	}

	private loadCombosForCards(cardNames: string[]) {
		const uniqueNames = Array.from(new Set(cardNames.map((name) => name.trim()).filter((name) => name.length > 0)));

		if (uniqueNames.length === 0) {
			this.resetComboResults();
			return;
		}

		this.isLoadingCombos = true;
		this.comboError = null;
		this.expandedComboId = null;

		const params = new URLSearchParams();
		uniqueNames.forEach((name) => params.append('c', name));

		this.http.get<ComboFinderResponse>(`${this.comboFinderApiUrl}?${params.toString()}`).subscribe({
			next: (response) => {
				const combos = Array.isArray(response?.availableCombos) ? response.availableCombos : [];
				this.comboMatches = combos
					.map((combo, index) => this.mapComboFinderResult(combo, index))
					.filter((combo): combo is AnalyzerComboMatch => combo !== null);
				this.isLoadingCombos = false;
			},
			error: (err: { status?: number }) => {
				this.isLoadingCombos = false;
				this.comboMatches = [];
				this.comboError =
					err?.status === 0
						? 'Could not reach combo-finder from the browser. This is usually a CORS or network issue.'
						: 'Failed to fetch combos for this deck.';
			},
		});
	}

	private mapComboFinderResult(combo: ComboFinderCombo, index: number): AnalyzerComboMatch | null {
		const cards = Array.isArray(combo.c)
			? combo.c.map((name) => String(name).trim()).filter((name) => name.length > 0)
			: [];
		if (cards.length === 0) {
			return null;
		}

		return {
			id: combo.d ? `${combo.d}-${index}` : `combo-${index}`,
			cards,
			prerequisites: String(combo.p || '').trim(),
			steps: String(combo.s || '').trim(),
			result: String(combo.r || '').trim(),
			imageMap: combo.ci && typeof combo.ci === 'object' ? combo.ci : {},
		};
	}

	private normalizeComboImageKey(value: string): string {
		return value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.trim();
	}

	private resetComboResults() {
		this.comboMatches = [];
		this.expandedComboId = null;
		this.comboError = null;
		this.isLoadingCombos = false;
	}

	private applyComboDetection(cards: AnalyzerCard[]): AnalyzerCard[] {
		if (!cards.length) {
			return cards;
		}

		const normalizedCards = cards.map((card) => ({ ...card }));

		normalizedCards.forEach((card) => {
			card.isComboPiece = this.isLikelyComboPiece(card);
		});

		// If the detector found none, default to strong tutors as seed combo pieces.
		if (!normalizedCards.some((card) => card.isComboPiece)) {
			normalizedCards.forEach((card) => {
				const text = String(card.oracleText || '').toLowerCase();
				if (/search your library for (a|any) card/.test(text) || /tutor/i.test(card.name)) {
					card.isComboPiece = true;
				}
			});
		}

		return normalizedCards;
	}

	private isLikelyComboPiece(card: AnalyzerCard): boolean {
		if (card.isLand) {
			return false;
		}

		const text = String(card.oracleText || '').toLowerCase();
		const name = card.name.toLowerCase();

		let score = 0;

		if (
			/you win the game|opponents can't win|take an extra turn|infinite/i.test(text) ||
			/thassa's oracle|demonic consultation|tainted pact|underworld breach/i.test(name)
		) {
			score += 4;
		}

		if (
			/search your library for (a|any) card/.test(text) ||
			/search your library for .* and put .* into your hand/.test(text)
		) {
			score += 3;
		}

		if (
			/cast .* from your graveyard|you may cast .* from your graveyard|return target .* from your graveyard/.test(
				text
			) ||
			/reanimate|recursion/i.test(name)
		) {
			score += 2;
		}

		if (
			/(whenever|when) .* enters the battlefield/.test(text) ||
			/untap target|untap all/.test(text) ||
			/copy target|copy that spell|token that's a copy/.test(text)
		) {
			score += 2;
		}

		if (
			/reduce|costs? \{?\d*\}? less|without paying its mana cost|you may pay \{0\}/.test(text) ||
			/sacrifice .*:|sacrifice a/.test(text)
		) {
			score += 1;
		}

		if (/each opponent loses|drain|lose life|draw .* cards|create a treasure token|add \{[wubrgc]/.test(text)) {
			score += 1;
		}

		// Lower-MV engine pieces are generally more relevant for consistency combos.
		if ((card.manaValue ?? 99) <= 3) {
			score += 1;
		}

		return score >= 4;
	}

	private getCardMetadata(cardName: string) {
		const cacheKey = cardName.trim().toLowerCase();
		if (!cacheKey) {
			return of(null);
		}

		if (this.scryfallCache.has(cacheKey)) {
			return of(this.scryfallCache.get(cacheKey) || null);
		}

		const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`;
		return this.http.get<ScryfallLiteCard>(url).pipe(
			map((response) => {
				this.scryfallCache.set(cacheKey, response);
				return response;
			}),
			catchError(() => {
				this.scryfallCache.set(cacheKey, null);
				return of(null);
			})
		);
	}

	private normalizeManaValue(value: unknown): number | undefined {
		const normalized = Number(value);
		return Number.isFinite(normalized) ? normalized : undefined;
	}

	private detectLand(typeLine: string | undefined): boolean {
		return typeof typeLine === 'string' && /\bland\b/i.test(typeLine);
	}

	private detectRamp(
		typeLine: string | undefined,
		oracleText: string | undefined,
		manaValue: number | undefined
	): boolean {
		if (this.detectLand(typeLine)) {
			return false;
		}

		const text = String(oracleText || '').toLowerCase();
		const probablyRamp =
			text.includes('add {') ||
			text.includes('add one mana') ||
			text.includes('search your library for a land') ||
			text.includes('create a treasure token') ||
			text.includes('create two treasure tokens');

		if (!probablyRamp) {
			return false;
		}

		return manaValue === undefined || manaValue <= 3;
	}

	private expandDeck(cards: AnalyzerCard[]): AnalyzerCard[] {
		const expanded: AnalyzerCard[] = [];
		cards.forEach((card) => {
			for (let i = 0; i < card.count; i++) {
				expanded.push(card);
			}
		});
		return expanded;
	}

	private shuffleDeck(deck: AnalyzerCard[]): AnalyzerCard[] {
		const shuffled = [...deck];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}
		return shuffled;
	}

	private countCategory(cards: AnalyzerCard[], category: 'lands' | 'ramp' | 'combo'): number {
		switch (category) {
			case 'lands':
				return cards.filter((card) => card.isLand).length;
			case 'ramp':
				return cards.filter((card) => card.isRamp).length;
			case 'combo':
				return cards.filter((card) => card.isComboPiece).length;
			default:
				return 0;
		}
	}

	private countCastableRamp(cards: AnalyzerCard[]): number {
		return cards.filter((card) => card.isRamp && (card.manaValue ?? 99) <= 2).length;
	}
}
