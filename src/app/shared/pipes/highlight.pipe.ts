import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
	name: 'highlight'
})
export class HighlightPipe implements PipeTransform {
	transform(value: string, search: string): string {
		if (!search) return `<span>${value}</span>`;

		const escapedSearch = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
		const regex = new RegExp(`(${escapedSearch})`, 'gi');
		const highlighted = value.replace(regex, '<strong>$1</strong>');

		return `<span>${highlighted}</span>`;
	}
}
