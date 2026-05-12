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

	it('should cover empty, successful, print-error, and card-error searches', () => {
		component.searchTerm = ' ';
		component.cardImage = component.cardName = component.typeLine = component.oracleText = 'x';
		component.prints = [{ setName: 'Set', imageUrl: 'url' }];
		component.searchCard();
		expect(component.errorMessage).toBe('Please enter a card name.');
		expect(component.prints).toEqual([]);

		http(
			of({
				name: 'Fire // Ice',
				card_faces: [{ image_uris: { normal: 'face-image' } }],
				type_line: 'Instant',
				oracle_text: 'Deal damage.',
				prints_search_uri: 'prints-url',
			}),
			of({
				data: [
					{ set_name: 'Double Masters', collector_number: '1', image_uris: { large: 'large-1' } },
					{ set_name: 'Double Masters', collector_number: '2', image_uris: { large: 'large-2' } },
					{ set_name: 'No Image', collector_number: '3' },
					{ set_name: 'Unique Set', collector_number: '4', image_uris: { large: 'large-4' } },
				],
			}),
			of({ name: 'Sol Ring', image_uris: { normal: 'normal-image' }, type_line: 'Artifact', oracle_text: 'Add mana.' }),
			of({ name: 'Opt', image_uris: { normal: 'normal-image' }, type_line: 'Instant', oracle_text: 'Scry 1.', prints_search_uri: 'prints-url' }),
			throwError(() => new Error('print error')),
			throwError(() => new Error('not found'))
		);

		component.searchTerm = 'Fire Ice';
		component.suggestions = ['Fire'];
		component.showSuggestions = true;
		component.activeIndex = 0;
		component.searchCard();
		expect(component.cardImage).toBe('face-image');
		expect(component.prints).toEqual([
			{ setName: 'Double Masters #1', imageUrl: 'large-1' },
			{ setName: 'Double Masters #2', imageUrl: 'large-2' },
			{ setName: 'Unique Set', imageUrl: 'large-4' },
		]);

		component.searchTerm = 'Sol Ring';
		component.searchCard();
		expect(component.prints).toEqual([]);

		component.searchTerm = 'Opt';
		component.searchCard();
		expect(component.prints).toEqual([]);

		component.searchTerm = 'Missing';
		component.searchCard();
		expect(component.errorMessage).toBe('Card not found. Try again.');
		expect(component.cardImage).toBeNull();
	});
});
