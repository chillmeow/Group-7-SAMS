import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, from, of } from 'rxjs';
import { catchError, concatMap, finalize, map, take, toArray } from 'rxjs/operators';
import * as XLSX from 'xlsx';

import { ParentService } from '../../../../services/parent.service';
import { StudentService } from '../../../../services/student.service';
import { AlertService } from '../../../../services/alert.service';
import { Parent } from '../../../../models/parent.model';
import { Student } from '../../../../models/student.model';

type ParentStatusFilter = 'all' | 'active' | 'inactive' | 'archived';
type ParentViewMode = 'cards' | 'table';
type SummaryTone = 'blue' | 'green' | 'orange' | 'purple';

interface ParentSummaryCard {
  label: string;
  value: number;
  icon: string;
  tone: SummaryTone;
}

interface ImportParentRow {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  relationship: string;
  studentId: string;
  studentIds: string[];
  status: string;
  errors: string[];
  isValid: boolean;
}

interface ImportResult {
  row: ImportParentRow;
  success: boolean;
  message: string;
}

@Component({
  selector: 'app-manage-parents',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manage-parents.html',
  styleUrl: './manage-parents.scss',
})
export class ManageParents implements OnInit {
  private readonly parentService = inject(ParentService);
  private readonly studentService = inject(StudentService);
  private readonly alert = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  parents: Parent[] = [];
  students: Student[] = [];
  filteredList: Parent[] = [];

  search = '';
  statusFilter: ParentStatusFilter = 'all';
  viewMode: ParentViewMode = 'cards';

  isLoading = false;
  isSaving = false;

  showModal = false;
  editing = false;

  showImportModal = false;
  importFileName = '';
  importRows: ImportParentRow[] = [];
  isImporting = false;
  importProgress = 0;
  importTotal = 0;

  linkedStudentInput = '';

  readonly relationshipOptions: string[] = ['Mother', 'Father', 'Guardian'];

  form: Parent = this.createEmptyForm();

  ngOnInit(): void {
    this.loadParents();
  }

  get summaryCards(): ParentSummaryCard[] {
    return [
      {
        label: 'Total Guardians',
        value: this.totalParents,
        icon: 'pi pi-users',
        tone: 'blue',
      },
      {
        label: 'Active Guardians',
        value: this.activeParents,
        icon: 'pi pi-check-circle',
        tone: 'green',
      },
      {
        label: 'Linked Students',
        value: this.totalLinkedStudents,
        icon: 'pi pi-link',
        tone: 'purple',
      },
      {
        label: 'Portal Accounts',
        value: this.linkedAccountParents,
        icon: 'pi pi-id-card',
        tone: 'orange',
      },
    ];
  }

  get totalParents(): number {
    return this.parents.filter((parent) => !this.isArchived(parent)).length;
  }

  get activeParents(): number {
    return this.parents.filter((parent) => this.getParentStatusValue(parent) === 'active').length;
  }

  get inactiveParents(): number {
    return this.parents.filter((parent) => this.getParentStatusValue(parent) === 'inactive').length;
  }

  get archivedParents(): number {
    return this.parents.filter((parent) => this.getParentStatusValue(parent) === 'archived').length;
  }

  get linkedAccountParents(): number {
    return this.parents.filter((parent) => !!parent.userId?.trim() && !this.isArchived(parent))
      .length;
  }

  get totalLinkedStudents(): number {
    return this.parents
      .filter((parent) => !this.isArchived(parent))
      .reduce((total, parent) => total + this.getLinkedStudentCount(parent), 0);
  }

  get recordCountLabel(): string {
    return `${this.filteredList.length} parent/guardian record(s)`;
  }

  get validImportRows(): ImportParentRow[] {
    return this.importRows.filter((row) => row.isValid);
  }

