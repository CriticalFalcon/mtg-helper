import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeckCompareComponent } from './deck-compare.component';

describe('DeckCompareComponent', () => {
	let component: DeckCompareComponent;
	let fixture: ComponentFixture<DeckCompareComponent>;

	beforeEach(async () => {
		localStorage.removeItem('mtg-helper:deck-compare:left-sideboard-expanded');
		localStorage.removeItem('mtg-helper:deck-compare:right-sideboard-expanded');

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

	it('should return unioned comparison groups in display order', () => {
		component.leftGroupedCards = {
			Creatures: [{ name: 'A', count: 1 }],
			Lands: [{ name: 'Mountain', count: 1 }],
		};
		component.rightGroupedCards = {
			Commander: [{ name: 'Krenko, Mob Boss', count: 1 }],
			Artifacts: [{ name: 'Sol Ring', count: 1 }],
		};

		expect(component.getComparisonGroupKeys()).toEqual(['Commander', 'Creatures', 'Artifacts', 'Lands']);
	});

	it('should keep group rows when only one side has visible differences', () => {
		component.showDifferencesOnly = true;
		component.leftGroupedCards = {
			Creatures: [{ name: 'Goblin Instigator', count: 1 }],
		};
		component.rightGroupedCards = {};

		expect(component.shouldDisplayGroup('Creatures')).toBeTrue();
		expect(component.hasGroupCards('left', 'Creatures')).toBeTrue();
		expect(component.hasGroupCards('right', 'Creatures')).toBeFalse();
	});

	it('should keep sideboard collapsed by default', () => {
		expect(component.leftSideboardExpanded).toBeFalse();
		expect(component.rightSideboardExpanded).toBeFalse();
		expect(component.isGroupExpanded('left', 'Sideboard')).toBeFalse();
		expect(component.isGroupExpanded('right', 'Sideboard')).toBeFalse();
		expect(component.isGroupExpanded('left', 'Creatures')).toBeTrue();
	});

	it('should toggle sideboard visibility independently', () => {
		component.toggleSideboardVisibility('left');

		expect(component.leftSideboardExpanded).toBeTrue();
		expect(component.rightSideboardExpanded).toBeFalse();
		expect(component.isGroupExpanded('left', 'Sideboard')).toBeTrue();
		expect(component.isGroupExpanded('right', 'Sideboard')).toBeFalse();
	});

	it('should persist sideboard visibility per side', () => {
		component.toggleSideboardVisibility('right');

		expect(localStorage.getItem('mtg-helper:deck-compare:left-sideboard-expanded')).toBeNull();
		expect(localStorage.getItem('mtg-helper:deck-compare:right-sideboard-expanded')).toBe('true');

		const persistedComponent = TestBed.createComponent(DeckCompareComponent).componentInstance;

		expect(persistedComponent.leftSideboardExpanded).toBeFalse();
		expect(persistedComponent.rightSideboardExpanded).toBeTrue();
	});
});
