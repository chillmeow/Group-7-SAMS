import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './page-header.html',
  styleUrl: './page-header.scss',
})
export class PageHeader {
  @Input() title = '';
  @Input() subtitle = '';

  @Input() showPrimary = false;
  @Input() primaryLabel = 'Action';
  @Input() primaryIcon = '';

  @Input() showSecondary = false;
  @Input() secondaryLabel = 'Action';
  @Input() secondaryIcon = '';

  @Output() primaryClick = new EventEmitter<void>();
  @Output() secondaryClick = new EventEmitter<void>();

  onPrimary(): void {
    this.primaryClick.emit();
  }

  onSecondary(): void {
    this.secondaryClick.emit();
  }
}
