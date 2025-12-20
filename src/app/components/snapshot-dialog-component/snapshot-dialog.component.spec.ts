import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SnapshotDialogComponent } from './snapshot-dialog.component';

describe('SnapshotDialogComponent', () => {
  let component: SnapshotDialogComponent;
  let fixture: ComponentFixture<SnapshotDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SnapshotDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SnapshotDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
