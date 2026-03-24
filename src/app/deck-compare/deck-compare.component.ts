import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { catchError, forkJoin, map, of } from 'rxjs';

interface GroupedCards {
	[type: string]: { name: string; count: number }[];
}

@Component({
	selector: 'app-deck-compare',
	standalone: true,
	imports: [CommonModule, FormsModule, HttpClientModule],
	templateUrl: './deck-compare.component.html',
	styleUrls: ['./deck-compare.component.css'],
})
export class DeckCompareComponent {
	leftDeckText: string = '';
	rightDeckText: string = '';
	leftDeckUrl: string = '';
	rightDeckUrl: string = '';

	leftGroupedCards: GroupedCards = {};
	rightGroupedCards: GroupedCards = {};

	// Hover preview state
	hoveredCardImage: string | null = null;
	hoverCardPosition = { x: 0, y: 0 };

	// Toggle for showing only differences
	showDifferencesOnly = false;

	// Loading/error states
	leftLoading = false;
	rightLoading = false;
	leftError = '';
	rightError = '';

	// Tab states
	leftUseUrl = true;
	rightUseUrl = true;

	constructor(private http: HttpClient) { }

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
		this.http
			.get<any>(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`)
			.subscribe({
				next: (data) => {
					this.hoveredCardImage =
						data.image_uris?.normal || data.card_faces?.[0]?.image_uris?.normal || null;
				},
				error: () => {
					this.hoveredCardImage = null;
				},
			});
	}

	onCardLeave() {
		this.hoveredCardImage = null;
	}

	importFromUrl(url: string, side: 'left' | 'right') {
		if (!url.trim()) {
			this.setError(side, 'Please enter a valid URL');
			return;
		}

		const moxfieldMatch = url.match(/moxfield\.com\//);
		const archidektMatch = url.match(/archidekt\.com\/decks\/(\d+)/);

		if (moxfieldMatch) {
			this.setError(
				side,
				'Moxfield URL import is currently unavailable because Moxfield blocks automated requests. Paste the Moxfield export in the decklist tab instead.'
			);
		} else if (archidektMatch) {
			this.importFromArchidekt(archidektMatch[1], side);
		} else {
			this.setError(side, 'Invalid URL. Use an Archidekt deck URL, or paste a decklist export.');
		}
	}

	private importFromArchidekt(deckId: string, side: 'left' | 'right') {
		if (side === 'left') this.leftLoading = true;
		else this.rightLoading = true;
		this.setError(side, '');

		const params = new URLSearchParams();
		params.append('source', 'archidekt');
		params.append('id', deckId);

		const proxyUrl = `http://localhost:3001/api/deck?${params.toString()}`;

		this.http.get<any>(proxyUrl).subscribe({
			next: (data) => {
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
						const isSideboard = categories.some((category: string) => /^(sideboard|maybeboard)$/i.test(category));

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
			error: (err) => {
				this.setError(side, 'Failed to load deck from Archidekt. Make sure the proxy server is running on port 3001 (npm run proxy) and the URL is correct.');
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

		return ['token', 'double_faced_token', 'emblem', 'art_series'].includes(layout)
			|| categories.includes('tokens & extras');
	}

	private processParsedDeck(
		cards: { [name: string]: number },
		commander: string | null,
		sideboard: { [name: string]: number } | null,
		side: 'left' | 'right'
	) {
		const grouped: GroupedCards = {};
		const counts = cards;

		this.addCardsFromCounts(counts, grouped, side);

		if (sideboard) {
			this.addCardsFromCounts(sideboard, grouped, side, 'Sideboard');
		}

		if (commander) {
			if (!grouped['Commander']) grouped['Commander'] = [];
			grouped['Commander'].push({ name: commander, count: 1 });
			this.updateGroupedCards(side, grouped);
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
			const commanderLines = allLines.slice(commanderSectionIndex + 1, sideboardIndex === -1 ? undefined : sideboardIndex);
			const commanderLine = commanderLines.find((line) => this.isDeckEntry(line)) || null;
			const sideboardLines = sideboardIndex === -1 ? [] : allLines.slice(sideboardIndex + 1);
			this.buildGroupedDeck(mainDeckLines, sideboardLines, commanderLine, side);
			return;
		}

		if (sideboardIndex !== -1) {
			const mainDeckLines = allLines.slice(0, sideboardIndex);
			const trailingLines = allLines.slice(sideboardIndex + 1);
			const trailingCommanderCandidate = trailingLines.length > 0 ? trailingLines[trailingLines.length - 1] : null;
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

		return this.http
			.get<any>(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`)
			.pipe(
				map((data) => {
					const typeLine = data.type_line || data.card_faces?.[0]?.type_line || '';
					const oracleText = [data.oracle_text, ...(data.card_faces?.map((face: any) => face.oracle_text) || [])]
						.filter(Boolean)
						.join(' ')
						.toLowerCase();
					const commanderLegality = data.legalities?.commander;
					const isLegendaryLeader = /legendary/i.test(typeLine) && /(creature|planeswalker)/i.test(typeLine);
					const hasCommanderText = /can be your commander|choose a background|doctor's companion|friends forever|partner/.test(oracleText);
					return commanderLegality && commanderLegality !== 'not_legal' && (isLegendaryLeader || hasCommanderText);
				}),
				catchError(() => of(false))
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
		groupOverride?: string
	) {
		let pending = Object.keys(counts).length;
		if (pending === 0) {
			this.updateGroupedCards(side, grouped);
			return;
		}
		Object.keys(counts).forEach((cardName) => {
			this.http
				.get<any>(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`)
				.subscribe({
					next: (data) => {
						const typeLine = data.card_faces?.[0]?.type_line || data.type_line || 'Other';
						const group = groupOverride || this.mapTypeToGroup(typeLine);
						if (!grouped[group]) grouped[group] = [];

						const existing = grouped[group].find((c) => c.name.toLowerCase() === data.name.toLowerCase());
						if (existing) {
							existing.count += counts[cardName];
						} else {
							grouped[group].push({ name: data.name, count: counts[cardName] });
						}

						if (--pending === 0) {
							this.updateGroupedCards(side, grouped);
						}
					},
					error: () => {
						const group = groupOverride || 'Unknown';
						if (!grouped[group]) grouped[group] = [];
						const existing = grouped[group].find((c) => c.name.toLowerCase() === cardName.toLowerCase());
						if (existing) {
							existing.count += counts[cardName];
						} else {
							grouped[group].push({ name: cardName, count: counts[cardName] });
						}

						if (--pending === 0) {
							this.updateGroupedCards(side, grouped);
						}
					},
				});
		});
	}

	private updateGroupedCards(side: 'left' | 'right', grouped: GroupedCards) {
		if (side === 'left') {
			this.leftGroupedCards = this.sortGroups(grouped);
		} else {
			this.rightGroupedCards = this.sortGroups(grouped);
		}
	}

	mapTypeToGroup(typeLine: string): string {
		if (typeLine.includes('Creature')) return 'Creatures';
		if (typeLine.includes('Battle')) return 'Battles';
		if (typeLine.includes('Instant')) return 'Instants';
		if (typeLine.includes('Sorcery')) return 'Sorceries';
		if (typeLine.includes('Artifact')) return 'Artifacts';
		if (typeLine.includes('Enchantment')) return 'Enchantments';
		if (typeLine.includes('Planeswalker')) return 'Planeswalkers';
		if (typeLine.includes('Land')) return 'Lands';
		return 'Other';
	}

	sortGroups(groups: GroupedCards): GroupedCards {
		const order = [
			'Commander',
			'Battles',
			'Planeswalkers',
			'Creatures',
			'Sorceries',
			'Instants',
			'Artifacts',
			'Enchantments',
			'Lands',
			'Other',
			'Unknown',
			'Sideboard',
		];
		const sorted: GroupedCards = {};
		order.forEach((type) => {
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

	getGroupKeys(side: 'left' | 'right'): string[] {
		return Object.keys(side === 'left' ? this.leftGroupedCards : this.rightGroupedCards);
	}

	getGroupCount(side: 'left' | 'right', group: string): number {
		const data = side === 'left' ? this.leftGroupedCards : this.rightGroupedCards;
		if (!data[group]) return 0;

		// If "show differences only" is on, count only the filtered cards
		if (this.showDifferencesOnly) {
			return this.filterDifferentCards(data[group], side).reduce((acc, c) => acc + c.count, 0);
		}

		// Otherwise, count everything
		return data[group].reduce((acc, c) => acc + c.count, 0);
	}

	cardExistsOnSide(cardName: string, side: 'left' | 'right'): boolean {
		const grouped = side === 'left' ? this.rightGroupedCards : this.leftGroupedCards;
		return Object.values(grouped).some((cards) =>
			cards.some((c) => c.name.toLowerCase() === cardName.toLowerCase())
		);
	}

	// Toggle show differences only
	toggleShowDifferences() {
		this.showDifferencesOnly = !this.showDifferencesOnly;
	}

	// Filter cards based on showDifferencesOnly toggle
	filterDifferentCards(cards: { name: string; count: number }[], side: 'left' | 'right') {
		if (!this.showDifferencesOnly) {
			return cards;
		}
		// Show only cards NOT existing on opposite side (yellow circle)
		return cards.filter((card) => !this.cardExistsOnSide(card.name, side));
	}

	getFilteredGroupCount(cards: { name: string; count: number }[], side: 'left' | 'right'): number {
		return this.filterDifferentCards(cards, side).reduce((acc, c) => acc + c.count, 0);
	}

}

