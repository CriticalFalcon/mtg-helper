import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';

import { DeckCompareComponent } from './deck-compare.component';

describe('DeckCompareComponent', () => {
	let component: DeckCompareComponent;
	let fixture: ComponentFixture<DeckCompareComponent>;

	const cards: Record<string, any> = {
		'Krenko, Mob Boss': { name: 'Krenko, Mob Boss', type_line: 'Legendary Creature - Goblin', legalities: { commander: 'legal' } },
		'Sol Ring': { name: 'Sol Ring', type_line: 'Artifact' },
		'Lightning Bolt': { name: 'Lightning Bolt', type_line: 'Instant' },
		'Forest': { name: 'Forest', type_line: 'Basic Land - Forest' },
		'Battle Card': { name: 'Battle Card', type_line: 'Battle - Siege' },
		Jace: { name: 'Jace', type_line: 'Legendary Planeswalker - Jace', legalities: { commander: 'legal' } },
		Cultivate: { name: 'Cultivate', type_line: 'Sorcery' },
		'Rhystic Study': { name: 'Rhystic Study', type_line: 'Enchantment' },
		Mystery: null,
	};
	const stubCards = () => spyOn<any>(component, 'getScryfallCard').and.callFake((name: string) => of(cards[name] ?? null));
	const http = (...values: any[]) => spyOn((component as any).http, 'get').and.returnValues(...values);

	beforeEach(async () => {
		localStorage.removeItem('mtg-helper:deck-compare:left-sideboard-expanded');
		localStorage.removeItem('mtg-helper:deck-compare:right-sideboard-expanded');
		await TestBed.configureTestingModule({ imports: [DeckCompareComponent] }).compileComponents();
		fixture = TestBed.createComponent(DeckCompareComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create and handle UI helper state', () => {
		expect(component).toBeTruthy();
		expect((component as any).isArchidektAuxiliaryCard({ card: { oracleCard: { layout: 'token' } }, categories: ['Tokens & Extras'] })).toBeTrue();
		expect((component as any).isArchidektAuxiliaryCard({ card: { oracleCard: { layout: 'normal' } }, categories: ['Tokens'] })).toBeFalse();

		component.leftGroupedCards = { Creatures: [{ name: 'B', count: 1 }, { name: 'A', count: 2 }], Lands: [{ name: 'Forest', count: 1 }] };
		component.rightGroupedCards = { Commander: [{ name: 'Krenko, Mob Boss', count: 1 }], Artifacts: [{ name: 'Sol Ring', count: 1 }] };
		expect(component.getComparisonGroupKeys()).toEqual(['Commander', 'Creatures', 'Artifacts', 'Lands']);
		expect(component.isGroupExpanded('left', 'Sideboard')).toBeFalse();
		expect(component.isGroupExpanded('left', 'Creatures')).toBeTrue();
		component.toggleSideboardVisibility('left');
		component.toggleSideboardVisibility('right');
		expect(TestBed.createComponent(DeckCompareComponent).componentInstance.rightSideboardExpanded).toBeTrue();

		spyOnProperty(window, 'innerWidth').and.returnValue(300);
		spyOnProperty(window, 'innerHeight').and.returnValue(300);
		component.onMouseMove({ clientX: 290, clientY: 5 } as MouseEvent);
		expect(component.hoverCardPosition.y).toBe(10);
		component.onMouseMove({ clientX: 290, clientY: 290 } as MouseEvent);
		expect(component.hoverCardPosition).toEqual({ x: 40, y: -60 });

		stubCards();
		(cards['Sol Ring'] as any).image_uris = { normal: 'image' };
		component.onCardHover('Sol Ring');
		expect(component.hoveredCardImage).toBe('image');
		component.onCardHover('Mystery');
		component.onCardLeave();
		expect(component.hoveredCardImage).toBeNull();
	});

	it('should import remote decks and handle errors', () => {
		stubCards();
		http(
			of({
				name: 'Mox Deck',
				boards: {
					commanders: { a: { card: { name: 'Krenko, Mob Boss' }, quantity: 1 } },
					mainboard: { b: { card: { name: 'Sol Ring' }, quantity: 2 } },
					sideboard: { c: { card: { name: 'Lightning Bolt' }, quantity: 1 } },
					tokens: { d: { card: { name: 'Token' }, quantity: 1 } },
				},
			}),
			of({
				deckName: 'Arch Deck',
				cards: [
					{ card: { oracleCard: { name: 'Jace', layout: 'normal' } }, quantity: 1, categories: ['Commander'] },
					{ card: { oracleCard: { name: 'Forest', layout: 'normal' } }, quantity: 3, categories: [] },
					{ card: { oracleCard: { name: 'Cultivate', layout: 'normal' } }, quantity: 1, categories: ['Maybeboard'] },
					{ card: { oracleCard: { name: 'Token', layout: 'token' } }, quantity: 1, categories: [] },
				],
			}),
			throwError(() => new Error('mox')),
			throwError(() => new Error('arch')),
			of({ name: 'Empty Right', boards: {} }),
			throwError(() => new Error('right mox'))
		);

		component.importFromUrl('', 'left');
		component.importFromUrl('https://example.com/deck', 'right');
		component.importFromUrl('https://moxfield.com/decks/abc_123', 'left');
		component.importFromUrl('https://archidekt.com/decks/42/test', 'right');
		expect(component.leftDeckTitle).toBe('Mox Deck');
		expect(component.leftGroupedCards['Commander']).toEqual([{ name: 'Krenko, Mob Boss', count: 1 }]);
		expect(component.rightGroupedCards['Lands']).toEqual([{ name: 'Forest', count: 3 }]);

		component.importFromUrl('https://moxfield.com/decks/bad', 'left');
		component.importFromUrl('https://archidekt.com/decks/99', 'right');
		expect(component.leftError).toContain('Moxfield');
		expect(component.rightError).toContain('Archidekt');

		(component as any).importFromMoxfield('empty-right', 'right');
		(component as any).importFromMoxfield('bad-right', 'right');
		expect(component.leftLoading || component.rightLoading).toBeFalse();
	});

	it('should parse decklists, boundaries, and low-level card helpers', () => {
		stubCards();
		component.processDecklist('', 'left');
		component.processDecklist('2 Sol Ring\nCommander:\n1 Krenko, Mob Boss\nSideboard:\n1 Lightning Bolt', 'left');
		component.processDecklist('2 Sol Ring\nSideboard:\n1 Lightning Bolt\n1 Krenko, Mob Boss', 'right');
		component.processDecklist('1 Jace [Commander]\n3 Forest\n1 Cultivate [Maybeboard]', 'right');
		component.processDecklist('1 Krenko, Mob Boss\n2 Mystery', 'left');
		component.processDecklist('2 Mystery\n1 Jace', 'right');
		component.processDecklist('2 Sol Ring\nSideboard:\n1 Lightning Bolt\n1 Mystery', 'right');
		(component as any).resolveBoundaryCommander([], ['1 Lightning Bolt'], 'right');

		expect(component.leftGroupedCards['Commander']).toEqual([{ name: 'Krenko, Mob Boss', count: 1 }]);
		expect(component.rightGroupedCards['Sideboard']).toEqual([{ name: 'Lightning Bolt', count: 1 }]);
		(component as any).processMoxfieldDeck(['2 Sol Ring', 'Sideboard:'], 'left');

		expect(component.mapTypeToGroup('Creature Battle Instant Sorcery Artifact Enchantment Planeswalker Land')).toBe('Creatures');
		['Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Other'].forEach((type) => component.mapTypeToGroup(type));
		component.sortGroups({ Creatures: [{ name: 'B', count: 1 }, { name: 'A', count: 1 }] });
		(component as any).setError('right', 'Bad');
		(component as any).setDeckTitle('left', '  Custom  ');
		(component as any).setDeckTitle('right', ' ');
		[{ title: 'T' }, { deck: { name: 'Nested' } }, {}].forEach((data) => (component as any).extractDeckName(data));
		(component as any).parseCardCounts(['Sol Ring', '2 Sol Ring']);

		component.leftGroupedCards = { Creatures: [{ name: 'A', count: 2 }, { name: 'B', count: 1 }] };
		component.rightGroupedCards = { Creatures: [{ name: 'A', count: 1 }] };
		component.getGroupKeys('left');
		component.getGroupCount('left', 'Creatures');
		component.cardExistsOnSide('A', 'left');
		component.cardExistsOnSide('B', 'left');
		component.filterDifferentCards(component.leftGroupedCards['Creatures'], 'left');
		component.toggleShowDifferences();
		expect(component.getVisibleCardsForGroup('left', 'Creatures')).toEqual([{ name: 'B', count: 1 }]);
		expect(component.getFilteredGroupCount(component.leftGroupedCards['Creatures'], 'left')).toBe(1);
		(component as any).addCardsFromCounts(
			{ 'Sol Ring': 2, Mystery: 3 },
			{ Artifacts: [{ name: 'Sol Ring', count: 1 }], Unknown: [{ name: 'Mystery', count: 1 }] },
			'left'
		);
	});

	it('should cover Scryfall cache and edge import branches', () => {
		let result: any;
		const request = new Subject<any>();
		http(
			request.asObservable(),
			throwError(() => new Error('missing')),
			of({
				title: 'Fallback Mox',
				commanders: [{ name: 'Partner', count: 1 }],
				sideboard: [{ name: '', count: 1 }, { name: 'Lightning Bolt', count: 0 }, { name: 'Rhystic Study', count: 1 }],
				mainboard: { one: { cardName: 'Sol Ring', qty: 1 }, two: { card_title: 'Sol Ring', quantity: 1 } },
			}),
			throwError(() => new Error('left mox error')),
			of({ cards: undefined }),
			throwError(() => new Error('left arch error'))
		);

		(component as any).getScryfallCard(' Sol Ring ').subscribe((value: any) => (result = value));
		(component as any).getScryfallCard('sol ring').subscribe();
		request.next({ name: 'Sol Ring' });
		request.complete();
		expect(result).toEqual({ name: 'Sol Ring' });
		(component as any).getScryfallCard('Sol Ring').subscribe((value: any) => (result = value));
		(component as any).getScryfallCard('').subscribe((value: any) => (result = value));
		expect(result).toBeNull();
		(component as any).getScryfallCard('Missing').subscribe((value: any) => (result = value));
		expect(result).toBeNull();

		spyOn<any>(component, 'getScryfallCard').and.callFake((name: string) => of(name === 'Partner'
			? { name, card_faces: [{ type_line: 'Legendary Creature', oracle_text: 'Partner' }], legalities: { commander: 'legal' } }
			: cards[name] ?? null));
		(component as any).importFromMoxfield('fallback', 'left');
		(component as any).importFromMoxfield('bad-left', 'left');
		(component as any).importFromArchidekt('empty', 'left');
		(component as any).importFromArchidekt('bad-left', 'left');
		(component as any).getCommanderLikelihood('').subscribe((value: boolean) => expect(value).toBeFalse());
		(component as any).getCommanderLikelihood('Partner').subscribe((value: boolean) => expect(value).toBeTrue());
		expect((component as any).extractMoxfieldCards(null)).toEqual([]);
	});

	it('should cover invalid parsed cards and storage failures', () => {
		spyOn<any>(component, 'getScryfallCard').and.returnValue(of(null));
		spyOn<any>(component, 'extractMoxfieldBoards').and.returnValue([{ kind: 'main', cards: [{ name: '', count: 1 }, { name: 'Zero', count: 0 }] }]);
		http(of({ name: 'Skip Deck' }), throwError(() => new Error('failed')));
		(component as any).importFromMoxfield('skip', 'left');
		(component as any).importFromMoxfield('fail', 'left');
		expect(component.leftGroupedCards).toEqual({});

		const originalStorage = globalThis.localStorage;
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } },
		});
		expect((component as any).getStoredSideboardPreference('left')).toBeFalse();
		expect(() => (component as any).storeSideboardPreference('left', true)).not.toThrow();
		Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage });
	});
});
