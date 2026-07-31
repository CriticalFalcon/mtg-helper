import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';

import { ManaSymbolPipe } from '../shared/pipes/mana-symbol.pipe';
import { ActivatedRoute } from '@angular/router';

type ColorMode = 'includes' | 'exact' | 'any';
type LegalityState = 'legal' | 'not_legal' | 'banned' | 'restricted';

interface AdvancedSearchFilters {
	selectedColors: string[];
	colorMode: ColorMode;
	manaValueMin: number | null;
	manaValueMax: number | null;
	typeQuery: string;
	oracleQuery: string;
	legalityFormat: string;
	legalityState: LegalityState;
	setCode: string;
	rarity: string;
	priceMin: number | null;
	priceMax: number | null;
}

interface SavedSearchPreset {
	name: string;
	searchTerm: string;
	filters: AdvancedSearchFilters;
}

interface ScryfallCard {
	id: string;
	name: string;
	type_line?: string;
	oracle_text?: string;
	mana_cost?: string;
	set_name?: string;
	rarity?: string;
	prices?: { usd?: string | null };
	image_uris?: { normal?: string; large?: string };
	card_faces?: Array<{ image_uris?: { normal?: string }; oracle_text?: string }>;
	prints_search_uri?: string;
}

@Component({
	selector: 'app-card-search',
	standalone: true,
	imports: [FormsModule, HttpClientModule, ManaSymbolPipe],
	templateUrl: './card-search.component.html',
	styleUrls: ['./card-search.component.css'],
})
export class CardSearchComponent {
	userInput: string = '';
	searchTerm: string = '';
	cardImage: string | null = null;
	hoveredPrintImage: string | null = null;
	errorMessage: string | null = null;
	presetMessage: string | null = null;
	suggestions: string[] = [];
	showSuggestions: boolean = false;
	activeIndex: number = -1;
	cardName: string | null = null;
	typeLine: string | null = null;
	oracleText: string | null = null;
	prints: { setName: string; imageUrl: string }[] = [];
	searchResults: ScryfallCard[] = [];
	isSearching: boolean = false;
	selectedCardId: string | null = null;
	presetName: string = '';
	selectedPresetName: string = '';
	savedPresets: SavedSearchPreset[] = [];

	readonly colorOptions = ['W', 'U', 'B', 'R', 'G'];
	readonly legalityFormats = ['Commander', 'Standard', 'Pioneer', 'Modern', 'Legacy', 'Vintage', 'Pauper'];
	readonly rarityOptions = ['common', 'uncommon', 'rare', 'mythic'];

	advancedFilters: AdvancedSearchFilters = this.getDefaultFilters();

	private readonly presetStorageKey = 'mtgHelper.cardSearch.presets';

	constructor(
		private http: HttpClient,
		private route: ActivatedRoute
	) {}

	ngOnInit() {
		this.loadPresets();

		this.route.paramMap.subscribe((params) => {
			const name = params.get('name');
			if (name) {
				this.searchTerm = name;
				this.searchCard();
			}
		});
	}

	searchCard() {
		const query = this.buildSearchQuery();

		if (!query) {
			this.isSearching = false;
			this.errorMessage = 'Please enter a card name.';
			this.clearResults();
			this.clearCardDetails();
			return;
		}

		this.presetMessage = null;
		this.isSearching = true;
		this.errorMessage = null;
		this.suggestions = [];
		this.showSuggestions = false;
		this.activeIndex = -1;

		const encodedQuery = encodeURIComponent(query);
		const url = `https://api.scryfall.com/cards/search?q=${encodedQuery}&unique=cards&order=name`;

		this.http
			.get<any>(url)
			.pipe(
				finalize(() => {
					this.isSearching = false;
				})
			)
			.subscribe({
				next: (data) => {
					this.searchResults = (data?.data || []) as ScryfallCard[];

					if (!this.searchResults.length) {
						this.errorMessage = 'No cards matched the current filters.';
						this.clearCardDetails();
						return;
					}

					this.selectCard(this.searchResults[0]);
				},
				error: (error) => {
					this.clearResults();
					this.clearCardDetails();
					this.errorMessage =
						error?.status === 404
							? 'No cards matched the current filters.'
							: 'Could not complete search. Please try again.';
				},
			});
	}

