import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { RoundRecapDialogComponent, RoundRecapDialogData } from './round-recap-dialog.component';

describe('RoundRecapDialogComponent', () => {
  let fixture: ComponentFixture<RoundRecapDialogComponent>;

  const data: RoundRecapDialogData = {
    seasonName: '2026/27',
    round: {
      id: 3,
      roundNumber: 3,
      week: 35,
      totalScore: 8,
      players: [
        {
          id: 1,
          name: 'Adrian',
          score: 3,
          total_matches: 4,
          avg_score_per_round: 3,
          matchesPicked: 4,
        },
        {
          id: 2,
          name: 'Danne',
          score: 2,
          total_matches: 3,
          avg_score_per_round: 2,
          matchesPicked: 3,
        },
      ],
    },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoundRecapDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoundRecapDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('creates two downloadable 4:5 canvases', () => {
    const canvases = fixture.nativeElement.querySelectorAll('canvas') as NodeListOf<HTMLCanvasElement>;

    expect(fixture.componentInstance).toBeTruthy();
    expect(canvases.length).toBe(2);
    expect(Array.from(canvases).every((canvas) => canvas.width === 1080)).toBeTrue();
    expect(Array.from(canvases).every((canvas) => canvas.height === 1350)).toBeTrue();
  });
});
