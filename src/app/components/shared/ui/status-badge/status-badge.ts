import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

type BadgeVariant = 'blue' | 'purple' | 'green' | 'yellow' | 'red' | 'gray' | 'neutral';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './status-badge.html',
  styleUrl: './status-badge.scss',
})
export class StatusBadge {
  @Input() label = 'Status';
  @Input() variant: BadgeVariant = 'neutral';
  @Input() icon = '';
  @Input() outlined = false;
}
