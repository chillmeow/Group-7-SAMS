import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { from, of } from 'rxjs';
import { catchError, concatMap, finalize, map, take, toArray } from 'rxjs/operators';
import * as XLSX from 'xlsx';

import { StudentService } from '../../../../services/student.service';
import { AlertService } from '../../../../services/alert.service';
import { Student } from '../../../../models/student.model';

type StudentStatusFilter = 'all' | 'active' | 'inactive' | 'archived';
type StudentViewMode = 'cards' | 'table';
type SummaryTone = 'blue' | 'green' | 'orange' | 'purple';

interface StudentSummaryCard {
  label: string;
  value: number;
  icon: string;
  tone: SummaryTone;
}

interface ImportStudentRow {
  rowNumber: number;
  studentNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  program: string;
  sectionId: string;
  yearLevel: string;
  status: string;
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  parentContactNumber: string;
  parentRelationship: string;
  errors: string[];
  isValid: boolean;
}

interface ImportResult {
  row: ImportStudentRow;
  success: boolean;
  message: string;
}

type LegacyStudentFields = Student & {
  course?: string;
  courseName?: string;
  programName?: string;
  academicProgram?: string;
  department?: string;
  departmentProgram?: string;
  programId?: string;
  academicInfo?: {
    program?: string;
    course?: string;
  };
};

@Component({
  selector: 'app-manage-students',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manage-students.html',
  styleUrl: './manage-students.scss',
})
export class ManageStudents implements OnInit {
  private readonly studentService = inject(StudentService);
  private readonly alert = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  students: Student[] = [];
  filteredList: Student[] = [];

  search = '';
  statusFilter: StudentStatusFilter = 'all';
  viewMode: StudentViewMode = 'cards';

  isLoading = false;
  isSaving = false;

  showModal = false;
  editing = false;

  showImportModal = false;
  importFileName = '';
  importRows: ImportStudentRow[] = [];
  isImporting = false;
  importProgress = 0;
  importTotal = 0;

  readonly programOptions: string[] = [
    'Information Technology',
    'Technology Communication Management',
    'Electro-Mechanical Technology',
  ];

  form: Student = this.createEmptyForm();

  ngOnInit(): void {
    this.loadStudents();
  }