	selectCard(card: ScryfallCard) {
		this.selectedCardId = card.id;
		this.cardImage = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || null;
		this.cardName = card.name;
		this.typeLine = card.type_line || null;
		this.oracleText =
			card.oracle_text || card.card_faces?.map((face) => face.oracle_text || '').join('\n\n') || null;
		this.errorMessage = null;
		this.prints = [];

		if (card.prints_search_uri) {
			this.loadPrints(card.prints_search_uri);
		}
	}

	toggleColor(color: string) {
		const current = new Set(this.advancedFilters.selectedColors);
		if (current.has(color)) {
			current.delete(color);
		} else {
			current.add(color);
		}
		this.advancedFilters.selectedColors = Array.from(current);
	}

	isColorSelected(color: string): boolean {
		return this.advancedFilters.selectedColors.includes(color);
	}

	clearFilters() {
		this.advancedFilters = this.getDefaultFilters();
	}

	saveCurrentPreset() {
		const trimmedName = this.presetName.trim();
		if (!trimmedName) {
			this.presetMessage = 'Preset name is required.';
			return;
		}

		const preset: SavedSearchPreset = {
			name: trimmedName,
			searchTerm: this.searchTerm.trim(),
			filters: this.cloneFilters(this.advancedFilters),
		};

		const existingIndex = this.savedPresets.findIndex(
			(item) => item.name.toLowerCase() === trimmedName.toLowerCase()
		);
		if (existingIndex >= 0) {
			this.savedPresets[existingIndex] = preset;
		} else {
			this.savedPresets.push(preset);
		}

		this.savedPresets.sort((a, b) => a.name.localeCompare(b.name));
		this.selectedPresetName = preset.name;
		this.presetName = '';
		this.persistPresets();
		this.presetMessage = `Saved preset "${preset.name}".`;
	}

	applyPreset(name: string) {
		const preset = this.savedPresets.find((item) => item.name === name);
		if (!preset) {
			return;
		}

		this.searchTerm = preset.searchTerm;
		this.advancedFilters = this.cloneFilters(preset.filters);
		this.presetMessage = `Loaded preset "${preset.name}".`;
	}

	deletePreset(name: string) {
		const initialLength = this.savedPresets.length;
		this.savedPresets = this.savedPresets.filter((item) => item.name !== name);
		if (this.savedPresets.length === initialLength) {
			return;
		}

		if (this.selectedPresetName === name) {
			this.selectedPresetName = '';
		}

		this.persistPresets();
		this.presetMessage = `Deleted preset "${name}".`;
	}

	private buildSearchQuery(): string {
		const filters = this.advancedFilters;
		const parts: string[] = [];

		if (this.searchTerm.trim()) {
			parts.push(`name:${this.quoteValue(this.searchTerm.trim())}`);
		}

		if (filters.selectedColors.length) {
			const colors = [...filters.selectedColors].sort().map((color) => color.toLowerCase());
			const joinedColors = colors.join('');

			if (filters.colorMode === 'exact') {
				parts.push(`id=${joinedColors}`);
			} else if (filters.colorMode === 'any') {
				parts.push(`(${colors.map((color) => `id:${color}`).join(' or ')})`);
			} else {
				parts.push(`id>=${joinedColors}`);
			}
		}

		if (filters.manaValueMin !== null && !Number.isNaN(filters.manaValueMin)) {
			parts.push(`mv>=${filters.manaValueMin}`);
		}

		if (filters.manaValueMax !== null && !Number.isNaN(filters.manaValueMax)) {
			parts.push(`mv<=${filters.manaValueMax}`);
		}

		if (filters.typeQuery.trim()) {
			parts.push(`type:${this.quoteValue(filters.typeQuery.trim())}`);
		}

		if (filters.oracleQuery.trim()) {
			parts.push(`o:${this.quoteValue(filters.oracleQuery.trim())}`);
		}

		if (filters.legalityFormat) {
			switch (filters.legalityState) {
				case 'legal':
					parts.push(`legal:${filters.legalityFormat}`);
					break;
				case 'banned':
					parts.push(`banned:${filters.legalityFormat}`);
					break;
				case 'restricted':
					parts.push(`restricted:${filters.legalityFormat}`);
					break;
				case 'not_legal':
					parts.push(`-legal:${filters.legalityFormat}`);
					parts.push(`-banned:${filters.legalityFormat}`);
					parts.push(`-restricted:${filters.legalityFormat}`);
					break;
			}
		}

		if (filters.setCode.trim()) {
			parts.push(`set:${filters.setCode.trim().toLowerCase()}`);
		}

		if (filters.rarity.trim()) {
			parts.push(`rarity:${filters.rarity.trim().toLowerCase()}`);
		}

		if (filters.priceMin !== null && !Number.isNaN(filters.priceMin)) {
			parts.push(`usd>=${filters.priceMin}`);
		}

		if (filters.priceMax !== null && !Number.isNaN(filters.priceMax)) {
			parts.push(`usd<=${filters.priceMax}`);
		}

		return parts.join(' ').trim();
	}