  get invalidImportRows(): ImportParentRow[] {
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

  loadParents(): void {
    this.isLoading = true;

    forkJoin({
      parents: this.parentService.getParents().pipe(take(1)),
      students: this.studentService.getStudents().pipe(
        take(1),
        catchError(() => of([] as Student[])),
      ),
    }).subscribe({
      next: ({ parents, students }) => {
        this.zone.run(() => {
          this.parents = parents ?? [];
          this.students = students ?? [];
          this.applyFilters();
          this.isLoading = false;
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.zone.run(() => {
          this.parents = [];
          this.students = [];
          this.filteredList = [];
          this.isLoading = false;
          this.cdr.detectChanges();
        });

        this.alert.warning(
          'Unable to load parent records',
          'Parent or guardian data is currently unavailable. Please try again later.',
        );
      },
    });
  }

  openAdd(): void {
    this.editing = false;
    this.form = this.createEmptyForm();
    this.linkedStudentInput = '';
    this.showModal = true;
    this.cdr.detectChanges();
  }

  openEdit(parent: Parent): void {
    this.editing = true;

    this.form = {
      id: parent.id,
      userId: parent.userId || '',
      studentId: parent.studentId || '',
      studentIds: parent.studentIds || (parent.studentId ? [parent.studentId] : []),
      firstName: parent.firstName || '',
      lastName: parent.lastName || '',
      email: parent.email || '',
      contactNumber: parent.contactNumber || '',
      relationship: parent.relationship || '',
      status:
        this.getParentStatusValue(parent) === 'archived'
          ? 'active'
          : this.getParentStatusValue(parent),
      isArchived: parent.isArchived ?? false,
      archivedAt: parent.archivedAt ?? '',
      createdAt: parent.createdAt ?? '',
      updatedAt: parent.updatedAt ?? '',
    };

    this.linkedStudentInput = this.getLinkedStudentNumbersForInput(parent);
    this.showModal = true;
    this.cdr.detectChanges();
  }

  closeModal(): void {
    this.zone.run(() => {
      this.showModal = false;
      this.editing = false;
      this.isSaving = false;
      this.linkedStudentInput = '';
      this.form = this.createEmptyForm();
      this.cdr.detectChanges();
    });
  }

  saveParent(): void {
    if (!this.isFormValid()) {
      this.alert.warning(
        'Incomplete record',
        'Please complete all required parent or guardian details before saving.',
      );
      return;
    }

    const linkedStudentValues = this.parseLinkedStudentInput(this.linkedStudentInput);
    const linkedStudentResolution =
      this.resolveStudentIdentifiersToInternalIds(linkedStudentValues);

    if (linkedStudentResolution.unmatched.length > 0) {
      this.alert.warning(
        'Student number not found',
        `Please check the linked student number(s): ${linkedStudentResolution.unmatched.join(', ')}`,
      );
      return;
    }

    this.isSaving = true;
    const isEditing = this.editing;
    const now = new Date().toISOString();

    const payload: Parent = {
      ...this.form,
      userId: this.form.userId?.trim() || '',
      studentId: linkedStudentResolution.ids[0] || '',
      studentIds: linkedStudentResolution.ids,
      firstName: this.normalizeText(this.form.firstName),
      lastName: this.normalizeText(this.form.lastName),
      email: this.normalizeText(this.form.email).toLowerCase(),
      contactNumber: this.normalizeText(this.form.contactNumber),
      relationship: this.normalizeText(this.form.relationship),
      status: this.normalizeStatus(this.form.status) || 'active',
      isArchived: false,
      archivedAt: '',
      createdAt: this.form.createdAt || now,
      updatedAt: now,
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
              ? 'The parent or guardian record was updated successfully.'
              : 'The parent or guardian record was added successfully.',
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
          error?.message || 'Unable to save the parent record right now. Please try again.',
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
            this.alert.warning('No records found', 'The selected file has no parent rows.');
            return;
          }

          this.importFileName = file.name;
          this.importRows = this.buildImportRows(rawRows);
          this.showImportModal = true;
          this.importProgress = 0;
          this.importTotal = 0;
          this.cdr.detectChanges();
        } catch (error) {
          console.error('Parent Excel import error:', error);
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

  confirmImportParents(): void {
    const rowsToImport = this.validImportRows;

    if (!rowsToImport.length) {
      this.alert.warning('No valid rows', 'There are no valid parent records ready for import.');
      return;
    }

    this.alert
      .confirm(
        'Import parent records?',
        `This will import ${rowsToImport.length} validated parent/guardian record(s). Portal accounts will still be generated separately from Manage Users.`,
      )
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.runParentImport(rowsToImport);
      });
  }

  formatImportErrors(row: ImportParentRow): string {
    return row.errors.length ? row.errors.join(', ') : 'Ready';
  }

  formatImportLinkedStudents(row: ImportParentRow): string {
    if (!row.studentIds.length) {
      return '—';
    }

    return row.studentIds
      .map((studentId) => this.getStudentNumberFromStoredValue(studentId))
      .join(', ');
  }

  toggleParentStatus(parent: Parent): void {
    const currentStatus = this.getParentStatusValue(parent);
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const actionLabel = nextStatus === 'active' ? 'reactivate' : 'deactivate';

    this.alert
      .confirm(
        `${this.toTitleCase(actionLabel)} parent?`,
        `${this.toTitleCase(actionLabel)} ${this.getParentFullName(parent)}?`,
      )
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.updateParentStatus(parent, nextStatus);
      });
  }

