import { HighlightPipe } from './highlight.pipe';

describe('HighlightPipe', () => {
	const pipe = new HighlightPipe();

	it('should wrap text when there is no search term', () => {
		expect(pipe.transform('Lightning Bolt', '')).toBe('<span>Lightning Bolt</span>');
	});

	it('should highlight literal case-insensitive matches', () => {
		expect(pipe.transform('A+B and a+b', 'a+b')).toBe('<span><strong>A+B</strong> and <strong>a+b</strong></span>');
	});
});
