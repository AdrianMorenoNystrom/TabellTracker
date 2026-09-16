import { testProviders } from '../../../testing/test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AvatarChipComponent } from './avatar-chip.component';

describe('AvatarChipComponent', () => {
  let component: AvatarChipComponent;
  let fixture: ComponentFixture<AvatarChipComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: testProviders(),
      imports: [AvatarChipComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AvatarChipComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
