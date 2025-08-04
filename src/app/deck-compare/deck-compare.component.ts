import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

interface GroupedCards {
    [type: string]: { name: string; count: number }[];
}

@Component({
    selector: 'app-deck-compare',
    standalone: true,
    imports: [CommonModule, FormsModule, HttpClientModule],
    templateUrl: './deck-compare.component.html',
    styleUrls: ['./deck-compare.component.css']
})
export class DeckCompareComponent {
    leftDeckText: string = '';
    rightDeckText: string = '';

    leftGroupedCards: GroupedCards = {};
    rightGroupedCards: GroupedCards = {};

    constructor(private http: HttpClient) { }

    processDecklist(rawList: string, side: 'left' | 'right') {
        const allLines = rawList
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);

        if (allLines.length === 0) return;

        // Determine format: Archidekt if any line matches Archidekt pattern, else Moxfield style
        const isArchidekt = allLines.some(line => /\^.*\{.*\}.*\^/.test(line) || /\[.*\]/.test(line));

        if (isArchidekt) {
            this.processArchidektDeck(allLines, side);
        } else {
            this.processMoxfieldDeck(allLines, side);
        }
    }

    private processMoxfieldDeck(allLines: string[], side: 'left' | 'right') {
        const sideboardIndex = allLines.findIndex(line => /^sideboard:?$/i.test(line));
        const grouped: GroupedCards = {};

        if (sideboardIndex !== -1) {
            const mainDeckLines = allLines.slice(0, sideboardIndex);
            const sideboardPlusCommanderLines = allLines.slice(sideboardIndex + 1);

            // Commander is last line
            const commanderLine = sideboardPlusCommanderLines.pop() || null;
            const sideboardLines = sideboardPlusCommanderLines;

            const mainCounts = this.parseCardCounts(mainDeckLines);
            const sideboardCounts = this.parseCardCounts(sideboardLines);

            this.addCardsFromCounts(mainCounts, grouped, side);
            this.addCardsFromCounts(sideboardCounts, grouped, side, 'Sideboard');

            if (commanderLine) {
                const cleanCommanderName = commanderLine.replace(/^(\d+)x?\s+/i, '').trim();
                if (!grouped['Commander']) grouped['Commander'] = [];
                grouped['Commander'].push({ name: cleanCommanderName, count: 1 });
            }

            this.updateGroupedCards(side, grouped);
        } else {
            // No sideboard; last line is commander
            const mainDeckLines = [...allLines];
            const commanderLine = mainDeckLines.pop() || null;

            const mainCounts = this.parseCardCounts(mainDeckLines);
            this.addCardsFromCounts(mainCounts, grouped, side);

            if (commanderLine) {
                const cleanCommanderName = commanderLine.replace(/^(\d+)x?\s+/i, '').trim();
                if (!grouped['Commander']) grouped['Commander'] = [];
                grouped['Commander'].push({ name: cleanCommanderName, count: 1 });
            }

            this.updateGroupedCards(side, grouped);
        }
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

            // Extract clean card name before any set/brackets/extra tags
            let cardName = namePart.split(/[\(\[\^]/)[0].trim();

            const isCommander = /\bCommander\b/i.test(line);
            const isSideboard = /\b(Maybeboard|noDeck)\b/i.test(line); // updated to detect noDeck too

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
        Object.keys(counts).forEach(cardName => {
            this.http
                .get<any>(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`)
                .subscribe({
                    next: data => {
                        const typeLine = data.card_faces?.[0]?.type_line || data.type_line || 'Other';
                        const group = groupOverride || this.mapTypeToGroup(typeLine);
                        if (!grouped[group]) grouped[group] = [];

                        const existing = grouped[group].find(c => c.name.toLowerCase() === data.name.toLowerCase());
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
                        const existing = grouped[group].find(c => c.name.toLowerCase() === cardName.toLowerCase());
                        if (existing) {
                            existing.count += counts[cardName];
                        } else {
                            grouped[group].push({ name: cardName, count: counts[cardName] });
                        }

                        if (--pending === 0) {
                            this.updateGroupedCards(side, grouped);
                        }
                    }
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
            'Sideboard'
        ];
        const sorted: GroupedCards = {};
        order.forEach(type => {
            if (groups[type]) {
                sorted[type] = groups[type].sort((a, b) => a.name.localeCompare(b.name));
            }
        });
        return sorted;
    }

    getGroupKeys(side: 'left' | 'right'): string[] {
        return Object.keys(side === 'left' ? this.leftGroupedCards : this.rightGroupedCards);
    }

    getGroupCount(side: 'left' | 'right', group: string): number {
        const data = side === 'left' ? this.leftGroupedCards : this.rightGroupedCards;
        return data[group]?.reduce((acc, c) => acc + c.count, 0) || 0;
    }
}
