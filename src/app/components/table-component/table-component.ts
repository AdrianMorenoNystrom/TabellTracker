import { Component, ViewChild, AfterViewInit } from '@angular/core';
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from '@angular/material/button';
import { AddPlayerDialog } from '../add-player-dialog/add-player-dialog';
import { ApiService } from '../../services/api.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Player } from '../../interfaces/player';
import { MatIconModule } from '@angular/material/icon';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { PlayerHistoryDialogComponent } from '../player-history-dialog/player-history-dialog.component';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-table-component',
  imports: [MatCardModule,MatButtonModule,MatIconModule, MatTableModule, MatSortModule, MatFormFieldModule, MatInputModule, MatDialogModule,NgIf],
  templateUrl: './table-component.html',
  styleUrl: './table-component.scss'
})
export class TableComponent implements AfterViewInit {
    constructor(public api: ApiService, private dialog: MatDialog) {}
  players = new MatTableDataSource<Player>([]);
  displayedColumns = ['name', 'score', 'actions'];
  @ViewChild(MatSort) sort!: MatSort;


  ngOnInit() {
    this.api.watchPlayers().subscribe(p => {
      const arr = (p ?? []).slice().sort((a, b) => b.score - a.score);
      this.players.data = arr;
    });
  }

  ngAfterViewInit(): void {
    this.players.sortingDataAccessor = (item: Player, property: string): any => {
      switch (property) {
        case 'score':
          return Number(item.score) || 0;
        default:
          return (item as any)[property];
      }
    };

    this.players.sort = this.sort;
  }

  loadPlayers() {
    this.api.getPlayers().subscribe(p => {
      const arr = (p ?? []).slice().sort((a, b) => b.score - a.score);
      this.players.data = arr;
    });
  }

  
  delete(p: Player) {
    if (!p?.id) return;
    const sure = confirm(`Delete player "${p.name}"? This will remove their scores from all rounds.`);
    if (!sure) return;
    this.api.deletePlayer(p.id).subscribe(() => this.loadPlayers());
  }

  openAddPlayerDialog() {
    const ref = this.dialog.open(AddPlayerDialog, {
      width: '600px',
      data: {}
    });
    ref.afterClosed().subscribe(r => { if (r?.updated) this.loadPlayers(); });
  }

  applyFilter(value: string) {
    this.players.filter = (value || '').trim().toLowerCase();
  }

  openHistory(p: Player) {
    this.dialog.open(PlayerHistoryDialogComponent, {
      width: '520px',
      data: { player: p }
    });
  }
}