  get summaryCards(): StudentSummaryCard[] {
    return [
      {
        label: 'Total Students',
        value: this.totalStudents,
        icon: 'pi pi-users',
        tone: 'blue',
      },
      {
        label: 'Attendance Eligible',
        value: this.attendanceReadyStudents,
        icon: 'pi pi-check-circle',
        tone: 'green',
      },
      {
        label: 'Parent Links',
        value: this.parentLinkedStudents,
        icon: 'pi pi-user-plus',
        tone: 'purple',
      },
      {
        label: 'Portal Accounts',
        value: this.linkedAccountStudents,
        icon: 'pi pi-id-card',
        tone: 'orange',
      },
    ];
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
        !!this.getStudentProgram(student).trim() &&
        this.getStudentProgram(student) !== 'No program' &&
        !!student.sectionId?.trim() &&
        !!student.yearLevel?.trim(),
    ).length;
  }

  get linkedAccountStudents(): number {
    return this.students.filter((student) => !!student.userId?.trim() && !this.isArchived(student))
      .length;
  }

  get parentLinkedStudents(): number {
    return this.students.filter(
      (student) => !!student.parentId?.trim() && !this.isArchived(student),
    ).length;
  }

  get recordCountLabel(): string {
    return `${this.filteredList.length} student record(s)`;
  }

  get validImportRows(): ImportStudentRow[] {
    return this.importRows.filter((row) => row.isValid);
  }

  get invalidImportRows(): ImportStudentRow[] {
    return this.importRows.filter((row) => !row.isValid);
  }

  get validImportCount(): number {
    return this.validImportRows.length;
  }

  get invalidImportCount(): number {
    return this.invalidImportRows.length;
  }

  get importProgressPercent(): number {
    if (!this.importTotal) {
      return 0;
    }

    return Math.round((this.importProgress / this.importTotal) * 100);
  }

  get canConfirmImport(): boolean {
    return !this.isImporting && this.validImportCount > 0;
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
            'Unable to load student records',
            'Student data is currently unavailable. Please try again later.',
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
      program: this.extractStudentProgram(student),
      sectionId: student.sectionId || '',
      yearLevel: student.yearLevel || '',
      status: student.status || 'active',

      parentFirstName: student.parentFirstName || '',
      parentLastName: student.parentLastName || '',
      parentEmail: student.parentEmail || '',
      parentContactNumber: student.parentContactNumber || '',
      parentRelationship: student.parentRelationship || '',

      isArchived: student.isArchived ?? false,
      archivedAt: student.archivedAt ?? '',
      createdAt: student.createdAt ?? '',
      updatedAt: student.updatedAt ?? '',
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
        'Please complete the required student details before saving.',
      );
      return;
    }

    this.isSaving = true;
    const isEditing = this.editing;

    const payload: Student = {
      ...this.form,
      program: this.normalizeProgramName(this.form.program),
      updatedAt: new Date().toISOString(),
      createdAt: this.form.createdAt || new Date().toISOString(),
    };

    const request = isEditing
      ? this.studentService.updateStudent(payload)
      : this.studentService.addStudent(payload);

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
              ? 'The student record was updated successfully.'
              : 'The student record was added successfully.',
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

  openExcelPicker(fileInput: HTMLInputElement): void {
    if (this.isLoading || this.isImporting) {
      return;
    }

    fileInput.click();
  }

  handleExcelFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';

    if (!file) {
      return;
    }

    const fileName = file.name.toLowerCase();
    const isValidFile =
      fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv');

    if (!isValidFile) {
      this.alert.warning(
        'Invalid file type',
        'Please upload an Excel or CSV file using .xlsx, .xls, or .csv format.',
      );
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      this.zone.run(() => {
        try {
          const data = reader.result;
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];

          if (!firstSheetName) {
            this.alert.warning('Empty file', 'The uploaded file does not contain any sheet.');
            return;
          }

          const worksheet = workbook.Sheets[firstSheetName];
          const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
            defval: '',
            raw: false,
          });

          if (!rawRows.length) {
            this.alert.warning('No records found', 'The selected file has no student rows.');
            return;
          }

          this.importFileName = file.name;
          this.importRows = this.buildImportRows(rawRows);
          this.showImportModal = true;
          this.importProgress = 0;
          this.importTotal = 0;
          this.cdr.detectChanges();
        } catch (error) {
          console.error('Excel import error:', error);
          this.alert.warning('Unable to read file', 'Please check the Excel format and try again.');
        }
      });
    };

    reader.onerror = () => {
      this.zone.run(() => {
        this.alert.warning('File read failed', 'Unable to read the selected file.');
      });
    };

    reader.readAsArrayBuffer(file);
  }

  closeImportModal(): void {
    if (this.isImporting) {
      return;
    }

    this.showImportModal = false;
    this.importFileName = '';
    this.importRows = [];
    this.importProgress = 0;
    this.importTotal = 0;
  }

  confirmImportStudents(): void {
    const rowsToImport = this.validImportRows;

    if (!rowsToImport.length) {
      this.alert.warning('No valid rows', 'There are no valid student records ready for import.');
      return;
    }

    this.alert
      .confirm(
        'Import student records?',
        `This will import ${rowsToImport.length} validated student record(s). Portal accounts will still be generated separately from Manage Users.`,
      )
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.runStudentImport(rowsToImport);
      });
  }

  formatImportErrors(row: ImportStudentRow): string {
    return row.errors.length ? row.errors.join(', ') : 'Ready';
  }

  toggleStudentStatus(student: Student): void {
    const currentStatus = this.normalizeStatus(student.status);
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const actionLabel = nextStatus === 'active' ? 'reactivate' : 'deactivate';

    this.alert
      .confirm(
        `${this.toTitleCase(actionLabel)} student?`,
        `${this.toTitleCase(actionLabel)} ${this.getStudentFullName(student)}?`,
      )
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.updateStudentStatus(student, nextStatus);
      });
  }

  removeStudent(student: Student): void {
    this.alert
      .confirm(
        'Move student to archive?',
        `${this.getStudentFullName(student)} will be moved to Archive and can still be restored later.`,
      )
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.updateStudentStatus(student, 'archived');
      });
  }

  restoreArchivedStudent(student: Student): void {
    this.alert
      .confirm(
        'Restore archived student?',
        `${this.getStudentFullName(student)} will be restored to the active student directory.`,
      )
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.updateStudentStatus(student, 'active');
      });
  }

  setViewMode(mode: StudentViewMode): void {
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

  setStatusFilter(filter: StudentStatusFilter): void {
    this.statusFilter = filter;
    this.applyFilters();
  }

  getFilterCount(filter: StudentStatusFilter): number {
    if (filter === 'all') {
      return this.students.filter((student) => !this.isArchived(student)).length;
    }

    return this.students.filter((student) => this.normalizeStatus(student.status) === filter)
      .length;
  }

  getModalTitle(): string {
    return this.editing ? 'Edit Student' : 'Add Student';
  }

  getStudentFullName(student: Student): string {
    return `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unnamed Student';
  }

  getStudentInitials(student: Student): string {
    const first = student.firstName?.charAt(0) || '';
    const last = student.lastName?.charAt(0) || '';

    return `${first}${last}`.toUpperCase() || 'ST';
  }

  getStudentProgram(student: Student): string {
    return this.extractStudentProgram(student) || 'No program';
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

  getAccountLabel(student: Student): string {
    return student.userId ? 'Linked' : 'Not Generated';
  }

  getAccountClass(student: Student): string {
    return student.userId ? 'linked' : 'pending';
  }

  getParentLabel(student: Student): string {
    if (student.parentId?.trim()) {
      return 'Linked';
    }

    if (this.hasCompleteParentDetails(student)) {
      return 'Details Ready';
    }

    return 'Incomplete';
  }

  getParentClass(student: Student): string {
    if (student.parentId?.trim()) {
      return 'linked';
    }

    if (this.hasCompleteParentDetails(student)) {
      return 'ready';
    }

    return 'incomplete';
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

  trackByIndex(index: number): number {
    return index;
  }

  trackByStudent(index: number, student: Student): string | number {
    return student.id || student.studentNumber || index;
  }

  trackByImportRow(index: number, row: ImportStudentRow): string {
    return `${row.rowNumber}-${row.studentNumber || index}`;
  }

  private runStudentImport(rowsToImport: ImportStudentRow[]): void {
    this.isImporting = true;
    this.importProgress = 0;
    this.importTotal = rowsToImport.length;

    from(rowsToImport)
      .pipe(
        concatMap((row) =>
          this.studentService.addStudent(this.createStudentFromImportRow(row)).pipe(
            take(1),
            map(
              () =>
                ({
                  row,
                  success: true,
                  message: 'Imported successfully.',
                }) as ImportResult,
            ),
            catchError((error) =>
              of({
                row,
                success: false,
                message: error?.message || 'Unable to import this student record.',
              } as ImportResult),
            ),
            map((result) => {
              this.importProgress += 1;
              this.cdr.detectChanges();
              return result;
            }),
          ),
        ),
        toArray(),
        finalize(() => {
          this.isImporting = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (results) => {
          const successful = results.filter((result) => result.success);
          const failed = results.filter((result) => !result.success);

          this.loadStudents();
          this.closeImportModal();

          if (failed.length > 0) {
            this.alert.warning(
              'Import completed with issues',
              `${successful.length} record(s) imported. ${failed.length} record(s) failed and may need review.`,
            );
            return;
          }

          this.alert.success(
            'Student records imported',
            `${successful.length} student record(s) were imported successfully.`,
          );
        },
        error: () => {
          this.alert.warning(
            'Import failed',
            'Unable to complete the student import. Please try again.',
          );
        },
      });
  }

  private buildImportRows(rawRows: Record<string, unknown>[]): ImportStudentRow[] {
    const existingStudentNumbers = new Set(
      this.students
        .map((student) => this.normalizeText(student.studentNumber).toLowerCase())
        .filter(Boolean),
    );

    const studentNumberCounts = new Map<string, number>();

    rawRows.forEach((row) => {
      const studentNumber = this.getColumnValue(row, [
        'Student Number',
        'Student No',
        'Student No.',
        'Student ID',
        'StudentID',
        'ID Number',
      ]).toLowerCase();

      if (!studentNumber) {
        return;
      }

      studentNumberCounts.set(studentNumber, (studentNumberCounts.get(studentNumber) || 0) + 1);
    });

    return rawRows.map((row, index) => {
      const fullName = this.getColumnValue(row, ['Full Name', 'Student Name', 'Name']);
      const splitName = this.splitFullName(fullName);

      const firstName =
        this.getColumnValue(row, ['First Name', 'Firstname', 'Given Name']) || splitName.firstName;

      const lastName =
        this.getColumnValue(row, ['Last Name', 'Lastname', 'Surname', 'Family Name']) ||
        splitName.lastName;

      const studentNumber = this.getColumnValue(row, [
        'Student Number',
        'Student No',
        'Student No.',
        'Student ID',
        'StudentID',
        'ID Number',
      ]);

      const email = this.getColumnValue(row, ['Email', 'Email Address', 'Student Email']);

      const sectionId = this.getColumnValue(row, [
        'Section',
        'Section ID',
        'SectionId',
        'Class Section',
      ]);

      const programFromColumn = this.getColumnValue(row, [
        'Program',
        'Course',
        'Academic Program',
        'Department Program',
        'Program Name',
        'Course Name',
      ]);

      const program =
        this.normalizeProgramName(programFromColumn) || this.inferProgramFromSection(sectionId);

      const yearLevel = this.getColumnValue(row, ['Year Level', 'Year', 'Level', 'Grade Level']);

      const rawStatus = this.getColumnValue(row, ['Status']);
      const normalizedStatus = this.normalizeStatus(rawStatus);
      const status = normalizedStatus === 'inactive' ? 'inactive' : 'active';

      const parentFullName = this.getColumnValue(row, [
        'Parent Name',
        'Guardian Name',
        'Parent/Guardian',
      ]);

      const splitParentName = this.splitFullName(parentFullName);

      const parentFirstName =
        this.getColumnValue(row, [
          'Parent First Name',
          'Guardian First Name',
          'Parent FirstName',
        ]) || splitParentName.firstName;

      const parentLastName =
        this.getColumnValue(row, ['Parent Last Name', 'Guardian Last Name', 'Parent LastName']) ||
        splitParentName.lastName;

      const parentEmail = this.getColumnValue(row, [
        'Parent Email',
        'Guardian Email',
        'Parent Email Address',
      ]);

      const parentContactNumber = this.getColumnValue(row, [
        'Parent Contact Number',
        'Guardian Contact Number',
        'Parent Contact',
        'Contact Number',
        'Parent Phone',
      ]);

      const parentRelationship = this.getColumnValue(row, [
        'Parent Relationship',
        'Relationship',
        'Guardian Relationship',
      ]);

      const errors: string[] = [];
      const normalizedStudentNumber = studentNumber.toLowerCase();

      if (!studentNumber) {
        errors.push('Student number is required');
      }

      if (!firstName) {
        errors.push('First name is required');
      }

      if (!lastName) {
        errors.push('Last name is required');
      }

      if (!program) {
        errors.push('Program is required');
      }

      if (!sectionId) {
        errors.push('Section is required');
      }

      if (!yearLevel) {
        errors.push('Year level is required');
      }

      if (normalizedStudentNumber && existingStudentNumbers.has(normalizedStudentNumber)) {
        errors.push('Student number already exists');
      }

      if (normalizedStudentNumber && (studentNumberCounts.get(normalizedStudentNumber) || 0) > 1) {
        errors.push('Duplicate student number in file');
      }

      return {
        rowNumber: index + 2,
        studentNumber,
        firstName,
        lastName,
        email,
        program,
        sectionId,
        yearLevel,
        status,
        parentFirstName,
        parentLastName,
        parentEmail,
        parentContactNumber,
        parentRelationship,
        errors,
        isValid: errors.length === 0,
      };
    });
  }

  private createStudentFromImportRow(row: ImportStudentRow): Student {
    const now = new Date().toISOString();

    return {
      userId: '',
      parentId: '',
      studentNumber: row.studentNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      program: this.normalizeProgramName(row.program),
      sectionId: row.sectionId,
      yearLevel: row.yearLevel,
      status: row.status || 'active',

      parentFirstName: row.parentFirstName,
      parentLastName: row.parentLastName,
      parentEmail: row.parentEmail,
      parentContactNumber: row.parentContactNumber,
      parentRelationship: row.parentRelationship,

      isArchived: false,
      archivedAt: '',
      createdAt: now,
      updatedAt: now,
    };
  }

  private updateStudentStatus(student: Student, status: string): void {
    const now = new Date().toISOString();

    const updatedStudent: Student = {
      ...student,
      program: this.extractStudentProgram(student),
      status,
      isArchived: status === 'archived',
      archivedAt: status === 'archived' ? now : '',
      updatedAt: now,
    };

    this.studentService
      .updateStudent(updatedStudent)
      .pipe(take(1))
      .subscribe({
        next: () => {
          if (status === 'active') {
            this.alert.success('Student restored', 'The student is now active.');
          } else if (status === 'inactive') {
            this.alert.success('Student deactivated', 'The student has been marked inactive.');
          } else if (status === 'archived') {
            this.alert.success('Student archived', 'The student was moved to Archive.');
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

  private applyFilters(): void {
    const keyword = this.search.trim().toLowerCase();

    this.filteredList = this.students.filter((student) => {
      const fullName = `${student.firstName} ${student.lastName}`.toLowerCase();
      const email = (student.email || '').toLowerCase();
      const studentNumber = (student.studentNumber || '').toLowerCase();
      const program = this.getStudentProgram(student).toLowerCase();
      const sectionId = (student.sectionId || '').toLowerCase();
      const yearLevel = (student.yearLevel || '').toLowerCase();
      const status = this.normalizeStatus(student.status);
      const accountStatus = student.userId ? 'linked generated account' : 'not generated pending';
      const parentStatus = student.parentId
        ? 'parent linked guardian linked'
        : this.hasCompleteParentDetails(student)
          ? 'parent details ready guardian details ready'
          : 'incomplete parent details no parent';

      const matchesSearch =
        !keyword ||
        fullName.includes(keyword) ||
        email.includes(keyword) ||
        studentNumber.includes(keyword) ||
        program.includes(keyword) ||
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
      this.form.program?.trim() &&
      this.form.sectionId?.trim() &&
      this.form.yearLevel?.trim(),
    );
  }

  private hasCompleteParentDetails(student: Student): boolean {
    return Boolean(
      student.parentFirstName?.trim() &&
      student.parentLastName?.trim() &&
      student.parentEmail?.trim() &&
      student.parentContactNumber?.trim() &&
      student.parentRelationship?.trim(),
    );
  }

  private extractStudentProgram(student: Student): string {
    const legacyStudent = student as LegacyStudentFields;

    const directProgram =
      this.normalizeProgramName(legacyStudent.program) ||
      this.normalizeProgramName(legacyStudent.programName) ||
      this.normalizeProgramName(legacyStudent.course) ||
      this.normalizeProgramName(legacyStudent.courseName) ||
      this.normalizeProgramName(legacyStudent.academicProgram) ||
      this.normalizeProgramName(legacyStudent.departmentProgram) ||
      this.normalizeProgramName(legacyStudent.department) ||
      this.normalizeProgramName(legacyStudent.programId) ||
      this.normalizeProgramName(legacyStudent.academicInfo?.program) ||
      this.normalizeProgramName(legacyStudent.academicInfo?.course);

    if (directProgram) {
      return directProgram;
    }

    return this.inferProgramFromSection(student.sectionId);
  }

  private inferProgramFromSection(sectionId: string | undefined): string {
    const section = this.normalizeText(sectionId).toUpperCase();

    if (!section) {
      return '';
    }

    if (
      section.includes('BSIT') ||
      section.includes('IT-') ||
      section.startsWith('IT ') ||
      section.startsWith('IT')
    ) {
      return 'Information Technology';
    }

    if (
      section.includes('TCM') ||
      section.includes('BSTCM') ||
      section.includes('TECH COMM') ||
      section.includes('TECHNOLOGY COMMUNICATION')
    ) {
      return 'Technology Communication Management';
    }

    if (
      section.includes('EMT') ||
      section.includes('BSEMT') ||
      section.includes('ELECTRO') ||
      section.includes('ELECTRO-MECHANICAL') ||
      section.includes('ELECTROMECHANICAL')
    ) {
      return 'Electro-Mechanical Technology';
    }

    return '';
  }

  private normalizeProgramName(value: unknown): string {
    const rawValue = this.normalizeText(value);

    if (!rawValue) {
      return '';
    }

    const normalized = rawValue.toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (normalized === 'IT' || normalized === 'BSIT' || normalized === 'INFORMATIONTECHNOLOGY') {
      return 'Information Technology';
    }

    if (
      normalized === 'TCM' ||
      normalized === 'BSTCM' ||
      normalized === 'TECHNOLOGYCOMMUNICATIONMANAGEMENT'
    ) {
      return 'Technology Communication Management';
    }

    if (
      normalized === 'EMT' ||
      normalized === 'BSEMT' ||
      normalized === 'ELECTROMECHANICALTECHNOLOGY' ||
      normalized === 'ELECTROMECHANICALTECH'
    ) {
      return 'Electro-Mechanical Technology';
    }

    const exactProgram = this.programOptions.find(
      (program) => program.toLowerCase() === rawValue.toLowerCase(),
    );

    return exactProgram || rawValue;
  }

  private getColumnValue(row: Record<string, unknown>, possibleHeaders: string[]): string {
    const normalizedHeaders = possibleHeaders.map((header) => this.normalizeColumnHeader(header));

    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = this.normalizeColumnHeader(key);

      if (normalizedHeaders.includes(normalizedKey)) {
        return this.normalizeText(value);
      }
    }

    return '';
  }

  private normalizeColumnHeader(value: string): string {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private splitFullName(fullName: string): { firstName: string; lastName: string } {
    const normalizedFullName = this.normalizeText(fullName);

    if (!normalizedFullName) {
      return {
        firstName: '',
        lastName: '',
      };
    }

    if (normalizedFullName.includes(',')) {
      const [lastName, firstName] = normalizedFullName
        .split(',')
        .map((part) => this.normalizeText(part));

      return {
        firstName,
        lastName,
      };
    }

    const parts = normalizedFullName.split(/\s+/).filter(Boolean);

    if (parts.length === 1) {
      return {
        firstName: parts[0],
        lastName: '',
      };
    }

    return {
      firstName: parts.slice(0, -1).join(' '),
      lastName: parts[parts.length - 1],
    };
  }

  private normalizeStatus(status: string | undefined): string {
    return (status || '').trim().toLowerCase();
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private toTitleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }

  private createEmptyForm(): Student {
    return {
      userId: '',
      parentId: '',
      studentNumber: '',
      firstName: '',
      lastName: '',
      email: '',
      program: '',
      sectionId: '',
      yearLevel: '',
      status: 'active',

      parentFirstName: '',
      parentLastName: '',
      parentEmail: '',
      parentContactNumber: '',
      parentRelationship: '',

      isArchived: false,
      archivedAt: '',
      createdAt: '',
      updatedAt: '',
    };
  }
}
