import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CardSearchComponent } from './card-search.component';

describe('CardSearchComponent', () => {
	let component: CardSearchComponent;
	let fixture: ComponentFixture<CardSearchComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [CardSearchComponent],
			providers: [provideRouter([])],
		}).compileComponents();

		fixture = TestBed.createComponent(CardSearchComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
