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
  BulkImportResult,
  GeneratedStudentAccount,
  StudentService,
} from '../../../services/student.service';
import { AlertService } from '../../../services/alert.service';
import { Student } from '../../../models/student.model';

import { PageHeader } from '../../shared/ui/page-header/page-header';
import { StatCard } from '../../shared/ui/stat-card/stat-card';
import { StatusBadge } from '../../shared/ui/status-badge/status-badge';
import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { DataToolbar } from '../../shared/ui/data-toolbar/data-toolbar';

type StudentStatusFilter = 'all' | 'active' | 'inactive' | 'archived';

@Component({
  selector: 'app-students',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeader, StatCard, StatusBadge, EmptyState, DataToolbar],
  templateUrl: './students.html',
  styleUrl: './students.scss',
})
export class StudentsComponent implements OnInit {
  private readonly studentService = inject(StudentService);
  private readonly alert = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  @ViewChild('excelInput') excelInput!: ElementRef<HTMLInputElement>;

  students: Student[] = [];
  filteredList: Student[] = [];

  search = '';
  statusFilter: StudentStatusFilter = 'all';

  isLoading = false;
  isSaving = false;
  isGeneratingAccount = false;
  isImporting = false;

  showModal = false;
  showCredentialModal = false;
  editing = false;

  generatedAccount: GeneratedStudentAccount | null = null;
  lastImportResult: BulkImportResult | null = null;

  form: Student = this.createEmptyForm();

  ngOnInit(): void {
    this.loadStudents();
  }

