import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-data-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './data-toolbar.html',
  styleUrl: './data-toolbar.scss',
})
export class DataToolbar {
  @Input() searchPlaceholder = 'Search...';
  @Input() searchValue = '';

  @Input() showSearch = true;
  @Input() showFilter = false;
  @Input() showRefresh = false;
  @Input() showPrimaryAction = false;

  @Input() primaryActionLabel = 'Add New';
  @Input() primaryActionIcon = 'pi pi-plus';

  @Input() filterLabel = 'Filters';
  @Input() refreshLabel = 'Refresh';

  @Output() searchValueChange = new EventEmitter<string>();
  @Output() filterClick = new EventEmitter<void>();
  @Output() refreshClick = new EventEmitter<void>();
  @Output() primaryActionClick = new EventEmitter<void>();

  onSearchChange(value: string): void {
    this.searchValue = value;
    this.searchValueChange.emit(value);
  }

  onFilter(): void {
    this.filterClick.emit();
  }

  onRefresh(): void {
    this.refreshClick.emit();
  }

  onPrimaryAction(): void {
    this.primaryActionClick.emit();
  }

  clearSearch(): void {
    this.onSearchChange('');
  }
}
