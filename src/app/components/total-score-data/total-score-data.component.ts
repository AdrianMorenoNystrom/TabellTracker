import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { ApiService } from '../../services/api.service';
import { Round } from '../../interfaces/round';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
@Component({
  selector: 'app-total-score-data',
  standalone: true,
  imports: [CommonModule, MatCardModule, BaseChartDirective],
  templateUrl: './total-score-data.component.html',
  styleUrl: './total-score-data.component.scss'
})
export class TotalScoreDataComponent {
  loading = true;

  chartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => items[0]?.label ?? '',
          label: (item) => `Totalt rätt: ${item.parsed.y}`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1 }
      }
    },
    elements: { point: { radius: 3 }, line: { tension: 0.25 } }
  };

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.getRounds().subscribe((rounds: Round[]) => {
      const sorted = (rounds ?? []).slice().sort((a,b) => a.roundNumber - b.roundNumber);

      const labels = sorted.map(r => `Omg ${r.roundNumber}`);
      const data = sorted.map(r => r.totalScore);

      this.chartData = {
        labels,
        datasets: [
  {
    type: 'line',
    label: 'Totalt rätt',
    data,
    borderColor: '#00427A',
    backgroundColor: '#000000ff',
  },
]
      };

      this.loading = false;
    });
  }
}
