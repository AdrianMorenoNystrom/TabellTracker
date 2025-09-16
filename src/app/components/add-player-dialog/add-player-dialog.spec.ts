import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddPlayerDialog } from './add-player-dialog';

describe('AddPlayerDialog', () => {
  let component: AddPlayerDialog;
  let fixture: ComponentFixture<AddPlayerDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPlayerDialog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddPlayerDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
