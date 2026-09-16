import { testProviders } from '../../../testing/test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TableComponent } from './table-component';

describe('TableComponent', () => {
  let component: TableComponent;
  let fixture: ComponentFixture<TableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: testProviders(),
      imports: [TableComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
