import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DeckCompareComponent } from './deck-compare.component';

describe('DeckCompareComponent', () => {
  let component: DeckCompareComponent;
  let fixture: ComponentFixture<DeckCompareComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeckCompareComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DeckCompareComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
