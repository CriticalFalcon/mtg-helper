import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
    name: 'manaSymbol'
})
export class ManaSymbolPipe implements PipeTransform {
    constructor(private sanitizer: DomSanitizer) { }

    transform(text: string | null): SafeHtml {
        if (!text) return '';

        // Replace each {symbol} with the Scryfall SVG including fixed size attributes
        const replaced = text.replace(/\{([^}]+)\}/g, (match, symbol) => {
            // Keep casing, just remove slashes/spaces
            const formatted = symbol.replace(/\//g, '').replace(/ /g, '');
            const url = `https://svgs.scryfall.io/card-symbols/${formatted}.svg`;
            // Added width and height attributes here
            return `<img src="${url}" alt="${symbol}" class="mana-symbol" width="16" height="16" style="box-shadow: -1px 1px 0 rgba(0,0,0,0.85); margin: 1px 1px -1px 1px;">`;
        });

        // Replace \n with <br> for line breaks
        const withBreaks = replaced.replace(/\n/g, '<br>');

        return this.sanitizer.bypassSecurityTrustHtml(withBreaks);
    }
}
