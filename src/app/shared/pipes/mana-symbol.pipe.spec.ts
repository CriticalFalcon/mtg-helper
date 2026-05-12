import { ManaSymbolPipe } from './mana-symbol.pipe';

describe('ManaSymbolPipe', () => {
	const pipe = new ManaSymbolPipe();

	it('should return no tokens for empty text', () => {
		expect(pipe.transform(null)).toEqual([]);
	});

	it('should tokenize text, mana symbols, and line breaks', () => {
		expect(pipe.transform('Add {T}: {G/U}\nDraw a card.')).toEqual([
			{ type: 'text', value: 'Add ' },
			{ type: 'symbol', value: 'T' },
			{ type: 'text', value: ': ' },
			{ type: 'symbol', value: 'GU' },
			{ type: 'linebreak', value: '' },
			{ type: 'text', value: 'Draw a card.' },
		]);
	});
});
