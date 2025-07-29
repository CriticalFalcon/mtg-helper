import { Pipe, PipeTransform } from '@angular/core';

interface Token {
    type: 'text' | 'symbol' | 'linebreak';
    value: string;
}

@Pipe({
    name: 'manaSymbol'
})
export class ManaSymbolPipe implements PipeTransform {
    transform(text: string | null): Token[] {
        if (!text) return [];

        const tokens: Token[] = [];

        text.split(/\n/).forEach((line, lineIndex, lines) => {
            // Split on mana symbols {..}
            const parts = line.split(/(\{[^}]+\})/g).filter(Boolean);
            for (const part of parts) {
                if (part.startsWith('{') && part.endsWith('}')) {
                    // Mana symbol
                    const formatted = part.replace(/\{|\}|\//g, '').replace(/ /g, '');
                    tokens.push({ type: 'symbol', value: formatted });
                } else {
                    // Plain text
                    tokens.push({ type: 'text', value: part });
                }
            }
            // Add a line break token if not the last line
            if (lineIndex < lines.length - 1) {
                tokens.push({ type: 'linebreak', value: '' });
            }
        });

        return tokens;
    }
}