  removeParent(parent: Parent): void {
    this.alert
      .confirm(
        'Move parent to archive?',
        `${this.getParentFullName(parent)} will be moved to Archive and can still be restored later.`,
      )
      .then((confirmed) => {
        if (!confirmed || !parent.id) {
          return;
        }

        this.parentService
          .deleteParent(parent.id)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.alert.success('Parent archived', 'The parent record was moved to Archive.');
              this.loadParents();
            },
            error: (error) => {
              this.alert.warning(
                'Archive failed',
                error?.message || 'Unable to archive this parent record right now.',
              );
            },
          });
      });
  }

  restoreArchivedParent(parent: Parent): void {
    this.alert
      .confirm(
        'Restore archived parent?',
        `${this.getParentFullName(parent)} will be restored to the active parent directory.`,
      )
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.updateParentStatus(parent, 'active');
      });
  }

  setViewMode(mode: ParentViewMode): void {
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

  setStatusFilter(filter: ParentStatusFilter): void {
    this.statusFilter = filter;
    this.applyFilters();
  }

  getFilterCount(filter: ParentStatusFilter): number {
    if (filter === 'all') {
      return this.parents.filter((parent) => !this.isArchived(parent)).length;
    }

    return this.parents.filter((parent) => this.getParentStatusValue(parent) === filter).length;
  }

  getModalTitle(): string {
    return this.editing ? 'Edit Parent / Guardian' : 'Add Parent / Guardian';
  }

  getParentFullName(parent: Parent): string {
    return `${parent.firstName || ''} ${parent.lastName || ''}`.trim() || 'Unnamed Parent';
  }

  getParentInitials(parent: Parent): string {
    const first = parent.firstName?.charAt(0) || '';
    const last = parent.lastName?.charAt(0) || '';

    return `${first}${last}`.toUpperCase() || 'PG';
  }

  getRelationshipLabel(parent: Parent): string {
    return parent.relationship?.trim() || 'Guardian';
  }

  getLinkedStudentCount(parent: Parent): number {
    return this.getStoredLinkedStudentValues(parent).length;
  }

  getLinkedStudentLabel(parent: Parent): string {
    const count = this.getLinkedStudentCount(parent);

    if (count <= 0) {
      return 'No linked student';
    }

    return count === 1 ? '1 linked student' : `${count} linked students`;
  }

  getLinkedStudentIdsText(parent: Parent): string {
    const values = this.getStoredLinkedStudentValues(parent);

    if (!values.length) {
      return 'No linked student number';
    }

    return values.map((value) => this.getStudentNumberFromStoredValue(value)).join(', ');
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

  getParentStatusLabel(parent: Parent): string {
    return this.getStatusLabel(this.getParentStatusValue(parent));
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

  getParentStatusClass(parent: Parent): string {
    return this.getStatusClass(this.getParentStatusValue(parent));
  }

  getAccountLabel(parent: Parent): string {
    return parent.userId ? 'Linked' : 'Not Generated';
  }

  getAccountClass(parent: Parent): string {
    return parent.userId ? 'linked' : 'pending';
  }

  getActionLabel(parent: Parent): string {
    return this.getParentStatusValue(parent) === 'active' ? 'Deactivate' : 'Activate';
  }

  getActionClass(parent: Parent): string {
    return this.getParentStatusValue(parent) === 'active' ? 'deactivate' : 'activate';
  }

  isArchived(parent: Parent): boolean {
    return parent.isArchived === true || this.normalizeStatus(parent.status) === 'archived';
  }

  isArchiveView(): boolean {
    return this.statusFilter === 'archived';
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByParent(index: number, parent: Parent): string | number {
    return parent.id || parent.email || index;
  }

  trackByImportRow(index: number, row: ImportParentRow): string {
    return `${row.rowNumber}-${row.email || index}`;
  }

  private runParentImport(rowsToImport: ImportParentRow[]): void {
    this.isImporting = true;
    this.importProgress = 0;
    this.importTotal = rowsToImport.length;

    from(rowsToImport)
      .pipe(
        concatMap((row) =>
          this.parentService.addParent(this.createParentFromImportRow(row)).pipe(
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
                message: error?.message || 'Unable to import this parent record.',
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

          this.loadParents();
          this.closeImportModal();

          if (failed.length > 0) {
            this.alert.warning(
              'Import completed with issues',
              `${successful.length} record(s) imported. ${failed.length} record(s) failed and may need review.`,
            );
            return;
          }

          this.alert.success(
            'Parent records imported',
            `${successful.length} parent/guardian record(s) were imported successfully.`,
          );
        },
        error: () => {
          this.alert.warning(
            'Import failed',
            'Unable to complete the parent import. Please try again.',
          );
        },
      });
  }

  private buildImportRows(rawRows: Record<string, unknown>[]): ImportParentRow[] {
    const existingEmails = new Set(
      this.parents.map((parent) => this.normalizeText(parent.email).toLowerCase()).filter(Boolean),
    );

    const emailCounts = new Map<string, number>();

    rawRows.forEach((row) => {
      const email = this.getColumnValue(row, [
        'Email',
        'Email Address',
        'Parent Email',
        'Guardian Email',
      ]).toLowerCase();

      if (!email) {
        return;
      }

      emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
    });

    return rawRows.map((row, index) => {
      const fullName = this.getColumnValue(row, [
        'Full Name',
        'Parent Name',
        'Guardian Name',
        'Name',
      ]);

      const splitName = this.splitFullName(fullName);

      const firstName =
        this.getColumnValue(row, [
          'First Name',
          'Firstname',
          'Parent First Name',
          'Guardian First Name',
        ]) || splitName.firstName;

      const lastName =
        this.getColumnValue(row, [
          'Last Name',
          'Lastname',
          'Surname',
          'Parent Last Name',
          'Guardian Last Name',
        ]) || splitName.lastName;

      const email = this.getColumnValue(row, [
        'Email',
        'Email Address',
        'Parent Email',
        'Guardian Email',
      ]).toLowerCase();

      const contactNumber = this.getColumnValue(row, [
        'Contact Number',
        'Parent Contact Number',
        'Guardian Contact Number',
        'Phone',
        'Mobile Number',
      ]);

      const relationship =
        this.getColumnValue(row, [
          'Relationship',
          'Parent Relationship',
          'Guardian Relationship',
        ]) || 'Guardian';

      const studentIdentifier = this.getColumnValue(row, [
        'Student Number',
        'Student No',
        'Student No.',
        'Student ID Number',
        'Linked Student Number',
        'Student ID',
        'Student Doc ID',
        'Linked Student ID',
        'StudentId',
      ]);

      const studentIdentifiersText = this.getColumnValue(row, [
        'Student Numbers',
        'Student Nos',
        'Linked Student Numbers',
        'Student IDs',
        'Student Ids',
        'Linked Student IDs',
        'Linked Students',
      ]);

      const studentIdentifierList = this.normalizeStudentIds(
        studentIdentifiersText
          ? studentIdentifiersText.split(',')
          : studentIdentifier
            ? [studentIdentifier]
            : [],
      );

      const resolvedStudents = this.resolveStudentIdentifiersToInternalIds(studentIdentifierList);

      const rawStatus = this.getColumnValue(row, ['Status']);
      const normalizedStatus = this.normalizeStatus(rawStatus);
      const status = normalizedStatus === 'inactive' ? 'inactive' : 'active';

      const errors: string[] = [];
      const normalizedEmail = email.toLowerCase();

      if (!firstName) {
        errors.push('First name is required');
      }

      if (!lastName) {
        errors.push('Last name is required');
      }

      if (!email) {
        errors.push('Email is required');
      }

      if (!contactNumber) {
        errors.push('Contact number is required');
      }

      if (!relationship) {
        errors.push('Relationship is required');
      }

      if (resolvedStudents.unmatched.length > 0) {
        errors.push(`Student number not found: ${resolvedStudents.unmatched.join(', ')}`);
      }

      if (normalizedEmail && existingEmails.has(normalizedEmail)) {
        errors.push('Email already exists');
      }

      if (normalizedEmail && (emailCounts.get(normalizedEmail) || 0) > 1) {
        errors.push('Duplicate email in file');
      }

      return {
        rowNumber: index + 2,
        firstName,
        lastName,
        email,
        contactNumber,
        relationship,
        studentId: resolvedStudents.ids[0] || '',
        studentIds: resolvedStudents.ids,
        status,
        errors,
        isValid: errors.length === 0,
      };
    });
  }

  private createParentFromImportRow(row: ImportParentRow): Parent {
    const now = new Date().toISOString();

    return {
      userId: '',
      studentId: row.studentId || row.studentIds[0] || '',
      studentIds: row.studentIds,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email.toLowerCase(),
      contactNumber: row.contactNumber,
      relationship: row.relationship,
      status: row.status || 'active',
      isArchived: false,
      archivedAt: '',
      createdAt: now,
      updatedAt: now,
    };
  }

  private updateParentStatus(parent: Parent, status: string): void {
    const now = new Date().toISOString();

    const updatedParent: Parent = {
      ...parent,
      status,
      isArchived: status === 'archived',
      archivedAt: status === 'archived' ? now : '',
      updatedAt: now,
    };

    this.parentService
      .updateParent(updatedParent)
      .pipe(take(1))
      .subscribe({
        next: () => {
          if (status === 'active') {
            this.alert.success('Parent restored', 'The parent or guardian is now active.');
          } else if (status === 'inactive') {
            this.alert.success(
              'Parent deactivated',
              'The parent or guardian has been marked inactive.',
            );
          } else if (status === 'archived') {
            this.alert.success('Parent archived', 'The parent or guardian was moved to Archive.');
          }

          this.loadParents();
        },
        error: () => {
          this.alert.warning(
            'Status update failed',
            'Unable to update the parent status right now.',
          );
        },
      });
  }

  private applyFilters(): void {
    const keyword = this.search.trim().toLowerCase();

    this.filteredList = this.parents.filter((parent) => {
      const fullName = this.getParentFullName(parent).toLowerCase();
      const email = (parent.email || '').toLowerCase();
      const contactNumber = (parent.contactNumber || '').toLowerCase();
      const relationship = (parent.relationship || '').toLowerCase();
      const status = this.getParentStatusValue(parent);
      const statusLabel = this.getParentStatusLabel(parent).toLowerCase();
      const accountStatus = parent.userId ? 'linked generated account' : 'not generated pending';
      const linkedStudentNumbers = this.getLinkedStudentIdsText(parent).toLowerCase();
      const linkedStudentLabel = this.getLinkedStudentLabel(parent).toLowerCase();

      const matchesSearch =
        !keyword ||
        fullName.includes(keyword) ||
        email.includes(keyword) ||
        contactNumber.includes(keyword) ||
        relationship.includes(keyword) ||
        status.includes(keyword) ||
        statusLabel.includes(keyword) ||
        accountStatus.includes(keyword) ||
        linkedStudentNumbers.includes(keyword) ||
        linkedStudentLabel.includes(keyword);

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

  private getParentStatusValue(parent: Parent): string {
    if (parent.isArchived === true || this.normalizeStatus(parent.status) === 'archived') {
      return 'archived';
    }

    const normalized = this.normalizeStatus(parent.status);

    if (normalized === 'inactive') {
      return 'inactive';
    }

    return 'active';
  }

  private getStoredLinkedStudentValues(parent: Parent): string[] {
    if (parent.studentIds?.length) {
      return this.normalizeStudentIds(parent.studentIds);
    }

    if (parent.studentId?.trim()) {
      return [parent.studentId.trim()];
    }

    return [];
  }

  private getLinkedStudentNumbersForInput(parent: Parent): string {
    const values = this.getStoredLinkedStudentValues(parent);

    return values
      .map((value) => {
        const student = this.findStudentByIdentifier(value);
        return student?.studentNumber || value;
      })
      .join(', ');
  }

  private getStudentNumberFromStoredValue(value: string): string {
    const normalizedValue = this.normalizeText(value);

    if (!normalizedValue) {
      return 'No linked student number';
    }

    const student = this.findStudentByIdentifier(normalizedValue);

    if (student?.studentNumber) {
      return student.studentNumber;
    }

    if (this.looksLikeFirebaseDocumentId(normalizedValue)) {
      return 'Student record not found';
    }

    return normalizedValue;
  }

  private parseLinkedStudentInput(value: string): string[] {
    return this.normalizeStudentIds(value.split(/[,\n;]/g));
  }

  private resolveStudentIdentifiersToInternalIds(identifiers: string[]): {
    ids: string[];
    unmatched: string[];
  } {
    const ids: string[] = [];
    const unmatched: string[] = [];

    identifiers.forEach((identifier) => {
      const student = this.findStudentByIdentifier(identifier);

      if (!student) {
        unmatched.push(identifier);
        return;
      }

      const internalId = student.id || student.studentNumber;

      if (internalId && !ids.includes(internalId)) {
        ids.push(internalId);
      }
    });

    return {
      ids,
      unmatched,
    };
  }

  private findStudentByIdentifier(identifier: string): Student | undefined {
    const normalizedIdentifier = this.normalizeText(identifier).toLowerCase();

    if (!normalizedIdentifier) {
      return undefined;
    }

    return this.students.find((student) => {
      const documentId = this.normalizeText(student.id).toLowerCase();
      const studentNumber = this.normalizeText(student.studentNumber).toLowerCase();

      return documentId === normalizedIdentifier || studentNumber === normalizedIdentifier;
    });
  }

  private looksLikeFirebaseDocumentId(value: string): boolean {
    const normalizedValue = this.normalizeText(value);

    return normalizedValue.length > 12 && /^[A-Za-z0-9_-]+$/.test(normalizedValue);
  }

  private normalizeStatus(status: string | undefined): string {
    return (status || '').trim().toLowerCase();
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private normalizeStudentIds(values: string[]): string[] {
    return values
      .map((value) => this.normalizeText(value))
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index);
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

  private toTitleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  }

  private createEmptyForm(): Parent {
    return {
      userId: '',
      studentId: '',
      studentIds: [],
      firstName: '',
      lastName: '',
      email: '',
      contactNumber: '',
      relationship: '',
      status: 'active',
      isArchived: false,
      archivedAt: '',
      createdAt: '',
      updatedAt: '',
    };
  }
}
