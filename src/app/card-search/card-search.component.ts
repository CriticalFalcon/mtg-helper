import { Component, ElementRef, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HighlightPipe } from '../shared/pipes/highlight.pipe';

@Component({
    selector: 'app-card-search',
    standalone: true,
    imports: [CommonModule, FormsModule, HttpClientModule, HighlightPipe],
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

    constructor(private http: HttpClient, private elementRef: ElementRef) { }

    onInputChange() {
        this.userInput = this.searchTerm; // track what user types
        this.activeIndex = -1; // reset active selection on typing

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
                },
            });
    }

    handleKeyDown(event: KeyboardEvent) {
        if (!this.showSuggestions || this.suggestions.length === 0) return;

        if (event.key === 'ArrowDown') {
            // Move down in suggestions, cycling back to -1 (input box)
            if (this.activeIndex < this.suggestions.length - 1) {
                this.activeIndex++;
            } else {
                this.activeIndex = -1;
            }
            this.updateSearchTermFromActiveIndex();
            event.preventDefault();
        } else if (event.key === 'ArrowUp') {
            // Move up in suggestions, cycling to last if at -1 (input box)
            if (this.activeIndex === -1) {
                this.activeIndex = this.suggestions.length - 1;
            } else {
                this.activeIndex--;
            }
            this.updateSearchTermFromActiveIndex();
            event.preventDefault();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (this.activeIndex >= 0 && this.activeIndex < this.suggestions.length) {
                this.selectSuggestion(this.suggestions[this.activeIndex]);
            } else {
                this.searchCard();
            }
        }
    }

    selectSuggestion(suggestion: string) {
        this.searchTerm = suggestion;
        this.userInput = suggestion; // sync user input too
        this.suggestions = [];
        this.showSuggestions = false;
        this.activeIndex = -1;
        this.searchCard();
    }

    searchCard() {
        if (!this.searchTerm.trim()) {
            this.errorMessage = "Please enter a card name.";
            this.cardImage = null;
            return;
        }

        this.suggestions = [];
        this.showSuggestions = false;
        this.activeIndex = -1;

        this.http.get<any>(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(this.searchTerm)}`)
            .subscribe({
                next: (data) => {
                    this.cardImage = data.image_uris?.normal || (data.card_faces ? data.card_faces[0].image_uris.normal : null);
                    this.errorMessage = null;
                },
                error: () => {
                    this.errorMessage = "Card not found. Try again.";
                    this.cardImage = null;
                }
            });
    }

    /** Detect clicks outside the component */
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
            // If activeIndex is -1 (no suggestion selected), show what user typed
            this.searchTerm = this.userInput;
        }
    }

    onInputFocus() {
        // Show suggestions if any when focusing input
        if (this.suggestions.length > 0) {
            this.showSuggestions = true;
            this.activeIndex = -1;
            this.searchTerm = this.userInput; // Reset input text to user input on focus
        }
    }

    onInputBlur() {
        // Delay hiding suggestions to allow click event on suggestion to register first
        setTimeout(() => {
            this.showSuggestions = false;
            this.activeIndex = -1;
        }, 150); // 150ms delay is usually enough, adjust as needed
    }

    onSuggestionClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        const li = target.closest('li');
        if (!li) return;
        const index = Array.from(li.parentElement!.children).indexOf(li);
        if (index >= 0 && index < this.suggestions.length) {
            this.selectSuggestion(this.suggestions[index]);
        }
    }

}
