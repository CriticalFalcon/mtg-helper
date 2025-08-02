import { Component, ElementRef, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HighlightPipe } from '../shared/pipes/highlight.pipe';
import { ManaSymbolPipe } from '../shared/pipes/mana-symbol.pipe';

@Component({
    selector: 'app-card-search',
    standalone: true,
    imports: [CommonModule, FormsModule, HttpClientModule, HighlightPipe, ManaSymbolPipe],
    templateUrl: './card-search.component.html',
    styleUrls: ['./card-search.component.css']
})
export class CardSearchComponent {
    userInput: string = '';
    searchTerm: string = '';
    cardImage: string | null = null;
    errorMessage: string | null = null;
    suggestions: string[] = [];
    showSuggestions: boolean = false;
    activeIndex: number = -1;
    cardName: string | null = null;
    typeLine: string | null = null;
    oracleText: string | null = null;
    prints: { setName: string; imageUrl: string }[] = [];

    constructor(private http: HttpClient, private elementRef: ElementRef) { }

    onInputChange() {
        this.userInput = this.searchTerm;
        this.activeIndex = -1;

        if (this.userInput.length < 2) {
            this.suggestions = [];
            this.showSuggestions = false;
            return;
        }

        this.http
            .get<any>(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(this.userInput)}`)
            .subscribe({
                next: (data) => {
                    this.suggestions = (data.data || []).slice(0, 10);
                    this.showSuggestions = this.suggestions.length > 0;
                },
                error: () => {
                    this.suggestions = [];
                    this.showSuggestions = false;
                    this.cardName = null;
                    this.typeLine = null;
                    this.oracleText = null;
                    this.prints = [];
                },
            });
    }

    handleKeyDown(event: KeyboardEvent) {
        if (!this.showSuggestions || this.suggestions.length === 0) return;

        if (event.key === 'ArrowDown') {
            if (this.activeIndex < this.suggestions.length - 1) {
                this.activeIndex++;
            } else {
                this.activeIndex = -1;
            }
            this.updateSearchTermFromActiveIndex();
            event.preventDefault();
        }
        else if (event.key === 'ArrowUp') {
            if (this.activeIndex === -1) {
                this.activeIndex = this.suggestions.length - 1;
            } else {
                this.activeIndex--;
            }
            this.updateSearchTermFromActiveIndex();
            event.preventDefault();
        }
        else if (event.key === 'Enter') {
            event.preventDefault();
            if (this.activeIndex >= 0 && this.activeIndex < this.suggestions.length) {
                this.selectSuggestion(this.suggestions[this.activeIndex]);
            } else {
                this.searchCard();
            }
        }
        else if (event.key === 'Escape') {
            event.preventDefault();
            this.showSuggestions = false;
            this.activeIndex = -1;
            this.searchTerm = this.userInput;
            const input = this.elementRef.nativeElement.querySelector('input');
            if (input) input.focus();
        }
    }

    selectSuggestion(suggestion: string) {
        this.searchTerm = suggestion;
        this.userInput = suggestion;
        this.suggestions = [];
        this.showSuggestions = false;
        this.activeIndex = -1;
        this.searchCard();
    }

    searchCard() {
        if (!this.searchTerm.trim()) {
            this.errorMessage = "Please enter a card name.";
            this.cardImage = null;
            this.cardName = null;
            this.typeLine = null;
            this.oracleText = null;
            this.prints = [];
            return;
        }

        this.suggestions = [];
        this.showSuggestions = false;
        this.activeIndex = -1;

        this.http.get<any>(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(this.searchTerm)}`)
            .subscribe({
                next: (data) => {
                    this.cardImage = data.image_uris?.normal || (data.card_faces ? data.card_faces[0].image_uris.normal : null);
                    this.cardName = data.name;
                    this.typeLine = data.type_line;
                    this.oracleText = data.oracle_text;
                    this.errorMessage = null;

                    // Fetch prints
                    if (data.prints_search_uri) {
                        this.http.get<any>(data.prints_search_uri).subscribe({
                            next: (printsData) => {
                                interface PrintData {
                                    set_name: string;
                                    collector_number: string;
                                    image_uris?: { large: string };
                                }

                                const rawPrints: { setName: string; collectorNumber: string; imageUrl: string }[] =
                                    (printsData.data as PrintData[])
                                        .filter((p) => p.image_uris?.large)
                                        .map((p) => ({
                                            setName: p.set_name,
                                            collectorNumber: p.collector_number,
                                            imageUrl: p.image_uris!.large
                                        }));

                                // Count duplicates
                                const nameCounts: Record<string, number> = {};
                                rawPrints.forEach((p) => {
                                    nameCounts[p.setName] = (nameCounts[p.setName] || 0) + 1;
                                });

                                // Append collector_number if duplicates
                                this.prints = rawPrints.map((p) => ({
                                    setName: nameCounts[p.setName] > 1 ? `${p.setName} #${p.collectorNumber}` : p.setName,
                                    imageUrl: p.imageUrl
                                }));
                            },
                            error: () => this.prints = []
                        });
                    } else {
                        this.prints = [];
                    }
                },
                error: () => {
                    this.errorMessage = "Card not found. Try again.";
                    this.cardImage = null;
                    this.cardName = null;
                    this.typeLine = null;
                    this.oracleText = null;
                    this.prints = [];
                }
            });
    }

    @HostListener('document:click', ['$event'])
    onClickOutside(event: MouseEvent) {
        if (!this.elementRef.nativeElement.contains(event.target)) {
            this.showSuggestions = false;
        }
    }

    updateSearchTermFromActiveIndex() {
        if (this.activeIndex >= 0 && this.activeIndex < this.suggestions.length) {
            this.searchTerm = this.suggestions[this.activeIndex];
        } else {
            this.searchTerm = this.userInput;
        }
    }

    onInputFocus() {
        if (this.suggestions.length > 0) {
            this.showSuggestions = true;
            this.activeIndex = -1;
            this.searchTerm = this.userInput;
        }
    }

    onInputBlur() {
        setTimeout(() => {
            this.showSuggestions = false;
            this.activeIndex = -1;
        }, 150);
    }
}
