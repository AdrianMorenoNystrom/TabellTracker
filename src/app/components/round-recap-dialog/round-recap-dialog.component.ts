import { AfterViewInit, Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Round } from '../../interfaces/round';
import { Player } from '../../interfaces/player';
import { avatarColor } from '../../utils/avatar-color';
import {
  calculatePlacementHistory,
  calculateRoundWins,
  getRoundWinners,
} from '../../utils/standings';

export interface RoundRecapDialogData {
  round: Round;
  seasonName?: string;
  seasonRounds?: Round[];
}

interface SeasonStandingRow {
  name: string;
  score: number;
  possible: number;
  accuracy: number;
  recentAccuracy: number;
  formDifference: number;
  placement: number;
  placementChange: number | null;
  roundWins: number;
}

@Component({
  selector: 'app-round-recap-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './round-recap-dialog.component.html',
  styleUrl: './round-recap-dialog.component.scss',
})
export class RoundRecapDialogComponent implements AfterViewInit {
  @ViewChild('recapCanvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('seasonCanvas') private seasonCanvasRef?: ElementRef<HTMLCanvasElement>;

  private readonly width = 1080;
  private readonly height = 1350;

  constructor(@Inject(MAT_DIALOG_DATA) public data: RoundRecapDialogData) {}

  ngAfterViewInit(): void {
    this.drawImages();
    void document.fonts?.ready.then(() => this.drawImages());
  }

  downloadRound(): void {
    this.downloadCanvas(
      this.canvasRef?.nativeElement,
      `stryktipset-omgang-${this.data.round.roundNumber}.png`
    );
  }

  downloadSeason(): void {
    this.downloadCanvas(
      this.seasonCanvasRef?.nativeElement,
      `stryktipset-sasongslage-omgang-${this.data.round.roundNumber}.png`
    );
  }

  private drawImages(): void {
    this.drawRecap();
    this.drawSeasonStats();
  }

  private downloadCanvas(canvas: HTMLCanvasElement | undefined, fileName: string): void {
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) {
        this.downloadUrl(canvas.toDataURL('image/png'), fileName);
        return;
      }

      const url = URL.createObjectURL(blob);
      this.downloadUrl(url, fileName);
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  private downloadUrl(url: string, fileName: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
  }

  private drawRecap(): void {
    const canvas = this.canvasRef?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    canvas.width = this.width;
    canvas.height = this.height;

    const players = this.sortedPlayers(this.data.round.players ?? []);
    const winners = getRoundWinners(this.data.round);
    const totalScore = Number(this.data.round.totalScore) || 0;
    const totalPossible = players.reduce(
      (sum, player) => sum + (Number(player.matchesPicked) || 3),
      0
    );
    const accuracy = totalPossible ? Math.round((totalScore / totalPossible) * 100) : 0;
    const average = players.length ? totalScore / players.length : 0;
    const topScore = players.length ? Number(players[0].score) || 0 : 0;

    this.drawBackground(ctx);

    ctx.fillStyle = '#89a9c6';
    ctx.font = this.font(26, 700);
    ctx.letterSpacing = '4px';
    ctx.fillText('VECKANS STRYKTIPS', 80, 94);
    ctx.letterSpacing = '0px';

    ctx.fillStyle = '#ffffff';
    ctx.font = this.font(72, 800);
    ctx.fillText(`OMGÅNG ${this.data.round.roundNumber}`, 80, 180);

    const meta = [
      this.data.seasonName || this.data.round.seasonName,
      `VECKA ${this.data.round.week}`,
    ].filter(Boolean).join('  •  ');
    ctx.fillStyle = '#b8cde0';
    ctx.font = this.font(28, 500);
    ctx.fillText(meta, 82, 226);

    this.roundedRect(ctx, 80, 278, 920, 196, 28, '#fff1cd');
    ctx.fillStyle = '#9a6400';
    ctx.font = this.font(22, 800);
    ctx.fillText(winners.length > 1 ? 'DELAD OMGÅNGSSEGER' : 'OMGÅNGSVINNARE', 120, 330);
    ctx.fillStyle = '#3d2b09';
    ctx.font = this.fitFont(ctx, winners.join(' & ') || 'Ingen vinnare', 52, 800, 760);
    ctx.fillText(winners.join(' & ') || 'Ingen vinnare', 120, 400);
    ctx.fillStyle = '#76541a';
    ctx.font = this.font(24, 600);
    ctx.fillText(`${topScore} rätt`, 120, 440);
    this.drawTrophy(ctx, 885, 376);

    const statY = 514;
    this.drawStat(ctx, 80, statY, 286, 'TOTALT', `${totalScore}/${totalPossible}`);
    this.drawStat(ctx, 397, statY, 286, 'TRÄFF', `${accuracy}%`);
    this.drawStat(ctx, 714, statY, 286, 'SNITT', this.formatNumber(average));

    ctx.fillStyle = '#89a9c6';
    ctx.font = this.font(22, 700);
    ctx.letterSpacing = '3px';
    ctx.fillText('RESULTAT', 80, 756);
    ctx.letterSpacing = '0px';

    this.drawPlayers(ctx, players, 790, 420);

  }

  private drawSeasonStats(): void {
    const canvas = this.seasonCanvasRef?.nativeElement;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    canvas.width = this.width;
    canvas.height = this.height;

    const rounds = this.roundsThroughSelected();
    const standings = this.buildSeasonStandings(rounds);
    const leaderNames = standings
      .filter((standing) => standing.placement === 1)
      .map((standing) => standing.name)
      .join(' & ');
    const totalScore = rounds.reduce((sum, round) => sum + (Number(round.totalScore) || 0), 0);
    const totalPossible = rounds.reduce(
      (sum, round) =>
        sum +
        (round.players ?? []).reduce(
          (roundSum, player) => roundSum + (Number(player.matchesPicked) || 3),
          0
        ),
      0
    );
    const totalAccuracy = totalPossible ? Math.round((totalScore / totalPossible) * 100) : 0;

    this.drawBackground(ctx);

    ctx.fillStyle = '#89a9c6';
    ctx.font = this.font(26, 700);
    ctx.letterSpacing = '4px';
    ctx.fillText('SÄSONGSLÄGET', 80, 94);
    ctx.letterSpacing = '0px';

    ctx.fillStyle = '#ffffff';
    ctx.font = this.font(64, 800);
    ctx.fillText(`EFTER OMGÅNG ${this.data.round.roundNumber}`, 80, 176);

    const meta = [
      this.data.seasonName || this.data.round.seasonName,
      `VECKA ${this.data.round.week}`,
    ].filter(Boolean).join('  •  ');
    ctx.fillStyle = '#b8cde0';
    ctx.font = this.font(28, 500);
    ctx.fillText(meta, 82, 222);

    this.drawSeasonSummary(ctx, 80, 270, 438, 'LEDARE', leaderNames || '–');
    this.drawSeasonSummary(ctx, 542, 270, 214, 'OMGÅNGAR', String(rounds.length));
    this.drawSeasonSummary(ctx, 780, 270, 220, 'TOTALTRÄFF', `${totalAccuracy}%`);

    ctx.fillStyle = '#89a9c6';
    ctx.font = this.font(21, 700);
    ctx.letterSpacing = '3px';
    ctx.fillText('TABELL OCH FORM', 80, 494);
    ctx.letterSpacing = '0px';

    this.drawSeasonTable(ctx, standings, 526, 600);

    this.roundedRect(ctx, 80, 1165, 920, 92, 18, 'rgba(255, 255, 255, 0.1)');
    ctx.fillStyle = '#b8cde0';
    ctx.font = this.font(20, 500);
    ctx.fillText('FORM = TRÄFF SENASTE 3 OMGÅNGARNA MINUS SÄSONGENS TRÄFF', 112, 1220);

  }

  private drawSeasonSummary(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    label: string,
    value: string
  ): void {
    this.roundedRect(ctx, x, y, width, 164, 22, 'rgba(255, 255, 255, 0.1)');
    ctx.fillStyle = '#9db8cf';
    ctx.font = this.font(18, 700);
    ctx.fillText(label, x + 26, y + 44);
    ctx.fillStyle = '#ffffff';
    ctx.font = this.fitFont(ctx, value, 40, 800, width - 52);
    ctx.fillText(value, x + 26, y + 111);
  }

  private drawSeasonTable(
    ctx: CanvasRenderingContext2D,
    standings: SeasonStandingRow[],
    y: number,
    availableHeight: number
  ): void {
    const shownStandings = standings.slice(0, 8);
    if (!shownStandings.length) {
      ctx.fillStyle = '#b8cde0';
      ctx.font = this.font(28, 500);
      ctx.fillText('Ingen säsongsstatistik', 80, y + 60);
      return;
    }

    const headerY = y + 28;
    ctx.fillStyle = '#8faac1';
    ctx.font = this.font(17, 700);
    ctx.textAlign = 'right';
    ctx.fillText('TOTALT', 610, headerY);
    ctx.fillText('TRÄFF', 720, headerY);
    ctx.fillText('SEN 3', 823, headerY);
    ctx.fillText('FORM', 916, headerY);
    ctx.fillText('SEGRAR', 994, headerY);
    ctx.textAlign = 'left';

    const gap = 10;
    const tableTop = y + 48;
    const rowHeight = Math.min(
      112,
      (availableHeight - 48 - gap * (shownStandings.length - 1)) / shownStandings.length
    );
    const fontSize = Math.max(19, Math.min(29, rowHeight * 0.3));

    shownStandings.forEach((standing, index) => {
      const rowY = tableTop + index * (rowHeight + gap);
      this.roundedRect(ctx, 80, rowY, 920, rowHeight, 16, 'rgba(255, 255, 255, 0.94)');

      ctx.fillStyle = '#59758e';
      ctx.font = this.font(fontSize * 0.82, 700);
      ctx.fillText(String(standing.placement), 108, rowY + rowHeight * 0.62);

      this.drawPlacementChange(ctx, standing.placementChange, 148, rowY + rowHeight * 0.61, fontSize);

      ctx.fillStyle = avatarColor(standing.name);
      ctx.beginPath();
      ctx.arc(213, rowY + rowHeight / 2, Math.min(18, rowHeight * 0.2), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#001932';
      ctx.font = this.fitFont(ctx, standing.name, fontSize, 700, 280);
      ctx.fillText(standing.name, 246, rowY + rowHeight * 0.62);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#29445c';
      ctx.font = this.font(fontSize * 0.78, 700);
      ctx.fillText(`${standing.score}/${standing.possible}`, 610, rowY + rowHeight * 0.61);
      ctx.fillText(`${standing.accuracy}%`, 720, rowY + rowHeight * 0.61);
      ctx.fillText(`${standing.recentAccuracy}%`, 823, rowY + rowHeight * 0.61);
      ctx.fillStyle = this.formColor(standing.formDifference);
      ctx.fillText(this.signedPercent(standing.formDifference), 916, rowY + rowHeight * 0.61);
      ctx.fillStyle = '#29445c';
      ctx.fillText(String(standing.roundWins), 986, rowY + rowHeight * 0.61);
      ctx.textAlign = 'left';
    });
  }

  private drawPlacementChange(
    ctx: CanvasRenderingContext2D,
    change: number | null,
    x: number,
    y: number,
    fontSize: number
  ): void {
    ctx.font = this.font(fontSize * 0.62, 800);
    if (change == null || change === 0) {
      ctx.fillStyle = '#8a9dad';
      ctx.fillText('–', x, y);
      return;
    }

    ctx.fillStyle = change > 0 ? '#198754' : '#c9363e';
    ctx.fillText(`${change > 0 ? '▲' : '▼'}${Math.abs(change)}`, x, y);
  }

  private buildSeasonStandings(rounds: Round[]): SeasonStandingRow[] {
    const history = calculatePlacementHistory(rounds);
    const latest = history.at(-1);
    const previous = history.at(-2);
    if (!latest) return [];

    const recentRounds = rounds.slice(-3);

    return latest.standings.map((standing) => {
      const recentTotals = recentRounds.reduce(
        (totals, round) => {
          const player = (round.players ?? []).find((candidate) => candidate.name === standing.name);
          if (player) {
            totals.score += Number(player.score) || 0;
            totals.possible += Number(player.matchesPicked) || 3;
          }
          return totals;
        },
        { score: 0, possible: 0 }
      );
      const accuracy = standing.matchesPicked
        ? Math.round((standing.score / standing.matchesPicked) * 100)
        : 0;
      const recentAccuracy = recentTotals.possible
        ? Math.round((recentTotals.score / recentTotals.possible) * 100)
        : 0;
      const previousPlacement = previous?.standings.find(
        (entry) => entry.name === standing.name
      )?.placement;

      return {
        name: standing.name,
        score: standing.score,
        possible: standing.matchesPicked,
        accuracy,
        recentAccuracy,
        formDifference: recentAccuracy - accuracy,
        placement: standing.placement,
        placementChange:
          previousPlacement == null ? null : previousPlacement - standing.placement,
        roundWins: calculateRoundWins(rounds, standing.name).total,
      };
    });
  }

  private roundsThroughSelected(): Round[] {
    const roundsById = new Map<number, Round>();
    for (const round of [...(this.data.seasonRounds ?? []), this.data.round]) {
      roundsById.set(round.id, round);
    }

    const sorted = Array.from(roundsById.values()).sort(
      (a, b) => a.roundNumber - b.roundNumber || a.week - b.week || a.id - b.id
    );
    const selectedIndex = sorted.findIndex((round) => round.id === this.data.round.id);
    return selectedIndex < 0 ? [this.data.round] : sorted.slice(0, selectedIndex + 1);
  }

  private signedPercent(value: number): string {
    if (value === 0) return '0%';
    return `${value > 0 ? '+' : ''}${value}%`;
  }

  private formColor(value: number): string {
    if (value >= 5) return '#198754';
    if (value <= -5) return '#c9363e';
    return '#b07800';
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    const gradient = ctx.createLinearGradient(0, 0, this.width, this.height);
    gradient.addColorStop(0, '#001932');
    gradient.addColorStop(0.58, '#003663');
    gradient.addColorStop(1, '#004f85');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (let x = -400; x < 1300; x += 76) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 700, this.height);
      ctx.stroke();
    }
    ctx.restore();

    const glow = ctx.createRadialGradient(920, 160, 20, 920, 160, 520);
    glow.addColorStop(0, 'rgba(255, 102, 119, 0.28)');
    glow.addColorStop(1, 'rgba(255, 102, 119, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(400, 0, 680, 700);
  }

  private drawStat(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    label: string,
    value: string
  ): void {
    this.roundedRect(ctx, x, y, width, 176, 22, 'rgba(255, 255, 255, 0.1)');
    ctx.fillStyle = '#9db8cf';
    ctx.font = this.font(20, 700);
    ctx.fillText(label, x + 28, y + 48);
    ctx.fillStyle = '#ffffff';
    ctx.font = this.font(52, 800);
    ctx.fillText(value, x + 28, y + 122);
  }

  private drawPlayers(
    ctx: CanvasRenderingContext2D,
    players: Player[],
    y: number,
    availableHeight: number
  ): void {
    if (!players.length) {
      ctx.fillStyle = '#b8cde0';
      ctx.font = this.font(28, 500);
      ctx.fillText('Inga spelarresultat', 80, y + 60);
      return;
    }

    const gap = 12;
    const rowHeight = Math.min(92, (availableHeight - gap * (players.length - 1)) / players.length);
    const fontSize = Math.max(24, Math.min(34, rowHeight * 0.38));
    let previousScore: number | null = null;
    let placement = 0;

    players.forEach((player, index) => {
      const score = Number(player.score) || 0;
      if (previousScore !== score) placement = index + 1;
      previousScore = score;

      const rowY = y + index * (rowHeight + gap);
      this.roundedRect(ctx, 80, rowY, 920, rowHeight, 18, 'rgba(255, 255, 255, 0.94)');

      ctx.fillStyle = '#59758e';
      ctx.font = this.font(fontSize * 0.82, 700);
      ctx.fillText(String(placement), 112, rowY + rowHeight * 0.64);

      ctx.fillStyle = avatarColor(player.name);
      ctx.beginPath();
      ctx.arc(180, rowY + rowHeight / 2, Math.min(21, rowHeight * 0.23), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#001932';
      ctx.font = this.fitFont(ctx, player.name, fontSize, 700, 475);
      ctx.fillText(player.name, 220, rowY + rowHeight * 0.64);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#5f768b';
      ctx.font = this.font(Math.max(18, fontSize * 0.64), 600);
      ctx.fillText(`${Number(player.matchesPicked) || 3} matcher`, 825, rowY + rowHeight * 0.62);
      ctx.fillStyle = '#00427a';
      ctx.font = this.font(fontSize, 800);
      ctx.fillText(`${score} rätt`, 962, rowY + rowHeight * 0.64);
      ctx.textAlign = 'left';
    });
  }

  private drawTrophy(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#c38a14';
    ctx.fillStyle = '#ffc94f';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.roundRect(-42, -50, 84, 78, 14);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-48, -20, 33, Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(48, -20, 33, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.fillRect(-9, 26, 18, 35);
    ctx.roundRect(-43, 58, 86, 17, 8);
    ctx.fill();
    ctx.restore();
  }

  private sortedPlayers(players: Player[]): Player[] {
    return [...players].sort(
      (a, b) =>
        (Number(b.score) || 0) - (Number(a.score) || 0) ||
        a.name.localeCompare(b.name, 'sv')
    );
  }

  private formatNumber(value: number): string {
    return new Intl.NumberFormat('sv-SE', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(value);
  }

  private font(size: number, weight: number): string {
    return `${weight} ${size}px Phudu, Arial, sans-serif`;
  }

  private fitFont(
    ctx: CanvasRenderingContext2D,
    text: string,
    initialSize: number,
    weight: number,
    maxWidth: number
  ): string {
    let size = initialSize;
    while (size > 20) {
      const font = this.font(size, weight);
      ctx.font = font;
      if (ctx.measureText(text).width <= maxWidth) return font;
      size -= 2;
    }
    return this.font(size, weight);
  }

  private roundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fillStyle: string
  ): void {
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
  }
}
