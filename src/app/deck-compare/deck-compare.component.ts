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
        const lines = rawList.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        // Determine if commander deck by length
        const isCommanderDeck = lines.length >= 100;

        // Extract commander card name if commander deck
        let commanderName = '';
        if (isCommanderDeck) {
            // Parse last line's card name similarly to others
            const lastLine = lines[lines.length - 1];
            const match = lastLine.match(/^(\d+)x?\s+(.+)$/i);
            commanderName = match ? match[2] : lastLine;
            commanderName = commanderName.trim().toLowerCase();
        }

        const cardCounts: { [name: string]: number } = {};

        for (const line of lines) {
            const match = line.match(/^(\d+)x?\s+(.+)$/i);
            if (match) {
                const count = parseInt(match[1], 10);
                const name = match[2];
                cardCounts[name] = (cardCounts[name] || 0) + count;
            } else {
                cardCounts[line] = (cardCounts[line] || 0) + 1;
            }
        }

        const grouped: GroupedCards = {};
        Object.keys(cardCounts).forEach(cardName => {
            this.http.get<any>(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`)
                .subscribe({
                    next: data => {
                        const typeLine = data.card_faces?.[0]?.type_line || data.type_line || 'Other';
                        let group = this.mapTypeToGroup(typeLine);

                        // If commander deck and this card is commander, override group
                        if (isCommanderDeck && cardName.toLowerCase() === commanderName) {
                            group = 'Commander';
                        }

                        if (!grouped[group]) grouped[group] = [];

                        // Merge duplicates (case-insensitive)
                        const existing = grouped[group].find(c => c.name.toLowerCase() === data.name.toLowerCase());
                        if (existing) {
                            existing.count += cardCounts[cardName];
                        } else {
                            grouped[group].push({ name: data.name, count: cardCounts[cardName] });
                        }

                        if (side === 'left') {
                            this.leftGroupedCards = this.sortGroups(grouped);
                        } else {
                            this.rightGroupedCards = this.sortGroups(grouped);
                        }
                    },
                    error: () => {
                        const group = 'Unknown';
                        if (!grouped[group]) grouped[group] = [];

                        const existing = grouped[group].find(c => c.name.toLowerCase() === cardName.toLowerCase());
                        if (existing) {
                            existing.count += cardCounts[cardName];
                        } else {
                            grouped[group].push({ name: cardName, count: cardCounts[cardName] });
                        }

                        if (side === 'left') {
                            this.leftGroupedCards = this.sortGroups(grouped);
                        } else {
                            this.rightGroupedCards = this.sortGroups(grouped);
                        }
                    }
                });
        });
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
        const order = ['Commander', 'Battles', 'Planeswalkers', 'Creatures', 'Sorceries', 'Instants', 'Artifacts', 'Enchantments', 'Lands', 'Other', 'Unknown'];
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
