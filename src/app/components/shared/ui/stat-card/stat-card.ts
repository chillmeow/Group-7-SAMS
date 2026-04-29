import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

type StatVariant = 'blue' | 'purple' | 'green' | 'yellow' | 'red' | 'neutral';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stat-card.html',
  styleUrl: './stat-card.scss',
})
export class StatCard {
  @Input() label = '';
  @Input() value = '';
  @Input() subtitle = '';
  @Input() icon = 'pi pi-chart-bar';
  @Input() trend = '';
  @Input() trendDirection: 'up' | 'down' | 'neutral' = 'neutral';
  @Input() variant: StatVariant = 'blue';
}
