import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Observable,
  catchError,
  concatMap,
  finalize,
  forkJoin,
  from,
  map,
  of,
  tap,
  toArray,
} from 'rxjs';
import { deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';

import { StudentService } from '../../../../services/student.service';
import { TeacherService } from '../../../../services/teacher.service';
import { ParentService } from '../../../../services/parent.service';

import { Student } from '../../../../models/student.model';
import { Teacher } from '../../../../models/teacher.model';
import { Parent } from '../../../../models/parent.model';
import { db } from '../../../../firebase.config';

type AccountTab = 'students' | 'faculty' | 'parents';
type ManageUserRole = 'student' | 'faculty' | 'parent';
type UserViewMode = 'detailed' | 'catalog';
type ArchiveView = 'active' | 'archived';

interface AccountTabItem {
  id: AccountTab;
  label: string;
  icon: string;
}

interface AccountSummaryCard {
  label: string;
  value: number;
  icon: string;
  tone: 'blue' | 'green' | 'orange' | 'purple';
}

interface ManageUserRecord {
  id: string;
  sourceId: string;
  role: ManageUserRole;
  roleLabel: string;
  fullName: string;
  initials: string;
  username: string;
  email: string;
  status: string;
  details: string;
  linkedInfo: string;
  accountGenerated: boolean;
  accountStatus: 'Generated' | 'Not Generated';
  createdAt: string;
  updatedAt: string;
  student?: Student;
  teacher?: Teacher;
  parent?: Parent;
}

interface BulkGenerationResult {
  record: ManageUserRecord;
  success: boolean;
  message: string;
}

@Component({
  selector: 'app-manage-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manage-users.html',
  styleUrl: './manage-users.scss',
})
export class ManageUsers implements OnInit {
  private readonly studentService = inject(StudentService);
  private readonly teacherService = inject(TeacherService);
  private readonly parentService = inject(ParentService);

  loading = false;
  loadError = '';
  searchTerm = '';
  activeTab: AccountTab = 'students';
  viewMode: UserViewMode = 'detailed';
  archiveView: ArchiveView = 'active';

  processingRecordId = '';
  bulkGenerating = false;
  bulkProgress = 0;
  bulkTotal = 0;

  studentRecords: ManageUserRecord[] = [];
  facultyRecords: ManageUserRecord[] = [];
  parentRecords: ManageUserRecord[] = [];

  private readonly studentsCollectionName = 'students';
  private readonly teachersCollectionName = 'teachers';
  private readonly parentsCollectionName = 'parents';
  private readonly usersCollectionName = 'users';

  readonly tabs: AccountTabItem[] = [
    {
      id: 'students',
      label: 'Students',
      icon: 'pi pi-graduation-cap',
    },
    {
      id: 'faculty',
      label: 'Faculty',
      icon: 'pi pi-briefcase',
    },
    {
      id: 'parents',
      label: 'Parents',
      icon: 'pi pi-user-plus',
    },
  ];

  ngOnInit(): void {
    this.loadRecords();
  }

  get allRecords(): ManageUserRecord[] {
    return [...this.studentRecords, ...this.facultyRecords, ...this.parentRecords];
  }

  get activeRecords(): ManageUserRecord[] {
    return this.allRecords.filter((record) => !this.isArchivedRecord(record));
  }

  get archivedRecords(): ManageUserRecord[] {
    return this.allRecords.filter((record) => this.isArchivedRecord(record));
  }

  get totalRegisteredRecords(): number {
    return this.activeRecords.length;
  }

  get totalGeneratedAccounts(): number {
    return this.activeRecords.filter((record) => record.accountGenerated).length;
  }

  get totalPendingAccounts(): number {
    return this.activeRecords.filter((record) => !record.accountGenerated).length;
  }

  get totalArchivedAccounts(): number {
    return this.archivedRecords.length;
  }

  get totalReadyAccounts(): number {
    return this.activeRecords.filter((record) => this.canGenerateAccountForBulk(record)).length;
  }

  get summaryCards(): AccountSummaryCard[] {
    return [
      {
        label: 'Active Records',
        value: this.totalRegisteredRecords,
        icon: 'pi pi-users',
        tone: 'blue',
      },
      {
        label: 'Generated Accounts',
        value: this.totalGeneratedAccounts,
        icon: 'pi pi-check-circle',
        tone: 'green',
      },
      {
        label: 'Pending Accounts',
        value: this.totalPendingAccounts,
        icon: 'pi pi-clock',
        tone: 'orange',
      },
      {
        label: 'Archived Records',
        value: this.totalArchivedAccounts,
        icon: 'pi pi-archive',
        tone: 'purple',
      },
    ];
  }

  get activeTabRecords(): ManageUserRecord[] {
    if (this.activeTab === 'students') {
      return this.studentRecords;
    }

    if (this.activeTab === 'faculty') {
      return this.facultyRecords;
    }

    return this.parentRecords;
  }

  get activeTabVisibleRecords(): ManageUserRecord[] {
    return this.activeTabRecords.filter((record) =>
      this.archiveView === 'archived'
        ? this.isArchivedRecord(record)
        : !this.isArchivedRecord(record),
    );
  }

  get filteredRecords(): ManageUserRecord[] {
    const keyword = this.searchTerm.trim().toLowerCase();

    if (!keyword) {
      return this.activeTabVisibleRecords;
    }

    return this.activeTabVisibleRecords.filter((record) => {
      const searchableText = [
        record.fullName,
        record.username,
        record.email,
        record.roleLabel,
        record.status,
        record.details,
        record.linkedInfo,
        record.accountStatus,
        this.getRequirementNote(record),
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(keyword);
    });
  }

  get activeTabLabel(): string {
    const selectedTab = this.tabs.find((tab) => tab.id === this.activeTab);
    return selectedTab?.label || 'Users';
  }

  get activeTabPendingCount(): number {
    return this.activeTabVisibleRecords.filter((record) => !record.accountGenerated).length;
  }

  get activeTabGeneratedCount(): number {
    return this.activeTabVisibleRecords.filter((record) => record.accountGenerated).length;
  }

  get activeTabActionablePendingCount(): number {
    if (this.archiveView === 'archived') {
      return 0;
    }

    return this.activeTabVisibleRecords.filter((record) => this.canGenerateAccountForBulk(record))
      .length;
  }

  get activeTabActiveCount(): number {
    return this.activeTabRecords.filter((record) => !this.isArchivedRecord(record)).length;
  }

  get activeTabArchivedCount(): number {
    return this.activeTabRecords.filter((record) => this.isArchivedRecord(record)).length;
  }

  get bulkProgressPercent(): number {
    if (!this.bulkTotal) {
      return 0;
    }

    return Math.round((this.bulkProgress / this.bulkTotal) * 100);
  }

  get generateAllLabel(): string {
    if (this.bulkGenerating) {
      return `Generating ${this.bulkProgress}/${this.bulkTotal}`;
    }

    if (this.archiveView === 'archived') {
      return 'Archive View';
    }

    if (this.activeTab === 'students') {
      return 'Bulk Generate Students';
    }

    if (this.activeTab === 'faculty') {
      return 'Bulk Generate Faculty';
    }

    return 'Parent Accounts Linked';
  }

  loadRecords(): void {
    this.loading = true;
    this.loadError = '';

    forkJoin({
      students: this.studentService.getStudents().pipe(
        catchError((error) => {
          console.error('Failed to load students:', error);
          this.loadError = 'Some student records failed to load.';
          return of([] as Student[]);
        }),
      ),
      teachers: this.teacherService.getTeachers().pipe(
        catchError((error) => {
          console.error('Failed to load faculty records:', error);
          this.loadError = this.loadError
            ? `${this.loadError} Some faculty records failed to load.`
            : 'Some faculty records failed to load.';
          return of([] as Teacher[]);
        }),
      ),
      parents: this.parentService.getParents().pipe(
        catchError((error) => {
          console.error('Failed to load parent records:', error);
          this.loadError = this.loadError
            ? `${this.loadError} Some parent records failed to load.`
            : 'Some parent records failed to load.';
          return of([] as Parent[]);
        }),
      ),
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe(({ students, teachers, parents }) => {
        this.studentRecords = students
          .map((student) => this.mapStudentToRecord(student))
          .sort((a, b) => a.fullName.localeCompare(b.fullName));

        this.facultyRecords = teachers
          .map((teacher) => this.mapTeacherToRecord(teacher))
          .sort((a, b) => a.fullName.localeCompare(b.fullName));

        this.parentRecords = parents
          .map((parent) => this.mapParentToRecord(parent))
          .sort((a, b) => a.fullName.localeCompare(b.fullName));
      });
  }

  setActiveTab(tab: AccountTab): void {
    if (this.bulkGenerating) {
      return;
    }

    this.activeTab = tab;
    this.searchTerm = '';
  }

  setViewMode(mode: UserViewMode): void {
    this.viewMode = mode;
  }

  setArchiveView(view: ArchiveView): void {
    if (this.bulkGenerating) {
      return;
    }

    this.archiveView = view;
    this.searchTerm = '';
  }

  getTabCount(tab: AccountTab): number {
    return this.getRecordsByTab(tab).filter((record) =>
      this.archiveView === 'archived'
        ? this.isArchivedRecord(record)
        : !this.isArchivedRecord(record),
    ).length;
  }

  getTabPendingCount(tab: AccountTab): number {
    if (this.archiveView === 'archived') {
      return 0;
    }

    return this.getRecordsByTab(tab).filter(
      (record) => !this.isArchivedRecord(record) && !record.accountGenerated,
    ).length;
  }

  getTabReadyCount(tab: AccountTab): number {
    if (this.archiveView === 'archived') {
      return 0;
    }

    return this.getRecordsByTab(tab).filter((record) => this.canGenerateAccountForBulk(record))
      .length;
  }

  getTabArchivedCount(tab: AccountTab): number {
    return this.getRecordsByTab(tab).filter((record) => this.isArchivedRecord(record)).length;
  }

  canGenerateAccount(record: ManageUserRecord): boolean {
    if (
      record.accountGenerated ||
      this.loading ||
      this.bulkGenerating ||
      !!this.processingRecordId
    ) {
      return false;
    }

    return this.canGenerateAccountForBulk(record);
  }

  isGenerateButtonDisabled(record: ManageUserRecord): boolean {
    return !this.canGenerateAccount(record);
  }

  getGenerateButtonLabel(record: ManageUserRecord): string {
    if (this.processingRecordId === record.id) {
      return 'Processing...';
    }

    if (this.bulkGenerating) {
      return 'Bulk Running';
    }

    if (record.accountGenerated) {
      return 'Generated';
    }

    if (record.role === 'parent') {
      return 'Linked via Student';
    }

    if (!this.hasRequiredGenerationInfo(record)) {
      return 'Missing Info';
    }

    return 'Generate';
  }

  getGenerateButtonIcon(record: ManageUserRecord): string {
    if (this.processingRecordId === record.id) {
      return 'pi pi-spin pi-spinner';
    }

    if (this.bulkGenerating) {
      return 'pi pi-clock';
    }

    if (record.accountGenerated) {
      return 'pi pi-check-circle';
    }

    if (record.role === 'parent') {
      return 'pi pi-link';
    }

    if (!this.hasRequiredGenerationInfo(record)) {
      return 'pi pi-info-circle';
    }

    return 'pi pi-user-plus';
  }

  getGenerateButtonTitle(record: ManageUserRecord): string {
    if (this.bulkGenerating) {
      return 'Bulk account generation is currently running.';
    }

    if (record.accountGenerated) {
      return 'This account is already generated.';
    }

    if (record.role === 'parent') {
      return 'Parent accounts are generated through the student-parent linking flow.';
    }

    if (!this.hasRequiredGenerationInfo(record)) {
      return this.getRequirementNote(record);
    }

    return `Generate portal account for ${record.fullName}`;
  }

  getAccountStatusClass(record: ManageUserRecord): string {
    return record.accountGenerated ? 'generated' : 'pending';
  }

  getRoleClass(record: ManageUserRecord): string {
    if (record.role === 'student') {
      return 'student';
    }

    if (record.role === 'faculty') {
      return 'faculty';
    }

    return 'parent';
  }

  getStatusClass(record: ManageUserRecord): string {
    const status = record.status.toLowerCase();

    if (status === 'active') {
      return 'active';
    }

    if (status === 'archived') {
      return 'archived';
    }

    if (status === 'inactive') {
      return 'inactive';
    }

    return 'neutral';
  }

  hasRequirementWarning(record: ManageUserRecord): boolean {
    return !record.accountGenerated && !this.hasRequiredGenerationInfo(record);
  }

  hasRequiredGenerationInfo(record: ManageUserRecord): boolean {
    if (record.accountGenerated) {
      return true;
    }

    if (record.role === 'faculty') {
      return Boolean(
        record.teacher?.id && record.teacher?.employeeNo?.trim() && record.teacher?.email?.trim(),
      );
    }

    if (record.role === 'student') {
      return Boolean(
        record.student?.id &&
        record.student?.studentNumber?.trim() &&
        record.student?.email?.trim() &&
        this.hasCompleteParentDetails(record.student),
      );
    }

    return false;
  }

  getRequirementNote(record: ManageUserRecord): string {
    if (this.isArchivedRecord(record)) {
      return 'This account is archived/deactivated. Restore it to make the portal account operational again.';
    }

    if (record.accountGenerated) {
      return 'Portal account is already linked to this record.';
    }

    if (record.role === 'parent') {
      return 'Parent accounts are handled through student account generation to keep linking consistent.';
    }

    if (record.role === 'faculty') {
      if (!record.teacher?.id) {
        return 'Faculty record ID is missing.';
      }

      if (!record.teacher?.employeeNo?.trim()) {
        return 'Faculty ID is required before account generation.';
      }

      if (!record.teacher?.email?.trim()) {
        return 'Faculty email is required before account generation.';
      }

      return 'Ready for faculty portal account generation.';
    }

    if (record.role === 'student') {
      if (!record.student?.id) {
        return 'Student record ID is missing.';
      }

      if (!record.student?.studentNumber?.trim()) {
        return 'Student number is required before account generation.';
      }

      if (!record.student?.email?.trim()) {
        return 'Student email is required before account generation.';
      }

      if (!this.hasCompleteParentDetails(record.student)) {
        return 'Complete parent details are required before generating student and parent accounts.';
      }

      return 'Ready for student and linked parent portal account generation.';
    }

    return 'Review this record before generating an account.';
  }

  isArchivedRecord(record: ManageUserRecord): boolean {
    const status = record.status.toLowerCase();

    return (
      status === 'archived' ||
      record.student?.isArchived === true ||
      record.teacher?.isArchived === true ||
      record.parent?.isArchived === true
    );
  }

  canRunLifecycleAction(record: ManageUserRecord): boolean {
    return (
      !this.loading && !this.bulkGenerating && !this.processingRecordId && Boolean(record.sourceId)
    );
  }

  getArchiveButtonLabel(record: ManageUserRecord): string {
    if (this.processingRecordId === record.id) {
      return 'Processing...';
    }

    return 'Deactivate';
  }

  getRestoreButtonLabel(record: ManageUserRecord): string {
    if (this.processingRecordId === record.id) {
      return 'Processing...';
    }

    return 'Restore';
  }

  getDeleteButtonLabel(record: ManageUserRecord): string {
    if (this.processingRecordId === record.id) {
      return 'Processing...';
    }

    return 'Delete Permanently';
  }

  archiveRecord(record: ManageUserRecord): void {
    if (!this.canRunLifecycleAction(record)) {
      return;
    }

    Swal.fire({
      icon: 'warning',
      title: 'Deactivate Account?',
      html: `
        <p style="margin: 0 0 8px;">This will move <strong>${this.escapeHtml(
          record.fullName,
        )}</strong> to the archive.</p>
        <p style="margin: 0;">The linked portal login will be marked as inactive and will no longer be operational.</p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Deactivate Account',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#d97706',
      cancelButtonColor: '#64748b',
    }).then((result) => {
      if (!result.isConfirmed) {
        return;
      }

      this.processingRecordId = record.id;

      from(this.setRecordArchiveState(record, true))
        .pipe(finalize(() => (this.processingRecordId = '')))
        .subscribe({
          next: () => {
            Swal.fire({
              icon: 'success',
              title: 'Account Deactivated',
              text: `${record.fullName} has been moved to Archive.`,
              confirmButtonColor: '#2563eb',
            });

            this.loadRecords();
          },
          error: (error) => {
            this.showError('Unable to Deactivate Account', this.getErrorMessage(error));
          },
        });
    });
  }

  restoreRecord(record: ManageUserRecord): void {
    if (!this.canRunLifecycleAction(record)) {
      return;
    }

    Swal.fire({
      icon: 'question',
      title: 'Restore Account?',
      html: `
        <p style="margin: 0 0 8px;">This will restore <strong>${this.escapeHtml(
          record.fullName,
        )}</strong> to the active user list.</p>
        <p style="margin: 0;">If a portal login is linked, it will become active again.</p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Restore Account',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#64748b',
    }).then((result) => {
      if (!result.isConfirmed) {
        return;
      }

      this.processingRecordId = record.id;

      from(this.setRecordArchiveState(record, false))
        .pipe(finalize(() => (this.processingRecordId = '')))
        .subscribe({
          next: () => {
            Swal.fire({
              icon: 'success',
              title: 'Account Restored',
              text: `${record.fullName} has been restored to Active users.`,
              confirmButtonColor: '#2563eb',
            });

            this.loadRecords();
          },
          error: (error) => {
            this.showError('Unable to Restore Account', this.getErrorMessage(error));
          },
        });
    });
  }

  deleteRecordPermanently(record: ManageUserRecord): void {
    if (!this.canRunLifecycleAction(record)) {
      return;
    }

    Swal.fire({
      icon: 'error',
      title: 'Delete Permanently?',
      html: `
        <p style="margin: 0 0 8px;">This will permanently delete <strong>${this.escapeHtml(
          record.fullName,
        )}</strong> from the system.</p>
        <p style="margin: 0; color: #b91c1c; font-weight: 700;">This action cannot be undone. Use this only for records that are no longer needed.</p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Delete Permanently',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
    }).then((result) => {
      if (!result.isConfirmed) {
        return;
      }

      this.processingRecordId = record.id;

      from(this.deleteArchivedRecord(record))
        .pipe(finalize(() => (this.processingRecordId = '')))
        .subscribe({
          next: () => {
            Swal.fire({
              icon: 'success',
              title: 'Account Deleted',
              text: `${record.fullName} was permanently deleted.`,
              confirmButtonColor: '#2563eb',
            });

            this.loadRecords();
          },
          error: (error) => {
            this.showError('Unable to Delete Account', this.getErrorMessage(error));
          },
        });
    });
  }

  generateAllPendingForCurrentTab(): void {
    if (this.archiveView === 'archived') {
      Swal.fire({
        icon: 'info',
        title: 'Archive View',
        text: 'Bulk account generation is only available for active records.',
        confirmButtonColor: '#2563eb',
      });
      return;
    }

    if (this.activeTab === 'parents') {
      this.showParentGenerationNotice();
      return;
    }

    const readyRecords = this.activeTabRecords.filter((record) =>
      this.canGenerateAccountForBulk(record),
    );

    if (readyRecords.length <= 0) {
      Swal.fire({
        icon: 'info',
        title: 'No Ready Accounts',
        text: `There are no ${this.activeTabLabel.toLowerCase()} records ready for account generation right now.`,
        confirmButtonColor: '#2563eb',
      });
      return;
    }

    Swal.fire({
      icon: 'question',
      title: 'Bulk Generate Accounts?',
      html: `
        <p style="margin: 0 0 8px;">This will generate <strong>${readyRecords.length}</strong> ${this.activeTabLabel.toLowerCase()} account(s).</p>
        <p style="margin: 0;">Accounts will be processed one by one to avoid failed or duplicate credential sending.</p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Start Bulk Generation',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
    }).then((result) => {
      if (!result.isConfirmed) {
        return;
      }

      this.runBulkAccountGeneration(readyRecords);
    });
  }

  generateAccount(record: ManageUserRecord): void {
    if (record.role === 'parent') {
      this.showParentGenerationNotice();
      return;
    }

    if (record.accountGenerated) {
      Swal.fire({
        icon: 'success',
        title: 'Already Generated',
        text: `${record.fullName} already has a linked portal account.`,
        confirmButtonColor: '#2563eb',
      });
      return;
    }

    if (!this.hasRequiredGenerationInfo(record)) {
      Swal.fire({
        icon: 'warning',
        title: 'Missing Required Information',
        text: this.getRequirementNote(record),
        confirmButtonColor: '#2563eb',
      });
      return;
    }

    if (record.role === 'faculty' && record.teacher) {
      this.confirmAndGenerateFacultyAccount(record);
      return;
    }

    if (record.role === 'student' && record.student) {
      this.confirmAndGenerateStudentAccount(record);
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByRecord(index: number, record: ManageUserRecord): string {
    return record.id || `${record.role}-${index}`;
  }

  private getRecordsByTab(tab: AccountTab): ManageUserRecord[] {
    if (tab === 'students') {
      return this.studentRecords;
    }

    if (tab === 'faculty') {
      return this.facultyRecords;
    }

    return this.parentRecords;
  }

  private getCollectionName(record: ManageUserRecord): string {
    if (record.role === 'student') {
      return this.studentsCollectionName;
    }

    if (record.role === 'faculty') {
      return this.teachersCollectionName;
    }

    return this.parentsCollectionName;
  }

  private getLinkedUserId(record: ManageUserRecord): string {
    if (record.role === 'student') {
      return this.normalizeText(record.student?.userId);
    }

    if (record.role === 'faculty') {
      return this.normalizeText(record.teacher?.userId);
    }

    return this.normalizeText(record.parent?.userId);
  }

  private async setRecordArchiveState(
    record: ManageUserRecord,
    shouldArchive: boolean,
  ): Promise<void> {
    if (!record.sourceId?.trim()) {
      throw new Error('Record ID is missing. Please refresh and try again.');
    }

    const now = new Date().toISOString();
    const recordRef = doc(db, this.getCollectionName(record), record.sourceId);

    await updateDoc(recordRef, {
      status: shouldArchive ? 'archived' : 'active',
      isArchived: shouldArchive,
      archivedAt: shouldArchive ? now : '',
      updatedAt: now,
    });

    const linkedUserId = this.getLinkedUserId(record);

    if (linkedUserId) {
      const userRef = doc(db, this.usersCollectionName, linkedUserId);
      const userSnapshot = await getDoc(userRef);

      if (userSnapshot.exists()) {
        await updateDoc(userRef, {
          status: shouldArchive ? 'inactive' : 'active',
          isArchived: shouldArchive,
          archivedAt: shouldArchive ? now : '',
          updatedAt: now,
        });
      }
    }
  }

  private async deleteArchivedRecord(record: ManageUserRecord): Promise<void> {
    if (!record.sourceId?.trim()) {
      throw new Error('Record ID is missing. Please refresh and try again.');
    }

    if (!this.isArchivedRecord(record)) {
      throw new Error('Only archived records can be permanently deleted.');
    }

    const linkedUserId = this.getLinkedUserId(record);

    await deleteDoc(doc(db, this.getCollectionName(record), record.sourceId));

    if (linkedUserId) {
      await deleteDoc(doc(db, this.usersCollectionName, linkedUserId));
    }
  }

  private canGenerateAccountForBulk(record: ManageUserRecord): boolean {
    if (record.accountGenerated) {
      return false;
    }

    const status = record.status.toLowerCase();

    if (status === 'archived' || status === 'inactive') {
      return false;
    }

    if (record.role === 'parent') {
      return false;
    }

    return this.hasRequiredGenerationInfo(record);
  }

  private runBulkAccountGeneration(records: ManageUserRecord[]): void {
    this.bulkGenerating = true;
    this.bulkProgress = 0;
    this.bulkTotal = records.length;
    this.processingRecordId = 'bulk';

    from(records)
      .pipe(
        concatMap((record) =>
          this.generateSingleAccountForBulk(record).pipe(
            catchError((error) =>
              of({
                record,
                success: false,
                message: this.getErrorMessage(error),
              } as BulkGenerationResult),
            ),
            tap(() => {
              this.bulkProgress += 1;
            }),
          ),
        ),
        toArray(),
        finalize(() => {
          this.bulkGenerating = false;
          this.processingRecordId = '';
        }),
      )
      .subscribe({
        next: (results) => {
          const successful = results.filter((item) => item.success);
          const failed = results.filter((item) => !item.success);

          if (failed.length > 0) {
            Swal.fire({
              icon: successful.length > 0 ? 'warning' : 'error',
              title: 'Bulk Generation Completed',
              html: `
                <p style="margin: 0 0 8px;"><strong>${successful.length}</strong> account(s) generated successfully.</p>
                <p style="margin: 0;"><strong>${failed.length}</strong> account(s) failed and may need review.</p>
              `,
              confirmButtonColor: '#2563eb',
            });
          } else {
            Swal.fire({
              icon: 'success',
              title: 'Bulk Generation Completed',
              text: `${successful.length} account(s) were generated successfully.`,
              confirmButtonColor: '#2563eb',
            });
          }

          this.loadRecords();
        },
        error: (error) => {
          this.showError('Bulk Generation Failed', this.getErrorMessage(error));
          this.loadRecords();
        },
      });
  }

  private generateSingleAccountForBulk(record: ManageUserRecord): Observable<BulkGenerationResult> {
    if (record.role === 'faculty' && record.teacher) {
      return this.teacherService.generateTeacherPortalAccount(record.teacher).pipe(
        map(() => ({
          record,
          success: true,
          message: 'Faculty account generated.',
        })),
      );
    }

    if (record.role === 'student' && record.student) {
      return this.studentService.generateStudentPortalAccount(record.student).pipe(
        map(() => ({
          record,
          success: true,
          message: 'Student account generated.',
        })),
      );
    }

    return of({
      record,
      success: false,
      message: 'This record cannot be processed for bulk generation.',
    });
  }

  private confirmAndGenerateFacultyAccount(record: ManageUserRecord): void {
    Swal.fire({
      icon: 'question',
      title: 'Generate Faculty Account?',
      html: `
        <p style="margin: 0 0 8px;">This will generate portal login credentials for:</p>
        <p style="margin: 0;"><strong>${this.escapeHtml(record.fullName)}</strong></p>
        <p style="margin: 8px 0 0;">Credentials will be sent to <strong>${this.escapeHtml(
          record.email,
        )}</strong>.</p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Generate Account',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
    }).then((result) => {
      if (!result.isConfirmed || !record.teacher) {
        return;
      }

      this.processingRecordId = record.id;

      this.teacherService
        .generateTeacherPortalAccount(record.teacher)
        .pipe(finalize(() => (this.processingRecordId = '')))
        .subscribe({
          next: (generatedAccount) => {
            Swal.fire({
              icon: 'success',
              title: 'Faculty Account Generated',
              html: `
                <p style="margin: 0 0 8px;">Faculty portal credentials were generated successfully.</p>
                <p style="margin: 0;"><strong>Username:</strong> ${this.escapeHtml(
                  generatedAccount.username,
                )}</p>
                <p style="margin: 0;"><strong>Email:</strong> ${this.escapeHtml(
                  generatedAccount.email,
                )}</p>
              `,
              confirmButtonColor: '#2563eb',
            });

            this.loadRecords();
          },
          error: (error) => {
            this.showError('Account Generation Failed', this.getErrorMessage(error));
          },
        });
    });
  }

  private confirmAndGenerateStudentAccount(record: ManageUserRecord): void {
    Swal.fire({
      icon: 'question',
      title: 'Generate Student Account?',
      html: `
        <p style="margin: 0 0 8px;">This will generate portal login credentials for:</p>
        <p style="margin: 0;"><strong>${this.escapeHtml(record.fullName)}</strong></p>
        <p style="margin: 8px 0 0;">
          This may also create or link the parent portal account using the student's parent details.
        </p>
        <p style="margin: 8px 0 0;">
          Student credentials will be sent to <strong>${this.escapeHtml(record.email)}</strong>.
        </p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Generate Account',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
    }).then((result) => {
      if (!result.isConfirmed || !record.student) {
        return;
      }

      this.processingRecordId = record.id;

      this.studentService
        .generateStudentPortalAccount(record.student)
        .pipe(finalize(() => (this.processingRecordId = '')))
        .subscribe({
          next: (generatedAccount) => {
            Swal.fire({
              icon: 'success',
              title: 'Student Account Generated',
              html: `
                <p style="margin: 0 0 8px;">Student portal credentials were generated successfully.</p>
                <p style="margin: 0;"><strong>Username:</strong> ${this.escapeHtml(
                  generatedAccount.username,
                )}</p>
                <p style="margin: 0;"><strong>Email:</strong> ${this.escapeHtml(
                  generatedAccount.email,
                )}</p>
                <p style="margin: 8px 0 0;">If parent details are valid, the linked parent portal account was also handled by the existing student-parent account flow.</p>
              `,
              confirmButtonColor: '#2563eb',
            });

            this.loadRecords();
          },
          error: (error) => {
            this.showError('Account Generation Failed', this.getErrorMessage(error));
          },
        });
    });
  }

  private showParentGenerationNotice(): void {
    Swal.fire({
      icon: 'info',
      title: 'Parent Accounts Are Linked to Students',
      text: 'Parent accounts are generated through the student account generation flow to prevent duplicate parent accounts.',
      confirmButtonColor: '#2563eb',
    });
  }

  private showError(title: string, message: string): void {
    Swal.fire({
      icon: 'error',
      title,
      text: message,
      confirmButtonColor: '#2563eb',
    });
  }

  private mapStudentToRecord(student: Student): ManageUserRecord {
    const userId = this.normalizeText(student.userId);
    const fullName = this.formatFullName(student.firstName, student.lastName);
    const status = this.normalizeStatus(student.status, student.isArchived);

    return {
      id: `student-${student.id || student.studentNumber}`,
      sourceId: student.id || '',
      role: 'student',
      roleLabel: 'Student',
      fullName,
      initials: this.getInitials(student.firstName, student.lastName),
      username: this.normalizeText(student.studentNumber) || 'No student number',
      email: this.normalizeText(student.email) || 'No email',
      status,
      details: this.formatStudentDetails(student),
      linkedInfo: this.formatStudentLinkedInfo(student),
      accountGenerated: !!userId,
      accountStatus: userId ? 'Generated' : 'Not Generated',
      createdAt: this.formatDate(student.createdAt),
      updatedAt: this.formatDate(student.updatedAt),
      student,
    };
  }

  private mapTeacherToRecord(teacher: Teacher): ManageUserRecord {
    const userId = this.normalizeText(teacher.userId || '');
    const fullName = this.formatFullName(teacher.firstName, teacher.lastName);
    const status = this.normalizeStatus(teacher.status, teacher.isArchived);

    return {
      id: `faculty-${teacher.id || teacher.employeeNo}`,
      sourceId: teacher.id || '',
      role: 'faculty',
      roleLabel: 'Faculty',
      fullName,
      initials: this.getInitials(teacher.firstName, teacher.lastName),
      username: this.normalizeText(teacher.employeeNo) || 'No faculty ID',
      email: this.normalizeText(teacher.email) || 'No email',
      status,
      details: this.formatTeacherDetails(teacher),
      linkedInfo: userId ? 'Portal account linked' : 'No portal account yet',
      accountGenerated: !!userId,
      accountStatus: userId ? 'Generated' : 'Not Generated',
      createdAt: this.formatDate(teacher.createdAt),
      updatedAt: this.formatDate(teacher.updatedAt),
      teacher,
    };
  }

  private mapParentToRecord(parent: Parent): ManageUserRecord {
    const userId = this.normalizeText(parent.userId || '');
    const fullName = this.formatFullName(parent.firstName, parent.lastName);
    const status = this.normalizeStatus(parent.status, parent.isArchived);

    return {
      id: `parent-${parent.id || parent.email}`,
      sourceId: parent.id || '',
      role: 'parent',
      roleLabel: 'Parent',
      fullName,
      initials: this.getInitials(parent.firstName, parent.lastName),
      username: this.normalizeText(parent.relationship) || 'Parent/Guardian',
      email: this.normalizeText(parent.email) || 'No email',
      status,
      details: this.formatParentDetails(parent),
      linkedInfo: this.formatParentLinkedInfo(parent),
      accountGenerated: !!userId,
      accountStatus: userId ? 'Generated' : 'Not Generated',
      createdAt: this.formatDate(parent.createdAt),
      updatedAt: this.formatDate(parent.updatedAt),
      parent,
    };
  }

  private formatStudentDetails(student: Student): string {
    const section = this.normalizeText(student.sectionId) || 'No section';
    const yearLevel = this.normalizeText(student.yearLevel) || 'No year level';

    return `${section} • ${yearLevel}`;
  }

  private formatTeacherDetails(teacher: Teacher): string {
    const department = this.normalizeText(teacher.department) || 'No department';
    const facultyType = this.normalizeText(teacher.facultyType) || 'Instructor';

    return `${department} • ${facultyType}`;
  }

  private formatParentDetails(parent: Parent): string {
    const relationship = this.normalizeText(parent.relationship) || 'Parent/Guardian';
    const contactNumber = this.normalizeText(parent.contactNumber) || 'No contact number';

    return `${relationship} • ${contactNumber}`;
  }

  private formatStudentLinkedInfo(student: Student): string {
    if (this.normalizeText(student.parentId)) {
      return 'Parent linked';
    }

    if (this.hasCompleteParentDetails(student)) {
      return 'Parent details available';
    }

    return 'Incomplete parent details';
  }

  private formatParentLinkedInfo(parent: Parent): string {
    const childCount = parent.studentIds?.length || (parent.studentId ? 1 : 0);

    if (childCount <= 0) {
      return 'No linked child';
    }

    return childCount === 1 ? '1 linked child' : `${childCount} linked children`;
  }

  private hasCompleteParentDetails(student: Student): boolean {
    return Boolean(
      this.normalizeText(student.parentFirstName) &&
      this.normalizeText(student.parentLastName) &&
      this.normalizeText(student.parentEmail) &&
      this.normalizeText(student.parentContactNumber) &&
      this.normalizeText(student.parentRelationship),
    );
  }

  private normalizeStatus(status: string | undefined, isArchived: boolean | undefined): string {
    if (isArchived) {
      return 'Archived';
    }

    const normalizedStatus = this.normalizeText(status);

    return normalizedStatus ? this.toTitleCase(normalizedStatus) : 'Active';
  }

  private formatFullName(firstName: string | undefined, lastName: string | undefined): string {
    const fullName = `${this.normalizeText(firstName)} ${this.normalizeText(lastName)}`.trim();

    return fullName || 'Unnamed Record';
  }

  private getInitials(firstName: string | undefined, lastName: string | undefined): string {
    const firstInitial = this.normalizeText(firstName).charAt(0).toUpperCase();
    const lastInitial = this.normalizeText(lastName).charAt(0).toUpperCase();
    const initials = `${firstInitial}${lastInitial}`.trim();

    return initials || 'U';
  }

  private formatDate(value: string | undefined): string {
    const normalizedValue = this.normalizeText(value);

    if (!normalizedValue) {
      return 'Not available';
    }

    const date = new Date(normalizedValue);

    if (Number.isNaN(date.getTime())) {
      return normalizedValue;
    }

    return date.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  }

  private normalizeText(value: string | null | undefined): string {
    return String(value || '').trim();
  }

  private toTitleCase(value: string): string {
    return value
      .split(' ')
      .filter(Boolean)
      .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
      .join(' ');
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    return 'Unable to complete the account generation. Please try again.';
  }

  private escapeHtml(value: string): string {
    return this.normalizeText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
