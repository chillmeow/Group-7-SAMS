import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs/operators';

import {
  FacultyBulkImportResult,
  GeneratedTeacherAccount,
  TeacherService,
} from '../../../services/teacher.service';
import { AlertService } from '../../../services/alert.service';
import { Teacher } from '../../../models/teacher.model';

import { PageHeader } from '../../shared/ui/page-header/page-header';
import { StatCard } from '../../shared/ui/stat-card/stat-card';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { DataToolbar } from '../../shared/ui/data-toolbar/data-toolbar';

type TeacherStatusFilter = 'all' | 'active' | 'inactive' | 'archived';

@Component({
  selector: 'app-teachers',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeader, StatCard, StatusBadge, EmptyState, DataToolbar],
  templateUrl: './teachers.html',
  styleUrl: './teachers.scss',
})
export class TeachersComponent implements OnInit {
  private readonly teacherService = inject(TeacherService);
  private readonly alert = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  @ViewChild('excelInput') excelInput!: ElementRef<HTMLInputElement>;

  teachers: Teacher[] = [];
  filteredList: Teacher[] = [];

  search = '';
  statusFilter: TeacherStatusFilter = 'all';

  isLoading = false;
  isSaving = false;
  isGeneratingAccount = false;
  isImporting = false;

  showModal = false;
  showCredentialModal = false;
  editing = false;

  form: Teacher = this.createEmptyForm();
  generatedAccount: GeneratedTeacherAccount | null = null;
  lastImportResult: FacultyBulkImportResult | null = null;

  ngOnInit(): void {
    this.loadTeachers();
  }

