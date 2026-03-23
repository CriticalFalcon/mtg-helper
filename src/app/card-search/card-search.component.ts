import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ManaSymbolPipe } from '../shared/pipes/mana-symbol.pipe';
import { ActivatedRoute } from '@angular/router';

@Component({
	selector: 'app-card-search',
	standalone: true,
	imports: [CommonModule, FormsModule, HttpClientModule, ManaSymbolPipe],
	templateUrl: './card-search.component.html',
	styleUrls: ['./card-search.component.css']
})
export class CardSearchComponent {
	userInput: string = '';
	searchTerm: string = '';
	cardImage: string | null = null;
	hoveredPrintImage: string | null = null; // <-- New
	errorMessage: string | null = null;
	suggestions: string[] = [];
	showSuggestions: boolean = false;
	activeIndex: number = -1;
	cardName: string | null = null;
	typeLine: string | null = null;
	oracleText: string | null = null;
	prints: { setName: string; imageUrl: string }[] = [];

	constructor(private http: HttpClient, private route: ActivatedRoute) { }

	ngOnInit() {
		this.route.paramMap.subscribe(params => {
			const name = params.get('name');
			if (name) {
				this.searchTerm = name;
				this.searchCard();
			}
		});
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
					this.prints = [];

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

								const nameCounts: Record<string, number> = {};
								rawPrints.forEach((p) => {
									nameCounts[p.setName] = (nameCounts[p.setName] || 0) + 1;
								});

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
}
