import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.scss',
})
export class EmptyState {
  @Input() title = 'No data available';
  @Input() message = 'There is nothing to display right now.';
  @Input() icon = 'pi pi-inbox';

  @Input() showAction = false;
  @Input() actionLabel = 'Create';

  @Output() actionClick = new EventEmitter<void>();

  onAction(): void {
    this.actionClick.emit();
  }
}
