import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { NavbarComponent } from './navbar.component';

describe('NavbarComponent', () => {
	let component: NavbarComponent;
	let fixture: ComponentFixture<NavbarComponent>;
	let router: Router;
	const event = (key: string) => ({ key, preventDefault: jasmine.createSpy('preventDefault') }) as any;
	const http = (...values: any[]) => spyOn((component as any).http, 'get').and.returnValues(...values);

	beforeEach(async () => {
		localStorage.removeItem('bsTheme');
		await TestBed.configureTestingModule({
			imports: [NavbarComponent],
			providers: [provideRouter([]), provideHttpClient()],
		}).compileComponents();
		fixture = TestBed.createComponent(NavbarComponent);
		component = fixture.componentInstance;
		router = TestBed.inject(Router);
		fixture.detectChanges();
	});

	afterEach(() => {
		localStorage.removeItem('bsTheme');
		document.documentElement.removeAttribute('data-bs-theme');
	});

	it('should create and handle theme state', () => {
		expect(component).toBeTruthy();
		expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
		component.toggleDarkMode();
		expect(localStorage.getItem('bsTheme')).toBe('dark');
		localStorage.setItem('bsTheme', 'dark');
		component.ngOnInit();
		expect(component.isDarkMode).toBeTrue();
	});

	it('should cover input suggestions, keyboard navigation, search, and close behavior', (done) => {
		http(
			of({ data: Array.from({ length: 12 }, (_, i) => `Card ${i}`) }),
			throwError(() => new Error('autocomplete failed'))
		);
		component.searchTerm = 'so';
		component.onInputChange();
		expect(component.suggestions.length).toBe(10);

		component.searchTerm = 'x';
		component.onInputChange();
		expect(component.showSuggestions).toBeFalse();

		component.searchTerm = 'bad';
		component.onInputChange();
		expect(component.suggestions).toEqual([]);

		spyOn(component, 'onSearch').and.callThrough();
		spyOn(router, 'navigate');
		component.userInput = component.searchTerm = 'so';
		component.suggestions = ['Sol Ring', 'Solemn Simulacrum'];
		component.showSuggestions = true;
		component.handleKeyDown(event('ArrowDown'));
		component.handleKeyDown(event('ArrowDown'));
		component.handleKeyDown(event('ArrowDown'));
		component.handleKeyDown(event('ArrowUp'));
		component.handleKeyDown(event('ArrowUp'));
		component.handleKeyDown(event('Enter'));
		expect(component.userInput).toBe('Sol Ring');

		component.activeIndex = -1;
		component.showSuggestions = true;
		component.handleKeyDown(event('Enter'));
		component.showSuggestions = false;
		component.handleKeyDown(event('ArrowDown'));

		component.userInput = component.searchTerm = 'Opt';
		component.suggestions = ['Opt'];
		component.onInputFocus();
		component.onSearch();
		expect(router.navigate).toHaveBeenCalledWith(['/card', 'Opt']);
		component.searchTerm = ' ';
		component.onSearch();
		component.showSuggestions = true;
		component.onClickOutside(new MouseEvent('click'));
		component.showSuggestions = true;
		component.onInputBlur();
		setTimeout(() => {
			expect(component.showSuggestions).toBeFalse();
			done();
		}, 160);
	});
});
