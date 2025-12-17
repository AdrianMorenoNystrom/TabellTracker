import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TotalScoreDataComponent } from './total-score-data.component';

describe('TotalScoreDataComponent', () => {
  let component: TotalScoreDataComponent;
  let fixture: ComponentFixture<TotalScoreDataComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TotalScoreDataComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TotalScoreDataComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
