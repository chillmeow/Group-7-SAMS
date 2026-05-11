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

import { FacultyBulkImportResult, TeacherService } from '../../../../services/teacher.service';
import { AlertService } from '../../../../services/alert.service';
import { Teacher } from '../../../../models/teacher.model';

type TeacherStatusFilter = 'all' | 'active' | 'inactive' | 'archived';
type TeacherViewMode = 'cards' | 'table';
type SummaryTone = 'blue' | 'green' | 'orange' | 'purple';

interface InstructorSummaryCard {
  label: string;
  value: number;
  icon: string;
  tone: SummaryTone;
}

@Component({
  selector: 'app-manage-instructors',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manage-instructors.html',
  styleUrl: './manage-instructors.scss',
})
export class ManageInstructors implements OnInit {
  private readonly teacherService = inject(TeacherService);
  private readonly alert = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  @ViewChild('excelInput') excelInput!: ElementRef<HTMLInputElement>;

  teachers: Teacher[] = [];
  filteredList: Teacher[] = [];

  search = '';
  statusFilter: TeacherStatusFilter = 'all';
  viewMode: TeacherViewMode = 'cards';

  isLoading = false;
  isSaving = false;
  isImporting = false;

  showModal = false;
  editing = false;

  form: Teacher = this.createEmptyForm();
  lastImportResult: FacultyBulkImportResult | null = null;

  readonly departmentOptions: string[] = [
    'Information Technology',
    'Technology Communication Management',
    'Electro-Mechanical Technology',
  ];

  ngOnInit(): void {
    this.loadTeachers();
  }

  get summaryCards(): InstructorSummaryCard[] {
    return [
      {
        label: 'Total Instructors',
        value: this.totalTeachers,
        icon: 'pi pi-briefcase',
        tone: 'blue',
      },
      {
        label: 'Attendance Ready',
        value: this.attendanceReadyTeachers,
        icon: 'pi pi-check-circle',
        tone: 'green',
      },
      {
        label: 'Portal Accounts',
        value: this.linkedAccountTeachers,
        icon: 'pi pi-id-card',
        tone: 'purple',
      },
      {
        label: 'Archived Records',
        value: this.archivedTeachers,
        icon: 'pi pi-archive',
        tone: 'orange',
      },
    ];
  }

  get totalTeachers(): number {
    return this.teachers.filter((teacher) => !this.isArchived(teacher)).length;
  }

  get activeTeachers(): number {
    return this.teachers.filter((teacher) => this.getTeacherStatusValue(teacher) === 'active')
      .length;
  }

  get inactiveTeachers(): number {
    return this.teachers.filter((teacher) => this.getTeacherStatusValue(teacher) === 'inactive')
      .length;
  }

  get archivedTeachers(): number {
    return this.teachers.filter((teacher) => this.getTeacherStatusValue(teacher) === 'archived')
      .length;
  }

  get attendanceReadyTeachers(): number {
    return this.teachers.filter(
      (teacher) =>
        this.getTeacherStatusValue(teacher) === 'active' &&
        !!teacher.department?.trim() &&
        !!teacher.email?.trim(),
    ).length;
  }

  get linkedAccountTeachers(): number {
    return this.teachers.filter((teacher) => !!teacher.userId?.trim() && !this.isArchived(teacher))
      .length;
  }

  get recordCountLabel(): string {
    return `${this.filteredList.length} instructor record(s)`;
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
            'Unable to load instructor records',
            'Instructor data is currently unavailable. Please try again later.',
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
      status:
        this.getTeacherStatusValue(teacher) === 'archived'
          ? 'active'
          : this.getTeacherStatusValue(teacher),
      isArchived: teacher.isArchived ?? false,
      archivedAt: teacher.archivedAt ?? '',
      createdAt: teacher.createdAt ?? '',
      updatedAt: teacher.updatedAt ?? '',
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
      this.alert.warning(
        'Incomplete record',
        'Please complete all required instructor details before saving.',
      );
      return;
    }

    this.isSaving = true;
    const isEditing = this.editing;
    const now = new Date().toISOString();

    const payload: Teacher = {
      ...this.form,
      employeeNo: this.normalizeText(this.form.employeeNo),
      firstName: this.normalizeText(this.form.firstName),
      lastName: this.normalizeText(this.form.lastName),
      department: this.normalizeText(this.form.department),
      email: this.normalizeText(this.form.email),
      facultyType: this.normalizeFacultyType(this.form.facultyType) || 'instructor',
      status: this.normalizeStatus(this.form.status) || 'active',
      isArchived: false,
      archivedAt: '',
      createdAt: this.form.createdAt || now,
      updatedAt: now,
    };

    const request = isEditing
      ? this.teacherService.updateTeacher(payload)
      : this.teacherService.addTeacher(payload);

