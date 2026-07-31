import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeckAnalyzerComponent } from './deck-analyzer.component';

describe('DeckAnalyzerComponent', () => {
	let component: DeckAnalyzerComponent;
	let fixture: ComponentFixture<DeckAnalyzerComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [DeckAnalyzerComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(DeckAnalyzerComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