	private loadPrints(printsUri: string) {
		this.http.get<any>(printsUri).subscribe({
			next: (printsData) => {
				interface PrintData {
					set_name: string;
					collector_number: string;
					image_uris?: { large?: string };
				}

				const rawPrints: { setName: string; collectorNumber: string; imageUrl: string }[] = (
					(printsData?.data || []) as PrintData[]
				)
					.filter((print) => !!print.image_uris?.large)
					.map((print) => ({
						setName: print.set_name,
						collectorNumber: print.collector_number,
						imageUrl: print.image_uris!.large!,
					}));

				const nameCounts: Record<string, number> = {};
				rawPrints.forEach((print) => {
					nameCounts[print.setName] = (nameCounts[print.setName] || 0) + 1;
				});

				this.prints = rawPrints.map((print) => ({
					setName:
						nameCounts[print.setName] > 1 ? `${print.setName} #${print.collectorNumber}` : print.setName,
					imageUrl: print.imageUrl,
				}));
			},
			error: () => {
				this.prints = [];
			},
		});
	}

	private clearResults() {
		this.searchResults = [];
		this.selectedCardId = null;
	}

	private clearCardDetails() {
		this.cardImage = null;
		this.cardName = null;
		this.typeLine = null;
		this.oracleText = null;
		this.prints = [];
	}

	private getDefaultFilters(): AdvancedSearchFilters {
		return {
			selectedColors: [],
			colorMode: 'includes',
			manaValueMin: null,
			manaValueMax: null,
			typeQuery: '',
			oracleQuery: '',
			legalityFormat: '',
			legalityState: 'legal',
			setCode: '',
			rarity: '',
			priceMin: null,
			priceMax: null,
		};
	}

	private quoteValue(value: string): string {
		return `"${value.replace(/"/g, '\\"')}"`;
	}

	private cloneFilters(filters: AdvancedSearchFilters): AdvancedSearchFilters {
		return {
			...filters,
			selectedColors: [...filters.selectedColors],
		};
	}

	private loadPresets() {
		try {
			const rawValue = localStorage.getItem(this.presetStorageKey);
			if (!rawValue) {
				this.savedPresets = [];
				return;
			}

			const parsed = JSON.parse(rawValue) as SavedSearchPreset[];
			this.savedPresets = Array.isArray(parsed)
				? parsed
						.filter((preset) => preset && preset.name && preset.filters)
						.map((preset) => ({
							name: String(preset.name),
							searchTerm: String(preset.searchTerm || ''),
							filters: {
								...this.getDefaultFilters(),
								...preset.filters,
								selectedColors: Array.isArray(preset.filters.selectedColors)
									? preset.filters.selectedColors.filter((color) => this.colorOptions.includes(color))
									: [],
							},
						}))
				: [];
		} catch {
			this.savedPresets = [];
		}
	}

	private persistPresets() {
		try {
			localStorage.setItem(this.presetStorageKey, JSON.stringify(this.savedPresets));
		} catch {
			this.presetMessage = 'Could not persist presets in this browser.';
		}
	}
}
