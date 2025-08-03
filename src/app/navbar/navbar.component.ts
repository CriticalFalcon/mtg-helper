import { Component, ElementRef, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HighlightPipe } from '../shared/pipes/highlight.pipe';
import { Router, RouterModule } from '@angular/router';

@Component({
    selector: 'app-navbar',
    standalone: true,
    imports: [CommonModule, FormsModule, HighlightPipe, RouterModule],
    templateUrl: './navbar.component.html',
    styleUrls: ['./navbar.component.css']
})
export class NavbarComponent {
    searchTerm: string = '';
    userInput: string = '';
    suggestions: string[] = [];
    showSuggestions: boolean = false;
    activeIndex: number = -1;

    constructor(private http: HttpClient, private elementRef: ElementRef, private router: Router) { }

    onInputChange() {
        this.userInput = this.searchTerm;
        this.activeIndex = -1;

        if (this.userInput.length < 2) {
            this.suggestions = [];
            this.showSuggestions = false;
            return;
        }

        this.http.get<any>(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(this.userInput)}`)
            .subscribe({
                next: (data) => {
                    this.suggestions = (data.data || []).slice(0, 10);
                    this.showSuggestions = this.suggestions.length > 0;
                },
                error: () => {
                    this.suggestions = [];
                    this.showSuggestions = false;
                }
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
                this.onSearch();
            }
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

    selectSuggestion(suggestion: string) {
        this.searchTerm = suggestion;
        this.userInput = suggestion;
        this.showSuggestions = false;
        this.activeIndex = -1;
        this.onSearch();
    }

    onSearch() {
        if (!this.searchTerm.trim()) return;
        this.showSuggestions = false;
        this.router.navigate(['/card', this.searchTerm]);
    }

    @HostListener('document:click', ['$event'])
    onClickOutside(event: MouseEvent) {
        if (!this.elementRef.nativeElement.contains(event.target)) {
            this.showSuggestions = false;
        }
    }
}
