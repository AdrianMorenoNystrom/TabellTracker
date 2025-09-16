import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoundlistComponent } from './roundlist-component';

describe('RoundlistComponent', () => {
  let component: RoundlistComponent;
  let fixture: ComponentFixture<RoundlistComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoundlistComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoundlistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