    request.pipe(take(1)).subscribe({
      next: () => {
        this.zone.run(() => {
          this.closeModal();
          this.loadTeachers();
        });

        setTimeout(() => {
          this.alert.success(
            isEditing ? 'Instructor record updated' : 'Instructor record added',
            isEditing
              ? 'The instructor record was updated successfully.'
              : 'The instructor record was added successfully.',
          );
        }, 150);
      },
      error: (error) => {
        this.zone.run(() => {
          this.isSaving = false;
          this.cdr.detectChanges();
        });

        this.alert.warning(
          isEditing ? 'Update failed' : 'Create failed',
          error?.message || 'Unable to save the instructor record right now. Please try again.',
        );
      },
    });
  }

  openExcelPicker(): void {
    if (this.isLoading || this.isImporting) {
      return;
    }

    this.excelInput?.nativeElement?.click();
  }

  onExcelSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    const fileName = file.name.toLowerCase();
    const allowed = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (!allowed) {
      this.alert.warning('Invalid file', 'Please upload an Excel file using .xlsx or .xls format.');
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
            `${result.imported} instructor record(s) imported, ${result.skipped} skipped.`,
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
            error?.message || 'Unable to import instructor records.',
          );
        },
      });
  }

  toggleTeacherStatus(teacher: Teacher): void {
    const currentStatus = this.getTeacherStatusValue(teacher);
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const actionLabel = nextStatus === 'active' ? 'reactivate' : 'deactivate';

    this.alert
      .confirm(
        `${this.toTitleCase(actionLabel)} instructor?`,
        `${this.toTitleCase(actionLabel)} ${this.getTeacherFullName(teacher)}?`,
      )
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.updateTeacherStatus(teacher, nextStatus);
      });
  }

  removeTeacher(teacher: Teacher): void {
    this.alert
      .confirm(
        'Move instructor to archive?',
        `${this.getTeacherFullName(teacher)} will be moved to Archive and can still be restored later.`,
      )
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.updateTeacherStatus(teacher, 'archived');
      });
  }

  restoreArchivedTeacher(teacher: Teacher): void {
    this.alert
      .confirm(
        'Restore archived instructor?',
        `${this.getTeacherFullName(teacher)} will be restored to the active instructor directory.`,
      )
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.updateTeacherStatus(teacher, 'active');
      });
  }

  permanentlyDeleteTeacher(teacher: Teacher): void {
    if (!teacher.id) {
      this.alert.warning('Delete failed', 'Instructor ID is missing.');
      return;
    }

    const teacherId = teacher.id;

    this.alert
      .confirm(
        'Permanently delete instructor?',
        `${this.getTeacherFullName(teacher)} will be permanently deleted. This action cannot be undone.`,
      )
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }

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
                'Instructor permanently deleted',
                'The archived instructor record was permanently removed from Firebase.',
              );

              this.loadTeachers();
            },
            error: (error) => {
              this.alert.warning(
                'Delete failed',
                error?.message || 'Unable to permanently delete this instructor record right now.',
              );
            },
          });
      });
  }

  onFacultyTypeChange(): void {
    if (!this.editing) {
      this.generateEmployeeNo();
    }
  }

  setViewMode(mode: TeacherViewMode): void {
    this.viewMode = mode;
  }

  onSearchChange(value: string): void {
    this.search = value;
    this.applyFilters();
  }

  clearSearch(): void {
    this.search = '';
    this.applyFilters();
  }

  setStatusFilter(filter: TeacherStatusFilter): void {
    this.statusFilter = filter;
    this.applyFilters();
  }

  getFilterCount(filter: TeacherStatusFilter): number {
    if (filter === 'all') {
      return this.teachers.filter((teacher) => !this.isArchived(teacher)).length;
    }

    return this.teachers.filter((teacher) => this.getTeacherStatusValue(teacher) === filter).length;
  }

  getModalTitle(): string {
    return this.editing ? 'Edit Instructor' : 'Add Instructor';
  }

  getTeacherFullName(teacher: Teacher): string {
    return `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || 'Unnamed Instructor';
  }

  getTeacherInitials(teacher: Teacher): string {
    const first = teacher.firstName?.charAt(0) || '';
    const last = teacher.lastName?.charAt(0) || '';

    return `${first}${last}`.toUpperCase() || 'IN';
  }

  getDepartmentLabel(teacher: Teacher): string {
    return teacher.department?.trim() || 'No department';
  }

  getFacultyTypeLabel(type: string | undefined): string {
    const normalized = this.normalizeFacultyType(type);

    if (normalized === 'professor') {
      return 'Professor';
    }

    if (normalized === 'assistant professor') {
      return 'Assistant Professor';
    }

    if (normalized === 'associate professor') {
      return 'Associate Professor';
    }

    if (normalized === 'instructor') {
      return 'Instructor';
    }

    return 'Instructor';
  }

  getStatusLabel(status: string | undefined): string {
    const normalized = this.normalizeStatus(status);

    if (normalized === 'active') {
      return 'Active';
    }

    if (normalized === 'inactive') {
      return 'Inactive';
    }

    if (normalized === 'archived') {
      return 'Archived';
    }

    return 'Unknown';
  }

  getTeacherStatusLabel(teacher: Teacher): string {
    return this.getStatusLabel(this.getTeacherStatusValue(teacher));
  }

  getStatusClass(status: string | undefined): string {
    const normalized = this.normalizeStatus(status);

    if (normalized === 'active') {
      return 'active';
    }

    if (normalized === 'inactive') {
      return 'inactive';
    }

    if (normalized === 'archived') {
      return 'archived';
    }

    return 'neutral';
  }

  getTeacherStatusClass(teacher: Teacher): string {
    return this.getStatusClass(this.getTeacherStatusValue(teacher));
  }

  getStatusVariant(status: string | undefined): 'green' | 'red' | 'neutral' {
    const normalized = this.normalizeStatus(status);

    if (normalized === 'active') {
      return 'green';
    }

    if (normalized === 'inactive') {
      return 'red';
    }

    return 'neutral';
  }

  getAccountLabel(teacher: Teacher): string {
    return teacher.userId ? 'Linked' : 'Not Generated';
  }

  getAccountClass(teacher: Teacher): string {
    return teacher.userId ? 'linked' : 'pending';
  }

  getAccountVariant(teacher: Teacher): 'green' | 'red' | 'neutral' {
    return teacher.userId ? 'green' : 'neutral';
  }

  getActionLabel(status: string | undefined): string {
    return this.normalizeStatus(status) === 'active' ? 'Deactivate' : 'Activate';
  }

  getTeacherActionLabel(teacher: Teacher): string {
    return this.getTeacherStatusValue(teacher) === 'active' ? 'Deactivate' : 'Activate';
  }

  getActionClass(status: string | undefined): string {
    return this.normalizeStatus(status) === 'active' ? 'deactivate' : 'activate';
  }

  getTeacherActionClass(teacher: Teacher): string {
    return this.getTeacherStatusValue(teacher) === 'active' ? 'deactivate' : 'activate';
  }

  isArchived(teacher: Teacher): boolean {
    return teacher.isArchived === true || this.normalizeStatus(teacher.status) === 'archived';
  }

  isArchiveView(): boolean {
    return this.statusFilter === 'archived';
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByTeacher(index: number, teacher: Teacher): string | number {
    return teacher.id || teacher.employeeNo || index;
  }

  private updateTeacherStatus(teacher: Teacher, status: string): void {
    const now = new Date().toISOString();

    const updatedTeacher: Teacher = {
      ...teacher,
      status,
      isArchived: status === 'archived',
      archivedAt: status === 'archived' ? now : '',
      updatedAt: now,
    };

    this.teacherService
      .updateTeacher(updatedTeacher)
      .pipe(take(1))
      .subscribe({
        next: () => {
          if (status === 'active') {
            this.alert.success('Instructor restored', 'The instructor is now active.');
          } else if (status === 'inactive') {
            this.alert.success(
              'Instructor deactivated',
              'The instructor has been marked inactive.',
            );
          } else if (status === 'archived') {
            this.alert.success('Instructor archived', 'The instructor was moved to Archive.');
          }

          this.loadTeachers();
        },
        error: () => {
          this.alert.warning(
            'Status update failed',
            'Unable to update the instructor status right now.',
          );
        },
      });
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

  private applyFilters(): void {
    const keyword = this.search.trim().toLowerCase();

    this.filteredList = this.teachers.filter((teacher) => {
      const fullName = this.getTeacherFullName(teacher).toLowerCase();
      const employeeNo = (teacher.employeeNo || '').toLowerCase();
      const department = (teacher.department || '').toLowerCase();
      const email = (teacher.email || '').toLowerCase();
      const facultyType = this.getFacultyTypeLabel(teacher.facultyType).toLowerCase();
      const status = this.getTeacherStatusValue(teacher);
      const statusLabel = this.getTeacherStatusLabel(teacher).toLowerCase();
      const accountStatus = teacher.userId ? 'linked generated account' : 'not generated pending';

      const matchesSearch =
        !keyword ||
        fullName.includes(keyword) ||
        employeeNo.includes(keyword) ||
        department.includes(keyword) ||
        email.includes(keyword) ||
        facultyType.includes(keyword) ||
        status.includes(keyword) ||
        statusLabel.includes(keyword) ||
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

  private getTeacherStatusValue(teacher: Teacher): string {
    if (teacher.isArchived === true || this.normalizeStatus(teacher.status) === 'archived') {
      return 'archived';
    }

    const normalized = this.normalizeStatus(teacher.status);

    if (normalized === 'inactive') {
      return 'inactive';
    }

    return 'active';
  }

  private normalizeStatus(status: string | undefined): string {
    return (status || '').trim().toLowerCase();
  }

  private normalizeFacultyType(type: string | undefined): string {
    return (type || '').trim().toLowerCase();
  }

  private normalizeText(value: string | undefined): string {
    return String(value || '').trim();
  }

  private toTitleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
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
      isArchived: false,
      archivedAt: '',
      createdAt: '',
      updatedAt: '',
    };
  }
}