  loadStudents(): void {
    this.isLoading = true;

    this.studentService
      .getStudents()
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.zone.run(() => {
            this.students = data ?? [];
            this.applyFilters();
            this.isLoading = false;
            this.cdr.detectChanges();
          });
        },
        error: () => {
          this.zone.run(() => {
            this.students = [];
            this.filteredList = [];
            this.isLoading = false;
            this.cdr.detectChanges();
          });

          this.alert.warning(
            'Unable to load student directory',
            'Student directory data is currently unavailable. Please try again later.',
          );
        },
      });
  }

  openAdd(): void {
    this.editing = false;
    this.form = this.createEmptyForm();
    this.showModal = true;
    this.cdr.detectChanges();
  }

  openEdit(student: Student): void {
    this.editing = true;
    this.form = {
      id: student.id,
      userId: student.userId || '',
      parentId: student.parentId || '',
      studentNumber: student.studentNumber || '',
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      email: student.email || '',
      sectionId: student.sectionId || '',
      yearLevel: student.yearLevel || '',
      status: student.status || 'active',

      parentFirstName: student.parentFirstName || '',
      parentLastName: student.parentLastName || '',
      parentEmail: student.parentEmail || '',
      parentContactNumber: student.parentContactNumber || '',
      parentRelationship: student.parentRelationship || '',
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

  saveStudent(): void {
    if (!this.isFormValid()) {
      this.alert.warning(
        'Incomplete record',
        'Please complete all required attendance-related student details.',
      );
      return;
    }

    this.isSaving = true;
    const isEditing = this.editing;

    const request = isEditing
      ? this.studentService.updateStudent(this.form)
      : this.studentService.addStudent(this.form);

    request.pipe(take(1)).subscribe({
      next: () => {
        this.zone.run(() => {
          this.closeModal();
          this.loadStudents();
        });

        setTimeout(() => {
          this.alert.success(
            isEditing ? 'Student record updated' : 'Student record added',
            isEditing
              ? 'The attendance-linked student record was updated successfully.'
              : 'The student record was added successfully. Parent information was linked if provided.',
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
          error?.message || 'Unable to save the student record right now. Please try again.',
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

    this.studentService
      .importStudentsFromExcel(file)
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
            `${result.imported} student(s) imported, ${result.skipped} skipped, ${result.accountsGenerated} account(s) generated.`,
          );

          this.loadStudents();
        },
        error: (error) => {
          this.zone.run(() => {
            this.isImporting = false;
            input.value = '';
            this.cdr.detectChanges();
          });

          this.alert.warning(
            'Import failed',
            error?.message || 'Unable to import student records.',
          );
        },
      });
  }

  generatePortalAccount(student: Student): void {
    if (this.isAccountFullyGenerated(student)) {
      this.alert.warning(
        'Account already generated',
        'This student account and linked parent account are already generated.',
      );
      return;
    }

    this.alert
      .confirm(
        'Generate Portal Accounts?',
        `Generate portal accounts for ${student.firstName} ${student.lastName} and the linked parent/guardian?`,
      )
      .then((confirmed) => {
        if (!confirmed) return;

        this.zone.run(() => {
          this.isGeneratingAccount = true;
          this.cdr.detectChanges();
        });

        this.studentService
          .generateStudentPortalAccount(student)
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
                'Portal accounts generated',
                'The selected student account and linked parent account were generated. Check the Parent module and email inboxes.',
              );

              this.loadStudents();
            },
            error: (error) => {
              this.zone.run(() => {
                this.isGeneratingAccount = false;
                this.cdr.detectChanges();
              });

              this.alert.warning(
                'Account generation failed',
                error?.message || 'Unable to generate portal accounts.',
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

  toggleStudentStatus(student: Student): void {
    const currentStatus = this.normalizeStatus(student.status);
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const actionLabel = nextStatus === 'active' ? 'reactivate' : 'deactivate';

    this.alert
      .confirm(
        `${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)} student?`,
        `${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)} ${student.firstName} ${student.lastName} for attendance monitoring?`,
      )
      .then((confirmed) => {
        if (!confirmed) return;
        this.updateStudentStatus(student, nextStatus);
      });
  }

  removeStudent(student: Student): void {
    this.alert
      .confirm(
        'Remove student from directory?',
        `Remove ${student.firstName} ${student.lastName} from the main student directory? The record will be moved to Archive and can still be restored later.`,
      )
      .then((confirmed) => {
        if (!confirmed) return;
        this.updateStudentStatus(student, 'archived');
      });
  }

  restoreArchivedStudent(student: Student): void {
    this.alert
      .confirm(
        'Restore archived student?',
        `Restore ${student.firstName} ${student.lastName} back to the active student directory?`,
      )
      .then((confirmed) => {
        if (!confirmed) return;
        this.updateStudentStatus(student, 'active');
      });
  }

  permanentlyDeleteStudent(student: Student): void {
    if (!student.id) {
      this.alert.warning('Delete failed', 'Student ID is missing.');
      return;
    }

    const studentId = student.id;

    this.alert
      .confirm(
        'Permanently delete student?',
        `This will permanently delete ${student.firstName} ${student.lastName}. This action cannot be undone.`,
      )
      .then((confirmed) => {
        if (!confirmed) return;

        this.studentService
          .deleteStudent(studentId)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.zone.run(() => {
                this.students = this.students.filter((item) => item.id !== studentId);
                this.applyFilters();
                this.cdr.detectChanges();
              });

              this.alert.success(
                'Student permanently deleted',
                'The archived student record was permanently removed from Firebase.',
              );

              this.loadStudents();
            },
            error: (error) => {
              this.alert.warning(
                'Delete failed',
                error?.message || 'Unable to permanently delete this student record right now.',
              );
            },
          });
      });
  }

  private updateStudentStatus(student: Student, status: string): void {
    const updatedStudent: Student = {
      ...student,
      status,
    };

    this.studentService
      .updateStudent(updatedStudent)
      .pipe(take(1))
      .subscribe({
        next: () => {
          if (status === 'active') {
            this.alert.success(
              'Student restored',
              'The student is now back in the active student directory.',
            );
          } else if (status === 'inactive') {
            this.alert.success(
              'Student deactivated',
              'The student has been marked inactive for attendance monitoring.',
            );
          } else if (status === 'archived') {
            this.alert.success(
              'Student moved to archive',
              'The student no longer appears in the main directory but remains available in Archive.',
            );
          }

          this.loadStudents();
        },
        error: () => {
          this.alert.warning(
            'Status update failed',
            'Unable to update the student status right now.',
          );
        },
      });
  }

  onSearchChange(value: string): void {
    this.search = value;
    this.applyFilters();
  }

  setStatusFilter(filter: StudentStatusFilter): void {
    this.statusFilter = filter;
    this.applyFilters();
  }

  get totalStudents(): number {
    return this.students.filter((student) => !this.isArchived(student)).length;
  }

  get activeStudents(): number {
    return this.students.filter((student) => this.normalizeStatus(student.status) === 'active')
      .length;
  }

  get inactiveStudents(): number {
    return this.students.filter((student) => this.normalizeStatus(student.status) === 'inactive')
      .length;
  }

  get archivedStudents(): number {
    return this.students.filter((student) => this.normalizeStatus(student.status) === 'archived')
      .length;
  }

  get attendanceReadyStudents(): number {
    return this.students.filter(
      (student) =>
        this.normalizeStatus(student.status) === 'active' &&
        !!student.sectionId?.trim() &&
        !!student.yearLevel?.trim(),
    ).length;
  }

  get linkedAccountStudents(): number {
    return this.students.filter((student) => !!student.userId?.trim() && !this.isArchived(student))
      .length;
  }

  get recordCountLabel(): string {
    return `${this.filteredList.length} student record(s)`;
  }

  getModalTitle(): string {
    return this.editing ? 'Review Student Record' : 'Add Student Record';
  }

  getModalDescription(): string {
    return this.editing
      ? 'Update the student information used for attendance monitoring.'
      : 'Create a new student record. Parent/guardian details will be linked automatically if provided.';
  }

  getStudentFullName(student: Student): string {
    return `${student.firstName || ''} ${student.lastName || ''}`.trim();
  }

  getStudentInitials(student: Student): string {
    const first = student.firstName?.charAt(0) || '';
    const last = student.lastName?.charAt(0) || '';
    return `${first}${last}`.toUpperCase() || 'ST';
  }

  getStatusVariant(status: string | undefined): 'green' | 'red' | 'neutral' {
    const normalized = this.normalizeStatus(status);

    if (normalized === 'active') return 'green';
    if (normalized === 'inactive') return 'red';
    return 'neutral';
  }

  getStatusLabel(status: string | undefined): string {
    const normalized = this.normalizeStatus(status);

    if (normalized === 'active') return 'Eligible';
    if (normalized === 'inactive') return 'Inactive';
    if (normalized === 'archived') return 'Archived';

    return 'Unknown';
  }

  getAccountLabel(student: Student): string {
    return student.userId ? 'Linked' : 'Not Generated';
  }

  getAccountVariant(student: Student): 'green' | 'red' | 'neutral' {
    return student.userId ? 'green' : 'neutral';
  }

  getActionLabel(status: string | undefined): string {
    return this.normalizeStatus(status) === 'active' ? 'Deactivate' : 'Activate';
  }

  getActionClass(status: string | undefined): string {
    return this.normalizeStatus(status) === 'active' ? 'deactivate' : 'activate';
  }

  isArchived(student: Student): boolean {
    return this.normalizeStatus(student.status) === 'archived';
  }

  isArchiveView(): boolean {
    return this.statusFilter === 'archived';
  }

  hasParentLinked(student: Student): boolean {
    return !!student.parentId?.trim();
  }

  isAccountFullyGenerated(student: Student): boolean {
    return Boolean(student.userId?.trim() && student.parentId?.trim());
  }

  trackByStudent(index: number, student: Student): string | number {
    return student.id || student.studentNumber || index;
  }

  private applyFilters(): void {
    const keyword = this.search.trim().toLowerCase();

    this.filteredList = this.students.filter((student) => {
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      const email = (student.email || '').toLowerCase();
      const studentNumber = (student.studentNumber || '').toLowerCase();
      const sectionId = (student.sectionId || '').toLowerCase();
      const yearLevel = (student.yearLevel || '').toLowerCase();
      const status = this.normalizeStatus(student.status);
      const accountStatus = student.userId ? 'linked generated account' : 'not generated';
      const parentStatus = student.parentId ? 'parent linked guardian linked' : 'no parent';

      const matchesSearch =
        !keyword ||
        fullName.includes(keyword) ||
        email.includes(keyword) ||
        studentNumber.includes(keyword) ||
        sectionId.includes(keyword) ||
        yearLevel.includes(keyword) ||
        status.includes(keyword) ||
        accountStatus.includes(keyword) ||
        parentStatus.includes(keyword);

      const matchesStatus =
        this.statusFilter === 'all' ? status !== 'archived' : status === this.statusFilter;

      return matchesSearch && matchesStatus;
    });
  }

  private isFormValid(): boolean {
    return Boolean(
      this.form.firstName?.trim() &&
      this.form.lastName?.trim() &&
      this.form.studentNumber?.trim() &&
      this.form.sectionId?.trim() &&
      this.form.yearLevel?.trim(),
    );
  }

  private normalizeStatus(status: string | undefined): string {
    return (status || '').trim().toLowerCase();
  }

  private createEmptyForm(): Student {
    return {
      userId: '',
      parentId: '',
      studentNumber: '',
      firstName: '',
      lastName: '',
      email: '',
      sectionId: '',
      yearLevel: '',
      status: 'active',

      parentFirstName: '',
      parentLastName: '',
      parentEmail: '',
      parentContactNumber: '',
      parentRelationship: '',
    };
  }
}