  loadTeachers(): void {
    this.isLoading = true;

    this.teacherService
      .getTeachers()
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.zone.run(() => {
            this.teachers = data ?? [];
            this.applyFilters();
            this.isLoading = false;
            this.cdr.detectChanges();
          });
        },
        error: () => {
          this.zone.run(() => {
            this.teachers = [];
            this.filteredList = [];
            this.isLoading = false;
            this.cdr.detectChanges();
          });

          this.alert.warning(
            'Unable to load faculty directory',
            'Faculty directory data is currently unavailable. Please try again later.',
          );
        },
      });
  }

  openAdd(): void {
    this.editing = false;
    this.form = this.createEmptyForm();
    this.generateEmployeeNo();
    this.showModal = true;
    this.cdr.detectChanges();
  }

  openEdit(teacher: Teacher): void {
    this.editing = true;

    this.form = {
      id: teacher.id,
      employeeNo: teacher.employeeNo || '',
      userId: teacher.userId ?? '',
      firstName: teacher.firstName || '',
      lastName: teacher.lastName || '',
      department: teacher.department || '',
      email: teacher.email || '',
      facultyType: teacher.facultyType || 'instructor',
      status: this.normalizeStatus(teacher.status) || 'active',
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

  saveTeacher(): void {
    if (!this.isFormValid()) {
      this.alert.warning('Incomplete record', 'Please complete all required faculty details.');
      return;
    }

    this.isSaving = true;
    const isEditing = this.editing;

    const request = isEditing
      ? this.teacherService.updateTeacher(this.form)
      : this.teacherService.addTeacher(this.form);

    request.pipe(take(1)).subscribe({
      next: () => {
        this.zone.run(() => {
          this.closeModal();
          this.loadTeachers();
        });

        setTimeout(() => {
          this.alert.success(
            isEditing ? 'Faculty record updated' : 'Faculty record added',
            isEditing
              ? 'The faculty record was updated successfully.'
              : 'The faculty record was added successfully. You may now generate a portal account.',
          );
        }, 150);
      },
      error: () => {
        this.zone.run(() => {
          this.isSaving = false;
          this.cdr.detectChanges();
        });

        this.alert.warning(
          isEditing ? 'Update failed' : 'Create failed',
          'Unable to save the faculty record right now. Please try again.',
        );
      },
    });
  }

  openExcelPicker(): void {
    this.excelInput?.nativeElement?.click();
  }

  onExcelSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    const allowed =
      file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');

    if (!allowed) {
      this.alert.warning('Invalid file', 'Please upload an Excel file only.');
      input.value = '';
      return;
    }

    this.isImporting = true;

    this.teacherService
      .importTeachersFromExcel(file)
      .pipe(take(1))
      .subscribe({
        next: (result) => {
          this.zone.run(() => {
            this.lastImportResult = result;
            this.isImporting = false;
            input.value = '';
            this.cdr.detectChanges();
          });

          this.alert.success(
            'Import completed',
            `${result.imported} faculty record(s) imported, ${result.skipped} skipped.`,
          );

          this.loadTeachers();
        },
        error: (error) => {
          this.zone.run(() => {
            this.isImporting = false;
            input.value = '';
            this.cdr.detectChanges();
          });

          this.alert.warning(
            'Import failed',
            error?.message || 'Unable to import faculty records.',
          );
        },
      });
  }

  generatePortalAccount(teacher: Teacher): void {
    if (teacher.userId) {
      this.alert.warning(
        'Account already linked',
        'This faculty member already has a generated portal account.',
      );
      return;
    }

    this.alert
      .confirm(
        'Generate Faculty Portal Account?',
        `Create a login account for ${teacher.firstName} ${teacher.lastName}?`,
      )
      .then((confirmed) => {
        if (!confirmed) return;

        this.zone.run(() => {
          this.isGeneratingAccount = true;
          this.cdr.detectChanges();
        });

        this.teacherService
          .generateTeacherPortalAccount(teacher)
          .pipe(take(1))
          .subscribe({
            next: (account) => {
              this.zone.run(() => {
                this.generatedAccount = account;
                this.showCredentialModal = true;
                this.isGeneratingAccount = false;
                this.cdr.detectChanges();
              });

              this.alert.success(
                'Faculty account generated',
                'Faculty login credentials were generated successfully.',
              );

              this.loadTeachers();
            },
            error: (error) => {
              this.zone.run(() => {
                this.isGeneratingAccount = false;
                this.cdr.detectChanges();
              });

              this.alert.warning(
                'Account generation failed',
                error?.message || 'Unable to generate faculty portal account.',
              );
            },
          });
      });
  }

  closeCredentialModal(): void {
    this.zone.run(() => {
      this.showCredentialModal = false;
      this.generatedAccount = null;
      this.cdr.detectChanges();
    });
  }

  toggleTeacherStatus(teacher: Teacher): void {
    const currentStatus = this.normalizeStatus(teacher.status);
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const actionLabel = nextStatus === 'active' ? 'reactivate' : 'deactivate';

    this.alert
      .confirm(
        `${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)} faculty?`,
        `${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)} ${teacher.firstName} ${teacher.lastName} for attendance operations?`,
      )
      .then((confirmed) => {
        if (!confirmed) return;
        this.updateTeacherStatus(teacher, nextStatus);
      });
  }

  removeTeacher(teacher: Teacher): void {
    this.alert
      .confirm(
        'Remove faculty from directory?',
        `Remove ${teacher.firstName} ${teacher.lastName} from the main faculty directory? The record will be moved to Archive and can still be restored later.`,
      )
      .then((confirmed) => {
        if (!confirmed) return;
        this.updateTeacherStatus(teacher, 'archived');
      });
  }

  restoreArchivedTeacher(teacher: Teacher): void {
    this.alert
      .confirm(
        'Restore archived faculty?',
        `Restore ${teacher.firstName} ${teacher.lastName} back to the active faculty directory?`,
      )
      .then((confirmed) => {
        if (!confirmed) return;
        this.updateTeacherStatus(teacher, 'active');
      });
  }

  permanentlyDeleteTeacher(teacher: Teacher): void {
    if (!teacher.id) {
      this.alert.warning('Delete failed', 'Faculty ID is missing.');
      return;
    }

    const teacherId = teacher.id;

    this.alert
      .confirm(
        'Permanently delete faculty?',
        `This will permanently delete ${teacher.firstName} ${teacher.lastName}. This action cannot be undone.`,
      )
      .then((confirmed) => {
        if (!confirmed) return;

        this.teacherService
          .deleteTeacher(teacherId)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.zone.run(() => {
                this.teachers = this.teachers.filter((item) => item.id !== teacherId);
                this.applyFilters();
                this.cdr.detectChanges();
              });

              this.alert.success(
                'Faculty permanently deleted',
                'The archived faculty record was permanently removed from Firebase.',
              );

              this.loadTeachers();
            },
            error: (error) => {
              this.alert.warning(
                'Delete failed',
                error?.message || 'Unable to permanently delete this faculty record right now.',
              );
            },
          });
      });
  }

  private updateTeacherStatus(teacher: Teacher, status: string): void {
    const updatedTeacher: Teacher = {
      ...teacher,
      status,
    };

    this.teacherService
      .updateTeacher(updatedTeacher)
      .pipe(take(1))
      .subscribe({
        next: () => {
          if (status === 'active') {
            this.alert.success(
              'Faculty restored',
              'The faculty member is now back in the active faculty directory.',
            );
          } else if (status === 'inactive') {
            this.alert.success(
              'Faculty deactivated',
              'The faculty member has been marked inactive for attendance operations.',
            );
          } else if (status === 'archived') {
            this.alert.success(
              'Faculty moved to archive',
              'The faculty member no longer appears in the main directory but remains available in Archive.',
            );
          }

          this.loadTeachers();
        },
        error: () => {
          this.alert.warning(
            'Status update failed',
            'Unable to update the faculty status right now.',
          );
        },
      });
  }

  onFacultyTypeChange(): void {
    if (!this.editing) {
      this.generateEmployeeNo();
    }
  }

  private generateEmployeeNo(): void {
    const sameTypeCount = this.teachers.filter(
      (teacher) =>
        this.normalizeFacultyType(teacher.facultyType) ===
        this.normalizeFacultyType(this.form.facultyType),
    ).length;

    this.form.employeeNo = this.teacherService.generateFacultyId(
      this.form.facultyType,
      sameTypeCount + 1,
    );
  }

  onSearchChange(value: string): void {
    this.search = value;
    this.applyFilters();
  }

  setStatusFilter(filter: TeacherStatusFilter): void {
    this.statusFilter = filter;
    this.applyFilters();
  }

  get totalTeachers(): number {
    return this.teachers.filter((teacher) => !this.isArchived(teacher)).length;
  }

  get activeTeachers(): number {
    return this.teachers.filter((teacher) => this.normalizeStatus(teacher.status) === 'active')
      .length;
  }

  get inactiveTeachers(): number {
    return this.teachers.filter((teacher) => this.normalizeStatus(teacher.status) === 'inactive')
      .length;
  }

  get attendanceReadyTeachers(): number {
    return this.teachers.filter(
      (teacher) =>
        this.normalizeStatus(teacher.status) === 'active' &&
        !!teacher.department?.trim() &&
        !!teacher.email?.trim(),
    ).length;
  }

  get linkedAccountTeachers(): number {
    return this.teachers.filter((teacher) => !!teacher.userId?.trim() && !this.isArchived(teacher))
      .length;
  }

  get recordCountLabel(): string {
    return `${this.filteredList.length} faculty record(s)`;
  }

  getModalTitle(): string {
    return this.editing ? 'Review Faculty Record' : 'Add Faculty Record';
  }

  getModalDescription(): string {
    return this.editing
      ? 'Update the faculty information used for attendance assignment and session handling.'
      : 'Create a new faculty record before generating a portal account.';
  }

  getTeacherFullName(teacher: Teacher): string {
    return `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
  }

  getTeacherInitials(teacher: Teacher): string {
    const first = teacher.firstName?.charAt(0) || '';
    const last = teacher.lastName?.charAt(0) || '';
    return `${first}${last}`.toUpperCase() || 'FC';
  }

  getFacultyTypeLabel(type: string | undefined): string {
    const normalized = this.normalizeFacultyType(type);

    if (normalized === 'professor') return 'Professor';
    if (normalized === 'assistant professor') return 'Assistant Professor';
    if (normalized === 'associate professor') return 'Associate Professor';
    if (normalized === 'instructor') return 'Instructor';

    return 'Faculty';
  }

  getStatusVariant(status: string | undefined): 'green' | 'red' | 'neutral' {
    const normalized = this.normalizeStatus(status);

    if (normalized === 'active') return 'green';
    if (normalized === 'inactive') return 'red';
    return 'neutral';
  }

  getStatusLabel(status: string | undefined): string {
    const normalized = this.normalizeStatus(status);

    if (normalized === 'active') return 'Available';
    if (normalized === 'inactive') return 'Inactive';
    if (normalized === 'archived') return 'Archived';

    return 'Unknown';
  }

  getAccountLabel(teacher: Teacher): string {
    return teacher.userId ? 'Linked' : 'Not Generated';
  }

  getAccountVariant(teacher: Teacher): 'green' | 'red' | 'neutral' {
    return teacher.userId ? 'green' : 'neutral';
  }

  getActionLabel(status: string | undefined): string {
    return this.normalizeStatus(status) === 'active' ? 'Deactivate' : 'Activate';
  }

  getActionClass(status: string | undefined): string {
    return this.normalizeStatus(status) === 'active' ? 'deactivate' : 'activate';
  }

  isArchived(teacher: Teacher): boolean {
    return this.normalizeStatus(teacher.status) === 'archived';
  }

  isArchiveView(): boolean {
    return this.statusFilter === 'archived';
  }

  trackByTeacher(index: number, teacher: Teacher): string | number {
    return teacher.id || teacher.employeeNo || index;
  }

  private applyFilters(): void {
    const keyword = this.search.trim().toLowerCase();

    this.filteredList = this.teachers.filter((teacher) => {
      const fullName = `${teacher.firstName} ${teacher.lastName}`.toLowerCase();
      const employeeNo = (teacher.employeeNo || '').toLowerCase();
      const department = (teacher.department || '').toLowerCase();
      const email = (teacher.email || '').toLowerCase();
      const facultyType = this.getFacultyTypeLabel(teacher.facultyType).toLowerCase();
      const status = this.normalizeStatus(teacher.status);
      const accountStatus = teacher.userId ? 'linked generated account' : 'not generated';

      const matchesSearch =
        !keyword ||
        fullName.includes(keyword) ||
        employeeNo.includes(keyword) ||
        department.includes(keyword) ||
        email.includes(keyword) ||
        facultyType.includes(keyword) ||
        status.includes(keyword) ||
        accountStatus.includes(keyword);

      const matchesStatus =
        this.statusFilter === 'all' ? status !== 'archived' : status === this.statusFilter;

      return matchesSearch && matchesStatus;
    });
  }

  private isFormValid(): boolean {
    return Boolean(
      this.form.employeeNo?.trim() &&
      this.form.firstName?.trim() &&
      this.form.lastName?.trim() &&
      this.form.department?.trim() &&
      this.form.email?.trim() &&
      this.form.facultyType?.trim(),
    );
  }

  private normalizeStatus(status: string | undefined): string {
    return (status || '').trim().toLowerCase();
  }

  private normalizeFacultyType(type: string | undefined): string {
    return (type || '').trim().toLowerCase();
  }

  private createEmptyForm(): Teacher {
    return {
      employeeNo: '',
      userId: '',
      firstName: '',
      lastName: '',
      department: '',
      email: '',
      facultyType: 'instructor',
      status: 'active',
    };
  }
}
