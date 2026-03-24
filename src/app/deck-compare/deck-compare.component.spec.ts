import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeckCompareComponent } from './deck-compare.component';

describe('DeckCompareComponent', () => {
	let component: DeckCompareComponent;
	let fixture: ComponentFixture<DeckCompareComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [DeckCompareComponent]
		})
			.compileComponents();

		fixture = TestBed.createComponent(DeckCompareComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	it('should ignore Archidekt token and extras entries', () => {
		const tokenEntry = {
			card: {
				oracleCard: {
					name: 'Goblin',
					layout: 'token',
				},
			},
			categories: ['Tokens & Extras'],
		};

		expect((component as any).isArchidektAuxiliaryCard(tokenEntry)).toBeTrue();
	});

	it('should keep normal cards even when user categories mention tokens', () => {
		const normalEntry = {
			card: {
				oracleCard: {
					name: 'Goblin Instigator',
					layout: 'normal',
				},
			},
			categories: ['Tokens'],
		};

		expect((component as any).isArchidektAuxiliaryCard(normalEntry)).toBeFalse();
	});
});
