import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { Html5Qrcode } from 'html5-qrcode';
import Swal from 'sweetalert2';
import { collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';

import { db } from '../../../firebase.config';
import { AttendanceService } from '../../../services/attendance.service';
import { AuthService } from '../../../services/auth.service';
import { StudentService } from '../../../services/student.service';

import { AttendanceRecord } from '../../../models/attendance-record.model';
import { Student } from '../../../models/student.model';

type SubmissionMode = 'code' | 'qr';
type HistoryView = 'active' | 'archived';
type StudentHistoryActionType = 'archived' | 'deleted';

interface StudentAttendanceHistoryAction {
  id?: string;
  attendanceRecordId: string;
  studentId: string;
  action: StudentHistoryActionType;
  createdAt: string;
  updatedAt: string;
}

@Component({
  selector: 'app-student-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-attendance.html',
  styleUrl: './student-attendance.scss',
})
export class StudentAttendanceComponent implements OnInit, OnDestroy {
  private readonly attendanceService = inject(AttendanceService);
  private readonly authService = inject(AuthService);
  private readonly studentService = inject(StudentService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  private readonly historyActionsCollectionName = 'studentAttendanceHistoryActions';

  private qrScanner: Html5Qrcode | null = null;
  private historyLoadingTimeout: ReturnType<typeof setTimeout> | null = null;
  private studentSubscription: Subscription | null = null;
  private historySubscription: Subscription | null = null;

  readonly scannerElementId = 'student-qr-reader';

  currentUser: any = null;
  currentStudent: Student | null = null;

  submissionMode: SubmissionMode = 'code';
  historyView: HistoryView = 'active';

  sessionCode = '';
  qrToken = '';

  loading = false;
  historyLoading = false;
  scannerOpen = false;
  scannerStarting = false;
  processingRecordId = '';

  message = '';
  error = '';

  students: Student[] = [];
  allRecords: AttendanceRecord[] = [];
  activeRecords: AttendanceRecord[] = [];
  archivedRecords: AttendanceRecord[] = [];
  displayedRecords: AttendanceRecord[] = [];
  historyActions: StudentAttendanceHistoryAction[] = [];

  deletedRecordsCount = 0;
  selectedArchivedRecordIds = new Set<string>();

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser?.() || null;
    this.loadStudentData();
  }

  ngOnDestroy(): void {
    this.stopScanner();
    this.clearHistoryLoadingTimeout();

    if (this.studentSubscription) {
      this.studentSubscription.unsubscribe();
      this.studentSubscription = null;
    }

    if (this.historySubscription) {
      this.historySubscription.unsubscribe();
      this.historySubscription = null;
    }
  }

  get studentName(): string {
    if (!this.currentStudent) return 'Student';

    return `${this.currentStudent.firstName || ''} ${this.currentStudent.lastName || ''}`.trim();
  }

  get studentNumber(): string {
    return this.currentStudent?.studentNumber || '—';
  }

  get activeRecordsCount(): number {
    return this.activeRecords.length;
  }

  get archivedRecordsCount(): number {
    return this.archivedRecords.length;
  }

  get selectedArchivedCount(): number {
    return this.selectedArchivedRecordIds.size;
  }

  get presentCount(): number {
    return this.activeRecords.filter(
      (record) => this.getNormalizedStatus(record.status) === 'present',
    ).length;
  }

  get lateCount(): number {
    return this.activeRecords.filter((record) => this.getNormalizedStatus(record.status) === 'late')
      .length;
  }

  get absentCount(): number {
    return this.activeRecords.filter(
      (record) => this.getNormalizedStatus(record.status) === 'absent',
    ).length;
  }

  get excusedCount(): number {
    return this.activeRecords.filter(
      (record) => this.getNormalizedStatus(record.status) === 'excused',
    ).length;
  }

  get latestRecord(): AttendanceRecord | null {
    return this.activeRecords.length > 0 ? this.activeRecords[0] : null;
  }

  get latestStatusLabel(): string {
    return this.latestRecord ? this.getStatusLabel(this.latestRecord.status) : 'No Record Yet';
  }

  setMode(mode: SubmissionMode): void {
    this.submissionMode = mode;
    this.message = '';
    this.error = '';

    if (mode === 'code') {
      this.stopScanner();
    }
  }

  setHistoryView(view: HistoryView): void {
    if (this.processingRecordId || this.historyLoading) return;

    this.historyView = view;
    this.clearArchivedSelection();
    this.applyHistoryView();
  }

  loadStudentData(): void {
    this.clearAlerts();
    this.startHistoryLoading();

    this.currentUser = this.authService.getCurrentUser?.() || this.currentUser || null;

    if (this.studentSubscription) {
      this.studentSubscription.unsubscribe();
      this.studentSubscription = null;
    }

    this.studentSubscription = this.studentService.getStudents().subscribe({
      next: (students) => {
        this.zone.run(() => {
          this.currentUser = this.authService.getCurrentUser?.() || this.currentUser || null;
          this.students = students || [];

          const matchedStudent = this.findCurrentStudent();

          if (!matchedStudent?.id) {
            if (this.students.length === 0) {
              this.cdr.detectChanges();
              return;
            }

            this.currentStudent = null;
            this.resetHistoryData();
            this.error =
              'Your student account is not linked to a student record. Please contact the administrator.';
            this.stopHistoryLoading();
            return;
          }

          const previousStudentId = this.currentStudent?.id || '';
          this.currentStudent = matchedStudent;

          if (previousStudentId !== matchedStudent.id || this.allRecords.length === 0) {
            this.loadHistory();
          }

          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.zone.run(() => {
          this.students = [];
          this.currentStudent = null;
          this.resetHistoryData();
          this.error = 'Unable to load your student account.';
          this.stopHistoryLoading();
        });
      },
    });
  }

  loadHistory(): void {
    const studentId = this.currentStudent?.id;

    if (!studentId) {
      this.resetHistoryData();
      this.stopHistoryLoading();
      return;
    }

    this.startHistoryLoading();

    if (this.historySubscription) {
      this.historySubscription.unsubscribe();
      this.historySubscription = null;
    }

    this.historySubscription = this.attendanceService.getRecordsByStudent(studentId).subscribe({
      next: (records) => {
        this.fetchHistoryActions(studentId)
          .then((actions) => {
            this.zone.run(() => {
              this.allRecords = this.sortRecords(records || []);
              this.historyActions = actions || [];

              this.rebuildHistoryLists();
              this.applyHistoryView(false);
              this.stopHistoryLoading();
            });
          })
          .catch((error) => {
            console.error('LOAD STUDENT ATTENDANCE HISTORY ACTIONS ERROR:', error);

            this.zone.run(() => {
              this.allRecords = this.sortRecords(records || []);
              this.historyActions = [];

              this.rebuildHistoryLists();
              this.applyHistoryView(false);
              this.stopHistoryLoading();
            });
          });
      },
      error: (error) => {
        this.zone.run(() => {
          console.error('LOAD STUDENT ATTENDANCE HISTORY ERROR:', error);

          this.error = 'Unable to refresh attendance history. Showing the latest loaded records.';
          this.stopHistoryLoading();
        });
      },
    });
  }

  refresh(): void {
    this.loadHistory();
  }

  startScanner(): void {
    this.submissionMode = 'qr';
    this.clearAlerts();

    if (this.scannerOpen || this.scannerStarting) return;

    this.scannerStarting = true;
    this.scannerOpen = true;
    this.cdr.detectChanges();

    setTimeout(() => {
      this.qrScanner = new Html5Qrcode(this.scannerElementId);

      this.qrScanner
        .start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 240, height: 240 },
          },
          (decodedText) => {
            if (this.loading) return;

            this.zone.run(() => {
              this.qrToken = decodedText.trim();
              this.stopScanner();
              this.submitAttendance();
            });
          },
          () => {
            // Normal scan-frame errors are ignored.
          },
        )
        .then(() => {
          this.zone.run(() => {
            this.scannerStarting = false;
            this.cdr.detectChanges();
          });
        })
        .catch((err) => {
          this.zone.run(() => {
            console.error('QR SCANNER ERROR:', err);
            this.error =
              'Camera could not be opened. Allow camera access or use the session code instead.';
            this.scannerStarting = false;
            this.scannerOpen = false;
            this.cdr.detectChanges();
          });
        });
    }, 100);
  }

  stopScanner(): void {
    if (!this.qrScanner) {
      this.scannerOpen = false;
      this.scannerStarting = false;
      this.cdr.detectChanges();
      return;
    }

    this.qrScanner
      .stop()
      .then(() => this.qrScanner?.clear())
      .catch(() => {
        // Scanner may already be stopped.
      })
      .finally(() => {
        this.zone.run(() => {
          this.qrScanner = null;
          this.scannerOpen = false;
          this.scannerStarting = false;
          this.cdr.detectChanges();
        });
      });
  }

  submitAttendance(): void {
    const studentId = this.currentStudent?.id;

    if (!studentId) {
      this.error = 'Your student account is not linked to a student record.';
      return;
    }

    const inputValue =
      this.submissionMode === 'code' ? this.sessionCode.trim() : this.qrToken.trim();

    if (!inputValue) {
      this.error =
        this.submissionMode === 'code'
          ? 'Enter the session code shown by your teacher.'
          : 'Scan the QR code shown by your teacher.';
      return;
    }

    this.loading = true;
    this.clearAlerts();

    const request =
      this.submissionMode === 'code'
        ? this.attendanceService.submitViaCode(inputValue, studentId)
        : this.attendanceService.submitViaQR(inputValue, studentId);

    request.pipe(take(1)).subscribe({
      next: () => {
        this.zone.run(() => {
          this.message = 'Attendance submitted successfully.';
          this.sessionCode = '';
          this.qrToken = '';
          this.loading = false;
          this.historyView = 'active';
          this.loadHistory();
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        this.zone.run(() => {
          this.error = err?.message || 'Unable to submit attendance.';
          this.loading = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  async archiveAllActiveRecords(): Promise<void> {
    const studentId = this.currentStudent?.id;

    if (!studentId || this.activeRecords.length === 0 || this.processingRecordId) return;

    const result = await Swal.fire({
      icon: 'question',
      title: 'Archive all active history?',
      html: `
        <div style="text-align:left; line-height:1.6">
          <p>This will move <b>${this.activeRecords.length}</b> active attendance record(s) to your Archive.</p>
          <p>Official attendance records will remain safe and unchanged.</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Archive All Active History',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!result.isConfirmed) return;

    this.processingRecordId = 'bulk-archive';
    this.historyLoading = false;
    this.cdr.detectChanges();

    try {
      const nowIso = new Date().toISOString();
      const batch = writeBatch(db);

      this.activeRecords.forEach((record) => {
        const recordKey = this.getRecordKey(record);
        if (!recordKey) return;

        const existingAction = this.historyActions.find(
          (item) => item.attendanceRecordId === recordKey && item.studentId === studentId,
        );

        if (existingAction?.id) {
          batch.update(doc(db, this.historyActionsCollectionName, existingAction.id), {
            action: 'archived',
            updatedAt: nowIso,
          });
        } else {
          const actionRef = doc(collection(db, this.historyActionsCollectionName));
          batch.set(actionRef, {
            attendanceRecordId: recordKey,
            studentId,
            action: 'archived',
            createdAt: nowIso,
            updatedAt: nowIso,
          });
        }

        this.upsertLocalHistoryAction(recordKey, studentId, 'archived', nowIso);
      });

      await batch.commit();

      this.historyView = 'archived';
      this.clearArchivedSelection();
      this.rebuildHistoryLists();
      this.applyHistoryView();

      await Swal.fire({
        icon: 'success',
        title: 'Active history archived',
        text: 'All active attendance records were moved to your Archive.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#2563eb',
      });
    } catch (error) {
      console.error('BULK ARCHIVE STUDENT ATTENDANCE HISTORY ERROR:', error);

      await Swal.fire({
        icon: 'error',
        title: 'Bulk archive failed',
        text: 'The active attendance records could not be archived. Please check Firebase permissions.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#dc2626',
      });
    } finally {
      this.processingRecordId = '';
      this.historyLoading = false;
      this.cdr.detectChanges();
    }
  }

  async restoreRecord(record: AttendanceRecord): Promise<void> {
    await this.restoreArchivedRecords(
      [record],
      'Record restored',
      'The attendance record was restored to your Active History.',
    );
  }

  async restoreSelectedArchivedRecords(): Promise<void> {
    const selectedRecords = this.getSelectedArchivedRecords();

    if (selectedRecords.length === 0) {
      await Swal.fire({
        icon: 'info',
        title: 'No records selected',
        text: 'Select archived attendance records first.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#2563eb',
      });
      return;
    }

    await this.restoreArchivedRecords(
      selectedRecords,
      'Selected records restored',
      'Selected attendance records were restored to your Active History.',
    );
  }

  async restoreAllArchivedRecords(): Promise<void> {
    await this.restoreArchivedRecords(
      this.archivedRecords,
      'Archive restored',
      'All archived attendance records were restored to your Active History.',
    );
  }

  private async restoreArchivedRecords(
    recordsToRestore: AttendanceRecord[],
    successTitle: string,
    successText: string,
  ): Promise<void> {
    const studentId = this.currentStudent?.id;

    if (!studentId || recordsToRestore.length === 0 || this.processingRecordId) return;

    const isAll = recordsToRestore.length === this.archivedRecords.length;

    const result = await Swal.fire({
      icon: 'question',
      title: isAll ? 'Restore all archived records?' : 'Restore selected records?',
      html: `
        <div style="text-align:left; line-height:1.6">
          <p>This will return <b>${recordsToRestore.length}</b> archived attendance record(s) to your Active History.</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: isAll ? 'Restore All' : 'Restore Selected',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!result.isConfirmed) return;

    this.processingRecordId = isAll ? 'bulk-restore' : 'selected-restore';
    this.historyLoading = false;
    this.cdr.detectChanges();

    try {
      const batch = writeBatch(db);
      const recordIdsToRestore = new Set<string>();

      recordsToRestore.forEach((record) => {
        const recordKey = this.getRecordKey(record);
        if (!recordKey) return;

        recordIdsToRestore.add(recordKey);

        const existingAction = this.historyActions.find(
          (item) =>
            item.attendanceRecordId === recordKey &&
            item.studentId === studentId &&
            item.action === 'archived',
        );

        if (existingAction?.id) {
          batch.delete(doc(db, this.historyActionsCollectionName, existingAction.id));
        }
      });

      await batch.commit();

      this.historyActions = this.historyActions.filter(
        (item) =>
          !(
            item.studentId === studentId &&
            recordIdsToRestore.has(item.attendanceRecordId) &&
            item.action === 'archived'
          ),
      );

      this.historyView = 'active';
      this.clearArchivedSelection();
      this.rebuildHistoryLists();
      this.applyHistoryView();

      await Swal.fire({
        icon: 'success',
        title: successTitle,
        text: successText,
        confirmButtonText: 'OK',
        confirmButtonColor: '#2563eb',
      });
    } catch (error) {
      console.error('RESTORE STUDENT ATTENDANCE HISTORY ERROR:', error);

      await Swal.fire({
        icon: 'error',
        title: 'Restore failed',
        text: 'The archived attendance records could not be restored.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#dc2626',
      });
    } finally {
      this.processingRecordId = '';
      this.historyLoading = false;
      this.cdr.detectChanges();
    }
  }

  async deleteRecordPermanently(record: AttendanceRecord): Promise<void> {
    await this.deleteArchivedRecords(
      [record],
      'Record removed',
      'The attendance record was removed from your personal history.',
    );
  }

  async deleteSelectedArchivedRecords(): Promise<void> {
    const selectedRecords = this.getSelectedArchivedRecords();

    if (selectedRecords.length === 0) {
      await Swal.fire({
        icon: 'info',
        title: 'No records selected',
        text: 'Select archived attendance records first.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#2563eb',
      });
      return;
    }

    await this.deleteArchivedRecords(
      selectedRecords,
      'Selected records removed',
      'Selected attendance records were removed from your personal history.',
    );
  }

  async deleteAllArchivedRecords(): Promise<void> {
    await this.deleteArchivedRecords(
      this.archivedRecords,
      'Archive cleared',
      'All archived attendance records were removed from your personal history.',
    );
  }

  private async deleteArchivedRecords(
    recordsToDelete: AttendanceRecord[],
    successTitle: string,
    successText: string,
  ): Promise<void> {
    const studentId = this.currentStudent?.id;

    if (!studentId || recordsToDelete.length === 0 || this.processingRecordId) return;

    const isAll = recordsToDelete.length === this.archivedRecords.length;

    const result = await Swal.fire({
      icon: 'warning',
      title: isAll ? 'Remove all archived records?' : 'Remove selected records?',
      html: `
        <div style="text-align:left; line-height:1.6">
          <p>This will remove <b>${recordsToDelete.length}</b> archived attendance record(s) from your personal history view.</p>
          <p><b>Important:</b> This does not delete official attendance records used by the school, faculty, admin, or parent monitoring.</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: isAll ? 'Remove All' : 'Remove Selected',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!result.isConfirmed) return;

    this.processingRecordId = isAll ? 'bulk-delete' : 'selected-delete';
    this.historyLoading = false;
    this.cdr.detectChanges();

    try {
      const nowIso = new Date().toISOString();
      const batch = writeBatch(db);

      recordsToDelete.forEach((record) => {
        const recordKey = this.getRecordKey(record);
        if (!recordKey) return;

        const existingAction = this.historyActions.find(
          (item) => item.attendanceRecordId === recordKey && item.studentId === studentId,
        );

        if (existingAction?.id) {
          batch.update(doc(db, this.historyActionsCollectionName, existingAction.id), {
            action: 'deleted',
            updatedAt: nowIso,
          });
        } else {
          const actionRef = doc(collection(db, this.historyActionsCollectionName));
          batch.set(actionRef, {
            attendanceRecordId: recordKey,
            studentId,
            action: 'deleted',
            createdAt: nowIso,
            updatedAt: nowIso,
          });
        }

        this.upsertLocalHistoryAction(recordKey, studentId, 'deleted', nowIso);
      });

      await batch.commit();

      this.clearArchivedSelection();
      this.rebuildHistoryLists();
      this.applyHistoryView();

      await Swal.fire({
        icon: 'success',
        title: successTitle,
        text: successText,
        confirmButtonText: 'OK',
        confirmButtonColor: '#2563eb',
      });
    } catch (error) {
      console.error('DELETE STUDENT ATTENDANCE HISTORY ERROR:', error);

      await Swal.fire({
        icon: 'error',
        title: 'Remove failed',
        text: 'The attendance records could not be removed from your personal history.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#dc2626',
      });
    } finally {
      this.processingRecordId = '';
      this.historyLoading = false;
      this.cdr.detectChanges();
    }
  }

  toggleArchivedRecordSelection(record: AttendanceRecord): void {
    const recordKey = this.getRecordKey(record);

    if (!recordKey || this.processingRecordId) return;

    if (this.selectedArchivedRecordIds.has(recordKey)) {
      this.selectedArchivedRecordIds.delete(recordKey);
    } else {
      this.selectedArchivedRecordIds.add(recordKey);
    }

    this.cdr.detectChanges();
  }

  toggleAllArchivedSelections(): void {
    if (this.archivedRecords.length === 0 || this.processingRecordId) return;

    const allSelected = this.archivedRecords.every((record) =>
      this.selectedArchivedRecordIds.has(this.getRecordKey(record)),
    );

    if (allSelected) {
      this.clearArchivedSelection();
      this.cdr.detectChanges();
      return;
    }

    this.archivedRecords.forEach((record) => {
      const recordKey = this.getRecordKey(record);
      if (recordKey) this.selectedArchivedRecordIds.add(recordKey);
    });

    this.cdr.detectChanges();
  }

  isArchivedRecordSelected(record: AttendanceRecord): boolean {
    return this.selectedArchivedRecordIds.has(this.getRecordKey(record));
  }

  clearArchivedSelection(): void {
    this.selectedArchivedRecordIds.clear();
  }

  getStatusLabel(status: string | undefined): string {
    const value = this.getNormalizedStatus(status);

    if (value === 'present') return 'Present';
    if (value === 'late') return 'Late';
    if (value === 'absent') return 'Absent';
    if (value === 'excused') return 'Excused';

    return 'Unknown';
  }

  getStatusIcon(status: string | undefined): string {
    const value = this.getNormalizedStatus(status);

    if (value === 'present') return 'pi pi-check-circle';
    if (value === 'late') return 'pi pi-clock';
    if (value === 'absent') return 'pi pi-times-circle';
    if (value === 'excused') return 'pi pi-calendar-plus';

    return 'pi pi-circle';
  }

  getNormalizedStatus(status: string | undefined): string {
    return String(status || '')
      .trim()
      .toLowerCase();
  }

  getMethodLabel(method: string | undefined): string {
    const value = String(method || '')
      .trim()
      .toLowerCase();

    if (value === 'qr') return 'QR Scan';
    if (value === 'manual') return 'Teacher Entry';
    if (value === 'code') return 'Session Code';
    if (value === 'teacher_assisted') return 'Teacher Assisted';
    if (value === 'imported_excel') return 'Imported Record';
    if (value === 'imported_image') return 'Image Import';

    return method || '—';
  }

  getRecordDateLabel(record: AttendanceRecord): string {
    if (!record?.timeRecorded) return 'No date';

    const date = new Date(record.timeRecorded);

    if (Number.isNaN(date.getTime())) {
      return record.timeRecorded;
    }

    return date.toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  getRecordTimeLabel(record: AttendanceRecord): string {
    if (!record?.timeRecorded) return '—';

    const date = new Date(record.timeRecorded);

    if (Number.isNaN(date.getTime())) {
      return '—';
    }

    return date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  formatDateTime(value: string | undefined): string {
    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  isRecordProcessing(record: AttendanceRecord): boolean {
    return this.processingRecordId === this.getRecordKey(record);
  }

  trackByRecord = (index: number, record: AttendanceRecord): string => {
    return this.getRecordKey(record) || `${record.sessionId || 'session'}-${index}`;
  };

  private startHistoryLoading(): void {
    this.clearHistoryLoadingTimeout();

    this.historyLoading = this.displayedRecords.length === 0;

    this.historyLoadingTimeout = setTimeout(() => {
      this.zone.run(() => {
        this.historyLoading = false;
        this.cdr.detectChanges();
      });
    }, 2500);

    this.cdr.detectChanges();
  }

  private stopHistoryLoading(): void {
    this.clearHistoryLoadingTimeout();
    this.historyLoading = false;
    this.cdr.detectChanges();
  }

  private clearHistoryLoadingTimeout(): void {
    if (this.historyLoadingTimeout) {
      clearTimeout(this.historyLoadingTimeout);
      this.historyLoadingTimeout = null;
    }
  }

  private async fetchHistoryActions(studentId: string): Promise<StudentAttendanceHistoryAction[]> {
    const actionsQuery = query(
      collection(db, this.historyActionsCollectionName),
      where('studentId', '==', studentId),
    );

    const snapshot = await getDocs(actionsQuery);

    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data() as Partial<StudentAttendanceHistoryAction>;

      return {
        id: docSnap.id,
        attendanceRecordId: String(data.attendanceRecordId || ''),
        studentId: String(data.studentId || ''),
        action: data.action === 'deleted' ? 'deleted' : 'archived',
        createdAt: String(data.createdAt || ''),
        updatedAt: String(data.updatedAt || ''),
      };
    });
  }

  private getSelectedArchivedRecords(): AttendanceRecord[] {
    return this.archivedRecords.filter((record) =>
      this.selectedArchivedRecordIds.has(this.getRecordKey(record)),
    );
  }

  private rebuildHistoryLists(): void {
    const actionsByRecordId = new Map<string, StudentHistoryActionType>();

    this.historyActions.forEach((action) => {
      if (action.studentId === this.currentStudent?.id && action.attendanceRecordId) {
        actionsByRecordId.set(action.attendanceRecordId, action.action);
      }
    });

    const active: AttendanceRecord[] = [];
    const archived: AttendanceRecord[] = [];
    let deletedCount = 0;

    this.allRecords.forEach((record) => {
      const recordKey = this.getRecordKey(record);
      const action = actionsByRecordId.get(recordKey);

      if (action === 'deleted') {
        deletedCount += 1;
        return;
      }

      if (action === 'archived') {
        archived.push(record);
        return;
      }

      active.push(record);
    });

    this.activeRecords = this.sortRecords(active);
    this.archivedRecords = this.sortRecords(archived);
    this.deletedRecordsCount = deletedCount;

    const validArchivedIds = new Set(
      this.archivedRecords.map((record) => this.getRecordKey(record)),
    );
    this.selectedArchivedRecordIds.forEach((recordId) => {
      if (!validArchivedIds.has(recordId)) {
        this.selectedArchivedRecordIds.delete(recordId);
      }
    });
  }

  private applyHistoryView(shouldDetect = true): void {
    this.displayedRecords =
      this.historyView === 'archived' ? [...this.archivedRecords] : [...this.activeRecords];

    if (shouldDetect) {
      this.cdr.detectChanges();
    }
  }

  private upsertLocalHistoryAction(
    attendanceRecordId: string,
    studentId: string,
    action: StudentHistoryActionType,
    nowIso: string,
  ): void {
    const existing = this.historyActions.find(
      (item) => item.attendanceRecordId === attendanceRecordId && item.studentId === studentId,
    );

    if (existing) {
      existing.action = action;
      existing.updatedAt = nowIso;
      return;
    }

    this.historyActions.push({
      attendanceRecordId,
      studentId,
      action,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  private getRecordKey(record: AttendanceRecord): string {
    return (
      record.id ||
      `${record.sessionId || 'session'}-${record.studentId || 'student'}-${
        record.timeRecorded || 'time'
      }`
    );
  }

  private sortRecords(records: AttendanceRecord[]): AttendanceRecord[] {
    return [...records].sort((a, b) => {
      const aTime = String(a.timeRecorded || '');
      const bTime = String(b.timeRecorded || '');

      return bTime.localeCompare(aTime);
    });
  }

  private findCurrentStudent(): Student | null {
    const user = this.currentUser || this.authService.getCurrentUser?.();

    if (!user) {
      return null;
    }

    const userKeys = [
      user.id,
      user.uid,
      user.userId,
      user.studentId,
      user.studentNumber,
      user.email,
      user.username,
    ]
      .map((value) => this.normalizeKey(value))
      .filter(Boolean);

    return (
      this.students.find((student) => {
        const studentKeys = [student.id, student.userId, student.studentNumber, student.email]
          .map((value) => this.normalizeKey(value))
          .filter(Boolean);

        return userKeys.some((userKey) => studentKeys.includes(userKey));
      }) || null
    );
  }

  private normalizeKey(value: unknown): string {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  private resetHistoryData(): void {
    this.allRecords = [];
    this.activeRecords = [];
    this.archivedRecords = [];
    this.displayedRecords = [];
    this.historyActions = [];
    this.deletedRecordsCount = 0;
    this.selectedArchivedRecordIds.clear();
  }

  private clearAlerts(): void {
    this.message = '';
    this.error = '';
  }
}
