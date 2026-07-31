import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';

import { CardSearchComponent } from './card-search.component';

describe('CardSearchComponent', () => {
	let component: CardSearchComponent;
	let fixture: ComponentFixture<CardSearchComponent>;
	const http = (...values: any[]) => spyOn((component as any).http, 'get').and.returnValues(...values);

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [CardSearchComponent],
			providers: [provideRouter([])],
		}).compileComponents();
		fixture = TestBed.createComponent(CardSearchComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create and respond to route parameters', () => {
		spyOn(component, 'searchCard');
		(component as any).route = { paramMap: of(convertToParamMap({ name: 'Sol Ring' })) };
		component.ngOnInit();
		expect(component.searchTerm).toBe('Sol Ring');
		expect(component.searchCard).toHaveBeenCalled();
	});

	it('should cover empty, successful, print-error, and search-error searches', () => {
		component.searchTerm = ' ';
		component.cardImage = component.cardName = component.typeLine = component.oracleText = 'x';
		component.prints = [{ setName: 'Set', imageUrl: 'url' }];
		component.searchCard();
		expect(component.errorMessage).toBe('Please enter a card name.');
		expect(component.prints).toEqual([]);

		spyOn(localStorage, 'getItem').and.returnValue(null);
		component.ngOnInit();

		component.searchTerm = 'Sol Ring';
		component.advancedFilters.selectedColors = ['U', 'W'];
		component.advancedFilters.colorMode = 'includes';
		component.advancedFilters.manaValueMin = 1;
		component.advancedFilters.manaValueMax = 3;
		component.advancedFilters.typeQuery = 'Artifact';
		component.advancedFilters.oracleQuery = 'add mana';
		component.advancedFilters.legalityFormat = 'commander';
		component.advancedFilters.legalityState = 'legal';
		component.advancedFilters.setCode = 'cmm';
		component.advancedFilters.rarity = 'rare';
		component.advancedFilters.priceMin = 1;
		component.advancedFilters.priceMax = 8;

		http(
			of({
				data: [
					{
						id: 'card-1',
						name: 'Fire // Ice',
						card_faces: [{ image_uris: { normal: 'face-image' }, oracle_text: 'Deal damage.' }],
						type_line: 'Instant',
						prints_search_uri: 'prints-url',
					},
				],
			}),
			of({
				data: [
					{ set_name: 'Double Masters', collector_number: '1', image_uris: { large: 'large-1' } },
					{ set_name: 'Double Masters', collector_number: '2', image_uris: { large: 'large-2' } },
					{ set_name: 'No Image', collector_number: '3' },
					{ set_name: 'Unique Set', collector_number: '4', image_uris: { large: 'large-4' } },
				],
			}),
			of({
				data: [
					{
						id: 'card-2',
						name: 'Sol Ring',
						image_uris: { normal: 'normal-image' },
						type_line: 'Artifact',
						oracle_text: 'Add mana.',
					},
				],
			}),
			of({
				data: [
					{
						id: 'card-3',
						name: 'Opt',
						image_uris: { normal: 'normal-image' },
						type_line: 'Instant',
						oracle_text: 'Scry 1.',
						prints_search_uri: 'prints-url',
					},
				],
			}),
			throwError(() => new Error('print error')),
			throwError(() => new Error('not found'))
		);

		component.suggestions = ['Fire'];
		component.showSuggestions = true;
		component.activeIndex = 0;
		component.searchCard();
		expect((component as any).http.get).toHaveBeenCalledWith(
			jasmine.stringMatching(
				/cards\/search\?q=.*name%3A%22Sol%20Ring%22.*id%3E%3Duw.*mv%3E%3D1.*mv%3C%3D3.*type%3A%22Artifact%22.*o%3A%22add%20mana%22.*legal%3Acommander.*set%3Acmm.*rarity%3Arare.*usd%3E%3D1.*usd%3C%3D8/
			)
		);
		expect(component.cardImage).toBe('face-image');
		expect(component.prints).toEqual([
			{ setName: 'Double Masters #1', imageUrl: 'large-1' },
			{ setName: 'Double Masters #2', imageUrl: 'large-2' },
			{ setName: 'Unique Set', imageUrl: 'large-4' },
		]);

		component.searchTerm = 'Sol Ring';
		component.clearFilters();
		component.searchCard();
		expect(component.prints).toEqual([]);

		component.searchTerm = 'Opt';
		component.searchCard();
		expect(component.prints).toEqual([]);

		component.searchTerm = 'Missing';
		component.searchCard();
		expect(component.errorMessage).toBe('Could not complete search. Please try again.');
		expect(component.cardImage).toBeNull();
		expect(component.isSearching).toBeFalse();
	});

	it('should save, apply, and delete presets', () => {
		const getItemSpy = spyOn(localStorage, 'getItem').and.returnValue(null);
		const setItemSpy = spyOn(localStorage, 'setItem');

		component.ngOnInit();
		expect(getItemSpy).toHaveBeenCalled();

		component.searchTerm = 'Counterspell';
		component.advancedFilters.typeQuery = 'Instant';
		component.advancedFilters.rarity = 'common';
		component.presetName = 'Blue Stack';
		component.saveCurrentPreset();

		expect(component.savedPresets.length).toBe(1);
		expect(component.savedPresets[0].name).toBe('Blue Stack');
		expect(setItemSpy).toHaveBeenCalled();

		component.searchTerm = '';
		component.clearFilters();
		component.applyPreset('Blue Stack');
		expect(component.searchTerm).toBe('Counterspell');
		expect(component.advancedFilters.typeQuery).toBe('Instant');
		expect(component.advancedFilters.rarity).toBe('common');

		component.selectedPresetName = 'Blue Stack';
		component.deletePreset('Blue Stack');
		expect(component.savedPresets.length).toBe(0);
	});
});
