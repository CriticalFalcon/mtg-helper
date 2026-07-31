import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';

import { DeckCompareComponent } from './deck-compare.component';

describe('DeckCompareComponent', () => {
	let component: DeckCompareComponent;
	let fixture: ComponentFixture<DeckCompareComponent>;

	const cards: Record<string, any> = {
		'Krenko, Mob Boss': {
			name: 'Krenko, Mob Boss',
			type_line: 'Legendary Creature - Goblin',
			legalities: { commander: 'legal' },
			mana_cost: '{2}{R}{R}',
			cmc: 4,
			color_identity: ['R'],
		},
		'Sol Ring': { name: 'Sol Ring', type_line: 'Artifact', mana_cost: '{1}', cmc: 1, color_identity: [] },
		'Lightning Bolt': {
			name: 'Lightning Bolt',
			type_line: 'Instant',
			mana_cost: '{R}',
			cmc: 1,
			color_identity: ['R'],
		},
		Forest: { name: 'Forest', type_line: 'Basic Land - Forest', mana_cost: '', cmc: 0, color_identity: ['G'] },
		'Battle Card': {
			name: 'Battle Card',
			type_line: 'Battle - Siege',
			mana_cost: '{2}{W}{W}',
			cmc: 4,
			color_identity: ['W'],
		},
		Jace: {
			name: 'Jace',
			type_line: 'Legendary Planeswalker - Jace',
			legalities: { commander: 'legal' },
			mana_cost: '{2}{U}{U}',
			cmc: 4,
			color_identity: ['U'],
		},
		Cultivate: { name: 'Cultivate', type_line: 'Sorcery', mana_cost: '{2}{G}', cmc: 3, color_identity: ['G'] },
		'Rhystic Study': {
			name: 'Rhystic Study',
			type_line: 'Enchantment',
			mana_cost: '{2}{U}',
			cmc: 3,
			color_identity: ['U'],
		},
		'Black Lotus': {
			name: 'Black Lotus',
			type_line: 'Artifact',
			mana_cost: '{0}',
			cmc: 0,
			color_identity: [],
			legalities: { commander: 'banned' },
		},
		Mystery: null,
	};
	const stubCards = () =>
		spyOn<any>(component, 'getScryfallCard').and.callFake((name: string) => of(cards[name] ?? null));
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
		expect(
			(component as any).isArchidektAuxiliaryCard({
				card: { oracleCard: { layout: 'token' } },
				categories: ['Tokens & Extras'],
			})
		).toBeTrue();
		expect(
			(component as any).isArchidektAuxiliaryCard({
				card: { oracleCard: { layout: 'normal' } },
				categories: ['Tokens'],
			})
		).toBeFalse();

		component.leftGroupedCards = {
			Creatures: [
				{ name: 'B', count: 1 },
				{ name: 'A', count: 2 },
			],
			Lands: [{ name: 'Forest', count: 1 }],
		};
		component.rightGroupedCards = {
			Commander: [{ name: 'Krenko, Mob Boss', count: 1 }],
			Artifacts: [{ name: 'Sol Ring', count: 1 }],
		};
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

		const getCardSpy = stubCards();
		(cards['Sol Ring'] as any).image_uris = { normal: 'image' };
		component.onCardHover('Sol Ring');
		expect(component.hoveredCardImage).toBe('image');
		expect(getCardSpy).toHaveBeenCalledTimes(1);
		component.onCardHover('Sol Ring');
		expect(getCardSpy).toHaveBeenCalledTimes(1);
		component.onCardHover('Mystery');
		expect(getCardSpy).toHaveBeenCalledTimes(2);
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
					{
						card: { oracleCard: { name: 'Jace', layout: 'normal' } },
						quantity: 1,
						categories: ['Commander'],
					},
					{ card: { oracleCard: { name: 'Forest', layout: 'normal' } }, quantity: 3, categories: [] },
					{
						card: { oracleCard: { name: 'Cultivate', layout: 'normal' } },
						quantity: 1,
						categories: ['Maybeboard'],
					},
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

	it('should group Moxfield imports from payload metadata before falling back to Scryfall', () => {
		spyOn<any>(component, 'getScryfallCard').and.returnValue(of(null));
		http(
			of({
				name: 'Metadata Deck',
				boards: {
					commanders: {
						cards: {
							a: {
								card: {
									name: 'Krenko, Mob Boss',
									type_line: 'Legendary Creature - Goblin',
									mana_cost: '{2}{R}{R}',
									cmc: 4,
									color_identity: ['R'],
								},
								quantity: 1,
							},
						},
					},
					mainboard: {
						cards: {
							b: {
								card: {
									name: 'Sol Ring',
									type_line: 'Artifact',
									mana_cost: '{1}',
									cmc: 1,
									color_identity: [],
								},
								quantity: 2,
							},
							c: {
								card: {
									name: 'Forest',
									type_line: 'Basic Land - Forest',
									cmc: 0,
									color_identity: ['G'],
								},
								quantity: 1,
							},
						},
					},
					maybeboard: {
						cards: {
							d: {
								card: {
									name: 'Rhystic Study',
									type_line: 'Enchantment',
									mana_cost: '{2}{U}',
									cmc: 3,
									color_identity: ['U'],
								},
								quantity: 1,
							},
						},
					},
				},
			})
		);

		(component as any).importFromMoxfield('metadata', 'left');

		expect(component.leftGroupedCards['Commander']).toEqual([{ name: 'Krenko, Mob Boss', count: 1 }]);
		expect(component.leftGroupedCards['Artifacts']).toEqual([{ name: 'Sol Ring', count: 2 }]);
		expect(component.leftGroupedCards['Lands']).toEqual([{ name: 'Forest', count: 1 }]);
		expect(component.leftGroupedCards['Sideboard']).toEqual([{ name: 'Rhystic Study', count: 1 }]);
		expect(component.leftGroupedCards['Unknown']).toBeUndefined();
		expect(component.leftDeckStats.totalCards).toBe(4);
		expect(component.leftDeckStats.uniqueCards).toBe(3);
		expect(component.leftDeckStats.lands).toBe(1);
		expect(component.leftDeckStats.nonLands).toBe(3);
		expect(component.leftDeckStats.sideboard).toBe(1);
		expect(component.leftDeckStats.averageManaValue).toBe(2);
		expect(component.leftDeckStats.colorIdentity).toEqual(['R', 'G']);
		expect(component.getCardManaCost('Sol Ring')).toBe('{1}');
	});

	it('should import attractions and stickers into dedicated comparison sections', () => {
		spyOn<any>(component, 'getScryfallCard').and.returnValue(of(null));
		http(
			of({
				name: 'Unfinity Commander',
				boards: {
					commanders: {
						cards: {
							a: {
								card: {
									name: 'Mr. House, President and CEO',
									type_line: 'Legendary Creature - Human',
									mana_cost: '{1}{R}{W}{B}',
									cmc: 4,
									color_identity: ['R', 'W', 'B'],
								},
								quantity: 1,
							},
						},
					},
					mainboard: {
						cards: {
							b: {
								card: {
									name: 'Sol Ring',
									type_line: 'Artifact',
									mana_cost: '{1}',
									cmc: 1,
									color_identity: [],
								},
								quantity: 1,
							},
						},
					},
					attractions: {
						cards: {
							c: {
								card: {
									name: 'Balloon Stand',
									type_line: 'Artifact - Attraction',
									cmc: 0,
									color_identity: [],
								},
								quantity: 1,
							},
						},
					},
					stickers: {
						cards: {
							d: {
								card: {
									name: 'Narrow-Minded Baloney Fireworks',
									type_line: 'Sticker Sheet',
									cmc: 0,
									color_identity: ['R'],
								},
								quantity: 1,
							},
						},
					},
				},
			})
		);

		(component as any).importFromMoxfield('unfinity', 'left');

		expect(component.leftGroupedCards['Attraction Deck']).toEqual([{ name: 'Balloon Stand', count: 1 }]);
		expect(component.leftGroupedCards['Sticker Sheets']).toEqual([
			{ name: 'Narrow-Minded Baloney Fireworks', count: 1 },
		]);
		expect(component.getComparisonGroupKeys()).toContain('Attraction Deck');
		expect(component.getComparisonGroupKeys()).toContain('Sticker Sheets');
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

		expect(component.mapTypeToGroup('Creature Battle Instant Sorcery Artifact Enchantment Planeswalker Land')).toBe(
			'Battles'
		);
		expect(component.mapTypeToGroup('Artifact Land')).toBe('Artifacts');
		expect(component.mapTypeToGroup('Instant // Land')).toBe('Instants');
		expect(component.mapTypeToGroup('Land // Instant')).toBe('Lands');
		['Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Other'].forEach((type) =>
			component.mapTypeToGroup(type)
		);
		component.sortGroups({
			Creatures: [
				{ name: 'B', count: 1 },
				{ name: 'A', count: 1 },
			],
		});
		(component as any).setError('right', 'Bad');
		(component as any).setDeckTitle('left', '  Custom  ');
		(component as any).setDeckTitle('right', ' ');
		[{ title: 'T' }, { deck: { name: 'Nested' } }, {}].forEach((data) => (component as any).extractDeckName(data));
		(component as any).parseCardCounts(['Sol Ring', '2 Sol Ring']);

		component.leftGroupedCards = {
			Creatures: [
				{ name: 'A', count: 2 },
				{ name: 'B', count: 1 },
			],
		};
		component.rightGroupedCards = { Creatures: [{ name: 'A', count: 1 }] };
		component.getGroupKeys('left');
		component.getGroupCount('left', 'Creatures');
		expect(component.getCardCountOnOppositeSide('A', 'left')).toBe(1);
		expect(component.isCardUniqueToSide('B', 'left')).toBeTrue();
		component.cardExistsOnSide('A', 'left');
		component.cardExistsOnSide('B', 'left');
		component.filterDifferentCards(component.leftGroupedCards['Creatures'], 'left');
		component.toggleShowDifferences();
		expect(component.getVisibleCardsForGroup('left', 'Creatures')).toEqual([
			{ name: 'A', count: 2 },
			{ name: 'B', count: 1 },
		]);
		expect(component.getFilteredGroupCount(component.leftGroupedCards['Creatures'], 'left')).toBe(3);
		(component as any).addCardsFromCounts(
			{ 'Sol Ring': 2, Mystery: 3 },
			{ Artifacts: [{ name: 'Sol Ring', count: 1 }], Unknown: [{ name: 'Mystery', count: 1 }] },
			'left'
		);
	});

	it('should treat count mismatches as differences when filtering cards', () => {
		component.leftGroupedCards = {
			Creatures: [{ name: 'Goblin Guide', count: 2 }],
		};
		component.rightGroupedCards = {
			Creatures: [{ name: 'Goblin Guide', count: 1 }],
		};

		expect(component.isCardUniqueToSide('Goblin Guide', 'left')).toBeTrue();
		expect(component.isCardUniqueToSide('Goblin Guide', 'right')).toBeTrue();
		expect(component.filterDifferentCards(component.leftGroupedCards['Creatures'], 'left')).toEqual([
			{ name: 'Goblin Guide', count: 2 },
		]);
		expect(component.filterDifferentCards(component.rightGroupedCards['Creatures'], 'right')).toEqual([
			{ name: 'Goblin Guide', count: 1 },
		]);
	});

	it('should build Commander legality findings from grouped cards', () => {
		[
			{
				name: 'Krenko, Mob Boss',
				typeLine: 'Legendary Creature - Goblin',
				oracleText: '',
				legalities: { commander: 'legal' },
				manaCost: '{2}{R}{R}',
				manaValue: 4,
				colorIdentity: ['R'],
			},
			{
				name: 'Sol Ring',
				typeLine: 'Artifact',
				oracleText: '',
				legalities: { commander: 'legal' },
				manaCost: '{1}',
				manaValue: 1,
				colorIdentity: [],
			},
			{
				name: 'Cultivate',
				typeLine: 'Sorcery',
				oracleText: '',
				legalities: { commander: 'legal' },
				manaCost: '{2}{G}',
				manaValue: 3,
				colorIdentity: ['G'],
			},
			{
				name: 'Forest',
				typeLine: 'Basic Land - Forest',
				oracleText: '',
				legalities: { commander: 'legal' },
				manaCost: '',
				manaValue: 0,
				colorIdentity: ['G'],
			},
			{
				name: 'Black Lotus',
				typeLine: 'Artifact',
				oracleText: '',
				legalities: { commander: 'banned' },
				manaCost: '{0}',
				manaValue: 0,
				colorIdentity: [],
			},
		].forEach((metadata) => (component as any).storeCardMetadata(metadata));

		(component as any).updateGroupedCards('left', {
			Commander: [{ name: 'Krenko, Mob Boss', count: 1 }],
			Artifacts: [
				{ name: 'Black Lotus', count: 1 },
				{ name: 'Sol Ring', count: 2 },
			],
			Sorceries: [{ name: 'Cultivate', count: 1 }],
			Lands: [{ name: 'Forest', count: 35 }],
		});
		(component as any).updateGroupedCards('right', {
			Commander: [{ name: 'Sol Ring', count: 1 }],
			Artifacts: [{ name: 'Sol Ring', count: 1 }],
		});

		expect(component.leftDeckLegality.commanderColorIdentity).toEqual(['R']);
		expect(component.leftDeckLegality.bannedCards).toEqual([
			{ name: 'Black Lotus', details: 'Banned in Commander.' },
		]);
		expect(component.leftDeckLegality.suspiciousCounts).toEqual([
			{ name: 'Sol Ring', details: '2 copies found; Commander limit is 1.' },
		]);
		expect(component.leftDeckLegality.offColorCards).toEqual([
			{ name: 'Cultivate', details: 'Uses Green outside commander color identity.' },
			{ name: 'Forest', details: 'Uses Green outside commander color identity.' },
		]);
		expect(component.leftDeckLegality.illegalCommanders).toEqual([]);
		expect(component.getLegalityIssueCount('left')).toBe(4);
		expect(component.hasLegalityFindings('left')).toBeTrue();

		expect(component.rightDeckLegality.illegalCommanders).toEqual([
			{ name: 'Sol Ring', details: 'Does not satisfy Commander leader rules.' },
		]);
		expect(component.getLegalityIssueCount('right')).toBe(1);
		expect(component.hasCommanderIdentityComparison()).toBeFalse();
	});

	it('should detect commander identity mismatch between imported decks', () => {
		[
			{
				name: 'Norman Osborn // Green Goblin',
				typeLine: 'Legendary Creature - Human Goblin',
				oracleText: '',
				legalities: { commander: 'legal' },
				manaCost: '{1}{U}{B}{R}',
				manaValue: 4,
				colorIdentity: ['U', 'B', 'R'],
			},
			{
				name: 'Mr. House, President and CEO',
				typeLine: 'Legendary Creature - Human',
				oracleText: '',
				legalities: { commander: 'legal' },
				manaCost: '{1}{R}{W}{B}',
				manaValue: 4,
				colorIdentity: ['W', 'B', 'R'],
			},
		].forEach((metadata) => (component as any).storeCardMetadata(metadata));

		(component as any).updateGroupedCards('left', {
			Commander: [{ name: 'Norman Osborn // Green Goblin', count: 1 }],
		});
		(component as any).updateGroupedCards('right', {
			Commander: [{ name: 'Mr. House, President and CEO', count: 1 }],
		});

		expect(component.leftDeckLegality.commanderColorIdentity).toEqual(['U', 'B', 'R']);
		expect(component.rightDeckLegality.commanderColorIdentity).toEqual(['W', 'B', 'R']);
		expect(component.hasCommanderIdentityComparison()).toBeTrue();
		expect(component.isCommanderIdentityMismatch()).toBeTrue();
		expect(component.getCommanderIdentityExclusiveColors('left')).toEqual(['U']);
		expect(component.getCommanderIdentityExclusiveColors('right')).toEqual(['W']);
	});

	it('should build deck price totals and deck delta from cached metadata', () => {
		[
			{
				name: 'Krenko, Mob Boss',
				typeLine: 'Legendary Creature - Goblin',
				currentPriceUsd: 40,
				cheapestPriceUsd: 35,
			},
			{
				name: 'Sol Ring',
				typeLine: 'Artifact',
				currentPriceUsd: 1.5,
				cheapestPriceUsd: 0.9,
			},
			{
				name: 'Cultivate',
				typeLine: 'Sorcery',
				currentPriceUsd: 1,
				cheapestPriceUsd: 0.5,
			},
			{
				name: 'Lightning Bolt',
				typeLine: 'Instant',
				currentPriceUsd: 2,
			},
		].forEach((metadata) => (component as any).storeCardMetadata(metadata));

		(component as any).updateGroupedCards('left', {
			Commander: [{ name: 'Krenko, Mob Boss', count: 1 }],
			Artifacts: [{ name: 'Sol Ring', count: 2 }],
			Sideboard: [{ name: 'Lightning Bolt', count: 1 }],
		});
		(component as any).updateGroupedCards('right', {
			Commander: [{ name: 'Krenko, Mob Boss', count: 1 }],
			Sorceries: [{ name: 'Cultivate', count: 1 }],
		});

		expect(component.leftDeckPrice.totalPriceUsd).toBeCloseTo(43);
		expect(component.leftDeckPrice.cheapestPrintTotalUsd).toBeCloseTo(36.8);
		expect(component.leftDeckPrice.missingCurrentPriceCards).toBe(0);
		expect(component.leftDeckPrice.missingCheapestPriceCards).toBe(0);

		expect(component.rightDeckPrice.totalPriceUsd).toBeCloseTo(41);
		expect(component.rightDeckPrice.cheapestPrintTotalUsd).toBeCloseTo(35.5);
		expect(component.getDeckPriceDelta('current')).toBeCloseTo(2);
		expect(component.getDeckPriceDelta('cheapest')).toBeCloseTo(1.3);
		expect(component.getCardCurrentPrice('Sol Ring')).toBeCloseTo(1.5);
		expect(component.getCardPriceLabel('Sol Ring')).toBe('$1.50');
		expect(component.getCardPriceLabel('Mystery')).toBeNull();
		expect(component.formatUsd(component.leftDeckPrice.totalPriceUsd)).toContain('$43.00');
		expect(component.formatUsdDelta(component.getDeckPriceDelta('current'))).toContain('$2.00');
	});

	it('should ignore empty price fields and queue cheapest print lookups one at a time', () => {
		expect((component as any).normalizeUsdPrice(null)).toBeUndefined();
		expect((component as any).normalizeUsdPrice('')).toBeUndefined();
		expect((component as any).normalizeUsdPrice('0.00')).toBe(0);

		const firstRequest = new Subject<any>();
		const secondRequest = new Subject<any>();
		const httpGetSpy = http(firstRequest.asObservable(), secondRequest.asObservable());

		(component as any).storeCardMetadata({
			name: 'Sol Ring',
			currentPriceUsd: 1.5,
		});
		(component as any).storeCardMetadata({
			name: 'Cultivate',
			currentPriceUsd: 1,
		});

		(component as any).ensureCheapestPrintPrice('sol ring', {
			prints_search_uri: 'https://api.scryfall.com/cards/search?sol-ring',
		});
		(component as any).ensureCheapestPrintPrice('cultivate', {
			prints_search_uri: 'https://api.scryfall.com/cards/search?cultivate',
		});

		expect(httpGetSpy).toHaveBeenCalledTimes(1);
		expect(httpGetSpy.calls.argsFor(0)[0]).toContain('sol-ring');

		firstRequest.next({
			data: [{ set_name: 'Commander Masters', collector_number: '1', prices: { usd: '0.90' } }],
		});
		firstRequest.complete();

		expect(httpGetSpy).toHaveBeenCalledTimes(2);
		expect(httpGetSpy.calls.argsFor(1)[0]).toContain('cultivate');

		secondRequest.next({
			data: [{ set_name: 'Core Set', collector_number: '2', prices: { usd: '0.50' } }],
		});
		secondRequest.complete();

		expect(component.getCardCurrentPrice('Sol Ring')).toBe(1.5);
		expect(component.getCardPriceLabel('Sol Ring')).toBe('$1.50');
		expect((component as any).cardMetadataCache.get('sol ring')?.cheapestPriceUsd).toBe(0.9);
		expect((component as any).cardMetadataCache.get('cultivate')?.cheapestPriceUsd).toBe(0.5);

		(component as any).storeCardMetadata({
			name: 'Sol Ring',
			currentPriceUsd: undefined,
			cheapestPriceUsd: 0.25,
		});
		expect(component.getCardCurrentPrice('Sol Ring')).toBe(1.5);
		expect((component as any).cardMetadataCache.get('sol ring')?.cheapestPriceUsd).toBe(0.25);
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
				sideboard: [
					{ name: '', count: 1 },
					{ name: 'Lightning Bolt', count: 0 },
					{ name: 'Rhystic Study', count: 1 },
				],
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

		spyOn<any>(component, 'getScryfallCard').and.callFake((name: string) =>
			of(
				name === 'Partner'
					? {
							name,
							card_faces: [{ type_line: 'Legendary Creature', oracle_text: 'Partner' }],
							legalities: { commander: 'legal' },
						}
					: (cards[name] ?? null)
			)
		);
		(component as any).importFromMoxfield('fallback', 'left');
		(component as any).importFromMoxfield('bad-left', 'left');
		(component as any).importFromArchidekt('empty', 'left');
		(component as any).importFromArchidekt('bad-left', 'left');
		(component as any).getCommanderLikelihood('').subscribe((value: boolean) => expect(value).toBeFalse());
		(component as any).getCommanderLikelihood('Partner').subscribe((value: boolean) => expect(value).toBeTrue());
		expect((component as any).extractMoxfieldCards(null)).toEqual([]);
	});

	it('should preserve explicit sideboard groups during metadata reclassification', () => {
		component.leftGroupedCards = {
			Sideboard: [{ name: 'Flash Photography', count: 1 }],
		};
		(component as any).cardMetadataCache.set('flash photography', {
			name: 'Flash Photography',
			typeLine: 'Instant',
			colorIdentity: ['R'],
		});

		(component as any).reclassifyCardInBothDecks('Flash Photography');

		expect(component.leftGroupedCards['Sideboard']).toEqual([{ name: 'Flash Photography', count: 1 }]);
		expect(component.leftGroupedCards['Instants']).toBeUndefined();
	});

	it('should hide sideboard and special groups in differences-only mode', () => {
		component.leftGroupedCards = {
			Sideboard: [{ name: 'Flash Photography', count: 1 }],
			Creatures: [{ name: 'Goblin Guide', count: 1 }],
		};
		component.rightGroupedCards = {
			Sideboard: [{ name: 'Mana Drain', count: 1 }],
			Creatures: [{ name: 'Goblin Guide', count: 2 }],
		};
		component.showDifferencesOnly = true;

		expect(component.getComparisonGroupKeys()).not.toContain('Sideboard');
		expect(component.getComparisonGroupKeys()).toContain('Creatures');
		expect(component.getVisibleCardsForGroup('left', 'Sideboard')).toEqual([]);
		expect(component.getVisibleCardsForGroup('right', 'Sideboard')).toEqual([]);
	});

	it('should compare only main deck groups and ignore sideboard matches', () => {
		component.leftGroupedCards = {
			Creatures: [{ name: 'Goblin Guide', count: 1 }],
		};
		component.rightGroupedCards = {
			Sideboard: [{ name: 'Goblin Guide', count: 1 }],
		};

		expect(component.isCardUniqueToSide('Goblin Guide', 'left')).toBeTrue();
		expect(component.isCardUniqueToSide('Goblin Guide', 'right')).toBeFalse();
		expect(component.filterDifferentCards(component.leftGroupedCards['Creatures'], 'left')).toEqual([
			{ name: 'Goblin Guide', count: 1 },
		]);
	});

	it('should cover invalid parsed cards and storage failures', () => {
		spyOn<any>(component, 'getScryfallCard').and.returnValue(of(null));
		spyOn<any>(component, 'extractMoxfieldBoards').and.returnValue([
			{
				kind: 'main',
				cards: [
					{ name: '', count: 1 },
					{ name: 'Zero', count: 0 },
				],
			},
		]);
		http(
			of({ name: 'Skip Deck' }),
			throwError(() => new Error('failed'))
		);
		(component as any).importFromMoxfield('skip', 'left');
		(component as any).importFromMoxfield('fail', 'left');
		expect(component.leftGroupedCards).toEqual({});

		const originalStorage = globalThis.localStorage;
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: {
				getItem: () => {
					throw new Error('blocked');
				},
				setItem: () => {
					throw new Error('blocked');
				},
			},
		});
		expect((component as any).getStoredSideboardPreference('left')).toBeFalse();
		expect(() => (component as any).storeSideboardPreference('left', true)).not.toThrow();
		Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage });
	});
});
