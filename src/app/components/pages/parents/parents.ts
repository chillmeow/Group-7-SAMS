import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs/operators';

import { ParentService } from '../../../services/parent.service';
import { Parent } from '../../../models/parent.model';
import { AlertService } from '../../../services/alert.service';

import { PageHeader } from '../../shared/ui/page-header/page-header';
import { StatCard } from '../../shared/ui/stat-card/stat-card';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { DataToolbar } from '../../shared/ui/data-toolbar/data-toolbar';

type ParentStatusFilter = 'all' | 'active' | 'inactive' | 'archived';

@Component({
  selector: 'app-parents',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeader, StatCard, StatusBadge, EmptyState, DataToolbar],
  templateUrl: './parents.html',
  styleUrl: './parents.scss',
})
export class ParentsComponent implements OnInit {
  private readonly parentService = inject(ParentService);
  private readonly alert = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  parents: Parent[] = [];
  filteredList: Parent[] = [];

  search = '';
  statusFilter: ParentStatusFilter = 'all';

  isLoading = false;
  isSaving = false;

  showModal = false;
  editing = false;

  form: Parent = this.createEmptyForm();

  ngOnInit(): void {
    this.loadParents();
  }

  loadParents(): void {
    this.isLoading = true;

    this.parentService
      .getParents()
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.zone.run(() => {
            this.parents = data ?? [];
            this.applyFilters();
            this.isLoading = false;
            this.cdr.detectChanges();
          });
        },
        error: () => {
          this.zone.run(() => {
            this.parents = [];
            this.filteredList = [];
            this.isLoading = false;
            this.cdr.detectChanges();
          });

          this.alert.error('Load failed', 'Unable to load parent and guardian records.');
        },
      });
  }

  openAdd(): void {
    this.editing = false;
    this.form = this.createEmptyForm();
    this.showModal = true;
    this.cdr.detectChanges();
  }

  openEdit(parent: Parent): void {
    this.editing = true;

    this.form = {
      id: parent.id,
      userId: parent.userId || '',
      studentId: parent.studentId || '',
      studentIds: parent.studentIds || [],
      firstName: parent.firstName || '',
      lastName: parent.lastName || '',
      email: parent.email || '',
      contactNumber: parent.contactNumber || '',
      relationship: parent.relationship || '',
      status: this.normalizeStatus(parent.status) || 'active',
      createdAt: parent.createdAt || '',
      updatedAt: parent.updatedAt || '',
    };

    this.showModal = true;
    this.cdr.detectChanges();
  }

  closeModal(): void {
    this.zone.run(() => {
      this.showModal = false;
      this.editing = false;
      this.isSaving = false;
      this.form = this.createEmptyForm();
      this.cdr.detectChanges();
    });
  }

  saveParent(): void {
    if (!this.isFormValid()) {
      this.alert.warning('Missing details', 'Please complete all required parent information.');
      return;
    }

    this.isSaving = true;
    const isEditing = this.editing;

    const payload: Parent = {
      ...this.form,
      firstName: this.form.firstName.trim(),
      lastName: this.form.lastName.trim(),
      email: this.form.email.trim().toLowerCase(),
      contactNumber: this.form.contactNumber.trim(),
      relationship: this.form.relationship.trim(),
      status: this.normalizeStatus(this.form.status) || 'active',
      userId: this.form.userId?.trim() || '',
      studentId: this.form.studentId?.trim() || '',
      studentIds: this.form.studentIds || [],
    };

    const request = isEditing
      ? this.parentService.updateParent(payload)
      : this.parentService.addParent(payload);

    request.pipe(take(1)).subscribe({
      next: () => {
        this.zone.run(() => {
          this.closeModal();
          this.loadParents();
        });

        setTimeout(() => {
          this.alert.success(
            isEditing ? 'Parent record updated' : 'Parent record added',
            isEditing
              ? 'The parent/guardian record was updated successfully.'
              : 'The parent/guardian record was added successfully.',
          );
        }, 150);
      },
      error: () => {
        this.zone.run(() => {
          this.isSaving = false;
          this.cdr.detectChanges();
        });

        this.alert.error(
          isEditing ? 'Update failed' : 'Create failed',
          'Unable to save parent record right now.',
        );
      },
    });
  }

  archiveParent(parent: Parent): void {
    this.alert
      .confirm(
        'Archive parent record?',
        `Archive ${parent.firstName} ${parent.lastName}? The record will be hidden from the main directory.`,
      )
      .then((confirmed) => {
        if (!confirmed) return;
        this.updateParentStatus(parent, 'archived');
      });
  }

  restoreParent(parent: Parent): void {
    this.alert
      .confirm(
        'Restore parent record?',
        `Restore ${parent.firstName} ${parent.lastName} back to the active directory?`,
      )
      .then((confirmed) => {
        if (!confirmed) return;
        this.updateParentStatus(parent, 'active');
      });
  }

  permanentlyDeleteParent(parent: Parent): void {
    if (!parent.id) {
      this.alert.warning('Missing ID', 'This parent record has no valid ID.');
      return;
    }

    const parentId = parent.id;

    this.alert
      .confirm(
        'Permanently delete parent?',
        `This will permanently delete ${parent.firstName} ${parent.lastName}. This action cannot be undone.`,
      )
      .then((confirmed) => {
        if (!confirmed) return;

        this.parentService
          .deleteParent(parentId)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.zone.run(() => {
                this.parents = this.parents.filter((item) => item.id !== parentId);
                this.applyFilters();
                this.cdr.detectChanges();
              });

              this.alert.success(
                'Parent permanently deleted',
                'The archived parent record was permanently removed from Firebase.',
              );

              this.loadParents();
            },
            error: (error) => {
              this.alert.error(
                'Delete failed',
                error?.message || 'Unable to delete parent record.',
              );
            },
          });
      });
  }

  private updateParentStatus(parent: Parent, status: string): void {
    const updated: Parent = {
      ...parent,
      status,
    };

    this.parentService
      .updateParent(updated)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.alert.success(
            status === 'archived' ? 'Parent archived' : 'Parent restored',
            status === 'archived'
              ? 'The parent/guardian record was moved to archive.'
              : 'The parent/guardian record was restored successfully.',
          );

          this.loadParents();
        },
        error: () => {
          this.alert.error('Status update failed', 'Unable to update parent status.');
        },
      });
  }

  onSearchChange(value: string): void {
    this.search = value;
    this.applyFilters();
  }

  setStatusFilter(filter: ParentStatusFilter): void {
    this.statusFilter = filter;
    this.applyFilters();
  }

  get totalParents(): number {
    return this.parents.filter((parent) => !this.isArchived(parent)).length;
  }

  get activeParents(): number {
    return this.parents.filter((parent) => this.normalizeStatus(parent.status) === 'active').length;
  }

  get linkedAccounts(): number {
    return this.parents.filter((parent) => !!parent.userId?.trim() && !this.isArchived(parent))
      .length;
  }

  get recordCountLabel(): string {
    return `${this.filteredList.length} parent/guardian record(s)`;
  }

  getParentFullName(parent: Parent): string {
    return `${parent.firstName || ''} ${parent.lastName || ''}`.trim();
  }

  getParentInitials(parent: Parent): string {
    const first = parent.firstName?.charAt(0) || '';
    const last = parent.lastName?.charAt(0) || '';
    return `${first}${last}`.toUpperCase() || 'PG';
  }

  getLinkedStudentLabel(parent: Parent): string {
    if (parent.studentIds?.length) {
      return `${parent.studentIds.length} Linked Student(s)`;
    }

    if (parent.studentId) {
      return '1 Linked Student';
    }

    return 'Not Linked';
  }

  getAccountLabel(parent: Parent): string {
    return parent.userId ? 'Generated' : 'Not Generated';
  }

  getAccountVariant(parent: Parent): 'green' | 'red' | 'neutral' {
    return parent.userId ? 'green' : 'neutral';
  }

  getStatusLabel(status: string | undefined): string {
    const normalized = this.normalizeStatus(status);

    if (normalized === 'active') return 'Active';
    if (normalized === 'inactive') return 'Inactive';
    if (normalized === 'archived') return 'Archived';

    return 'Unknown';
  }

  getStatusVariant(status: string | undefined): 'green' | 'red' | 'neutral' {
    const normalized = this.normalizeStatus(status);

    if (normalized === 'active') return 'green';
    if (normalized === 'inactive') return 'red';
    return 'neutral';
  }

  isArchived(parent: Parent): boolean {
    return this.normalizeStatus(parent.status) === 'archived';
  }

  isArchiveView(): boolean {
    return this.statusFilter === 'archived';
  }

  trackByParent(index: number, parent: Parent): string | number {
    return parent.id || parent.email || index;
  }

  private applyFilters(): void {
    const keyword = this.search.trim().toLowerCase();

    this.filteredList = this.parents.filter((parent) => {
      const fullName = `${parent.firstName} ${parent.lastName}`.toLowerCase();
      const email = (parent.email || '').toLowerCase();
      const contactNumber = (parent.contactNumber || '').toLowerCase();
      const relationship = (parent.relationship || '').toLowerCase();
      const studentId = (parent.studentId || '').toLowerCase();
      const status = this.normalizeStatus(parent.status);
      const accountStatus = parent.userId ? 'generated linked account' : 'not generated';

      const matchesSearch =
        !keyword ||
        fullName.includes(keyword) ||
        email.includes(keyword) ||
        contactNumber.includes(keyword) ||
        relationship.includes(keyword) ||
        studentId.includes(keyword) ||
        status.includes(keyword) ||
        accountStatus.includes(keyword);

      const matchesStatus =
        this.statusFilter === 'all' ? status !== 'archived' : status === this.statusFilter;

      return matchesSearch && matchesStatus;
    });
  }

  private isFormValid(): boolean {
    return Boolean(
      this.form.firstName?.trim() &&
      this.form.lastName?.trim() &&
      this.form.email?.trim() &&
      this.form.contactNumber?.trim() &&
      this.form.relationship?.trim(),
    );
  }

  private normalizeStatus(status: string | undefined): string {
    return (status || '').trim().toLowerCase();
  }

  private createEmptyForm(): Parent {
    return {
      firstName: '',
      lastName: '',
      email: '',
      contactNumber: '',
      relationship: '',
      status: 'active',
      userId: '',
      studentId: '',
      studentIds: [],
    };
  }
}
