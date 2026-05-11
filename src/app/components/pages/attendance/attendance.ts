import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';
import * as QRCode from 'qrcode';
import * as XLSX from 'xlsx';

import { AttendanceService } from '../../../services/attendance.service';
import { ClassOfferingService } from '../../../services/class-offering.service';
import { StudentService } from '../../../services/student.service';
import { TeacherService } from '../../../services/teacher.service';
import { AuthService } from '../../../services/auth.service';

import { AttendanceRecord, AttendanceStatus } from '../../../models/attendance-record.model';
import { AttendanceSession } from '../../../models/attendance-session.model';
import { AttendanceRequest } from '../../../models/attendance-request.model';
import { ClassOffering } from '../../../models/class-offering.model';
import { Student } from '../../../models/student.model';
import { Teacher } from '../../../models/teacher.model';

type AttendanceViewMode = 'catalog' | 'workspace';
type ImportTarget = 'historical' | 'active_session';

interface StudentAttendanceRow {
  student: Student;
  record?: AttendanceRecord;
  status: AttendanceStatus | 'not-marked';
  lateTime: string;
  remarks: string;
  isSaving: boolean;
}

interface AttendanceRequestRow {
  request: AttendanceRequest;
  student?: Student;
}

interface ImportPreviewRow {
  rowNumber: number;
  studentId: string;
  studentNumber: string;
  studentName: string;
  status: AttendanceStatus | '';
  timeRecorded: string;
  lateTime: string;
  remarks: string;
  valid: boolean;
  errors: string[];
}

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './attendance.html',
  styleUrl: './attendance.scss',
})
export class AttendanceComponent implements OnInit, OnDestroy {
  private readonly attendanceService = inject(AttendanceService);
  private readonly classOfferingService = inject(ClassOfferingService);
  private readonly studentService = inject(StudentService);
  private readonly teacherService = inject(TeacherService);
  private readonly authService = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  viewMode: AttendanceViewMode = 'catalog';

  currentUser = this.authService.getCurrentUser();
  currentTeacher: Teacher | null = null;

  offerings: ClassOffering[] = [];
  students: Student[] = [];
  sessions: AttendanceSession[] = [];
  records: AttendanceRecord[] = [];
  teachers: Teacher[] = [];
  attendanceRequests: AttendanceRequest[] = [];

  teacherOfferings: ClassOffering[] = [];
  selectedOfferingId = '';

  activeSession: AttendanceSession | null = null;
  selectedOffering: ClassOffering | null = null;

  studentRows: StudentAttendanceRow[] = [];
  requestRows: AttendanceRequestRow[] = [];

  qrImageUrl = '';
  isQrFullscreen = false;

  sessionDurationOptions = [15, 30, 45, 60, 90, 120];
  qrRotationOptions = [15, 30, 45, 60, 90, 120];
  selectedDurationPreset = '30';
  customDurationMinutes = 30;
  selectedLateThresholdMinutes = 10;
  selectedQrRotationSeconds = 30;

  qrCountdownSeconds = 30;
  qrRotationSeconds = 30;
  sessionRemainingSeconds = 0;
  sessionTotalSeconds = 0;

  isRotatingQr = false;
  isAutoClosingSession = false;
  lastQrRotatedAt = '';
  lastLiveSyncAt = '';
  liveStatusMessage = '';

  private locallyClearedRecordKeys = new Set<string>();
  private currentDisplaySessionId = '';

  importTarget: ImportTarget = 'historical';
  historicalImportDate = this.getTodayInputValue();
  historicalStartTime = '08:00';
  historicalEndTime = '17:00';
  historicalRemarks = '';

  private qrRotationIntervalId: ReturnType<typeof setInterval> | null = null;
  private uiClockIntervalId: ReturnType<typeof setInterval> | null = null;
  private liveAttendanceIntervalId: ReturnType<typeof setInterval> | null = null;

  private readonly defaultQrRotationSeconds = 30;
  private readonly defaultDurationMinutes = 30;
  private readonly defaultLateThresholdMinutes = 10;
  private readonly liveAttendanceRefreshMs = 2500;

  isLoading = false;
  isCreatingSession = false;
  isClosingSession = false;
  reviewingRequestId = '';

  message = '';
  errorMessage = '';

  importRows: ImportPreviewRow[] = [];
  importFileName = '';
  importLoading = false;
  importErrorMessage = '';
  importSuccessMessage = '';

  @HostListener('document:keydown.escape')
  handleEscapeKey(): void {
    if (this.isQrFullscreen) {
      this.closeQrFullscreen();
    }
  }

  ngOnInit(): void {
    this.loadPageData();
  }

  ngOnDestroy(): void {
    this.stopActiveSessionAutomation();
    this.unlockPageScroll();
  }

  get activeSessionCount(): number {
    return this.teacherOfferings.filter((offering) => !!this.getOfferingActiveSession(offering))
      .length;
  }

  get presentCount(): number {
    return this.studentRows.filter((row) => row.status === 'present').length;
  }

  get lateCount(): number {
    return this.studentRows.filter((row) => row.status === 'late').length;
  }

  get absentCount(): number {
    return this.studentRows.filter((row) => row.status === 'absent').length;
  }

  get excusedCount(): number {
    return this.studentRows.filter((row) => row.status === 'excused').length;
  }

  get notMarkedCount(): number {
    return this.studentRows.filter((row) => row.status === 'not-marked').length;
  }

  get totalStudents(): number {
    return this.studentRows.length;
  }

  get markedCount(): number {
    return this.presentCount + this.lateCount + this.absentCount + this.excusedCount;
  }

  get attendanceRate(): number {
    if (this.totalStudents === 0) return 0;
    return Math.round(((this.presentCount + this.lateCount) / this.totalStudents) * 100);
  }

  get pendingRequestCount(): number {
    return this.requestRows.length;
  }

  get completionPercent(): number {
    if (this.totalStudents === 0) return 0;
    return Math.round((this.markedCount / this.totalStudents) * 100);
  }

  get qrCountdownPercent(): number {
    if (!this.qrRotationSeconds) return 0;
    return Math.max(0, Math.min(100, (this.qrCountdownSeconds / this.qrRotationSeconds) * 100));
  }

  get sessionProgressPercent(): number {
    if (!this.sessionTotalSeconds) return 0;

    const elapsed = this.sessionTotalSeconds - this.sessionRemainingSeconds;
    return Math.max(0, Math.min(100, (elapsed / this.sessionTotalSeconds) * 100));
  }

  get sessionRemainingLabel(): string {
    if (!this.activeSession || this.activeSession.status !== 'active') return 'Session closed';
    return this.formatDurationFromSeconds(this.sessionRemainingSeconds);
  }

  get qrSafetyLabel(): string {
    if (!this.activeSession || this.activeSession.status !== 'active') return 'QR inactive';
    if (this.isRotatingQr) return 'Refreshing QR / Code';
    return `${this.qrCountdownSeconds}s`;
  }

  get sessionTimerLevel(): 'normal' | 'warning' | 'danger' | 'closed' {
    if (!this.activeSession || this.activeSession.status !== 'active') return 'closed';
    if (this.sessionRemainingSeconds <= 60) return 'danger';
    if (this.sessionRemainingSeconds <= 300) return 'warning';
    return 'normal';
  }

  get activeSessionLabel(): string {
    if (!this.activeSession) return 'No Active Session';
    return this.activeSession.status === 'active' ? 'Live Session' : 'Closed Session';
  }

  get selectedDurationMinutes(): number {
    if (this.selectedDurationPreset === 'custom') {
      const customValue = Number(this.customDurationMinutes);
      return Number.isFinite(customValue) && customValue > 0
        ? Math.round(customValue)
        : this.defaultDurationMinutes;
    }

    const presetValue = Number(this.selectedDurationPreset);
    return Number.isFinite(presetValue) && presetValue > 0
      ? Math.round(presetValue)
      : this.defaultDurationMinutes;
  }

  get canStartSession(): boolean {
    return (
      !!this.selectedOfferingId &&
      !!this.getInstructorId() &&
      (!this.activeSession || this.activeSession.status !== 'active') &&
      !this.isCreatingSession
    );
  }

  get canUseActiveSessionImport(): boolean {
    return !!this.activeSession?.id && this.activeSession.status === 'active';
  }

  get canOpenQrFullscreen(): boolean {
    return !!this.activeSession?.id && this.activeSession.status === 'active' && !!this.qrImageUrl;
  }

  get validImportRows(): ImportPreviewRow[] {
    return this.importRows.filter((row) => row.valid);
  }

  get invalidImportRows(): ImportPreviewRow[] {
    return this.importRows.filter((row) => !row.valid);
  }

  get recentlyRecordedRows(): StudentAttendanceRow[] {
    return this.studentRows
      .filter((row) => !!row.record?.timeRecorded)
      .sort((a, b) =>
        String(b.record?.timeRecorded || '').localeCompare(String(a.record?.timeRecorded || '')),
      )
      .slice(0, 6);
  }

  get studentBoardTitle(): string {
    if (this.activeSession?.status === 'closed') return 'Final Attendance Records';
    return 'Student Board';
  }

  get studentBoardDescription(): string {
    if (this.activeSession?.status === 'closed') {
      return 'Final list for this session, including students automatically marked absent.';
    }

    if (this.activeSession?.status === 'active') {
      return 'Live list of students who already submitted attendance.';
    }

    return 'Start a session to monitor submitted attendance.';
  }

  loadPageData(): void {
    this.isLoading = true;
    this.clearAlerts();
    this.forceUiRefresh();

    forkJoin({
      offerings: this.classOfferingService.getClassOfferings().pipe(take(1)),
      students: this.studentService.getStudents().pipe(take(1)),
      sessions: this.attendanceService.getSessions().pipe(take(1)),
      records: this.attendanceService.getRecords().pipe(take(1)),
      teachers: this.teacherService.getTeachers().pipe(take(1)),
      requests: this.attendanceService.getAttendanceRequests().pipe(take(1)),
    }).subscribe({
      next: ({ offerings, students, sessions, records, teachers, requests }) => {
        this.zone.run(() => {
          this.offerings = offerings || [];
          this.students = students || [];
          this.sessions = sessions || [];
          this.records = records || [];
          this.teachers = teachers || [];
          this.attendanceRequests = requests || [];

          this.currentTeacher = this.findCurrentTeacher();
          this.teacherOfferings = this.getTeacherOfferings();

          if (!this.currentTeacher) {
            this.errorMessage =
              'This teacher account is not linked to a faculty record yet. Please check the Faculty Directory account link.';
          }

          this.syncSelectedOffering();
          this.handleActiveSessionAutomation();

          this.isLoading = false;
          this.forceUiRefresh();
        });
      },
      error: (error) => {
        this.zone.run(() => {
          console.error('LOAD ATTENDANCE PAGE ERROR:', error);
          this.errorMessage = 'Unable to load attendance data.';
          this.isLoading = false;
          this.forceUiRefresh();
        });
      },
    });
  }

  openAttendanceWorkspace(offering: ClassOffering): void {
    if (!offering.id) {
      this.errorMessage = 'Invalid class offering selected.';
      return;
    }

    this.clearAlerts();
    this.clearImport();
    this.selectedOfferingId = offering.id;
    this.viewMode = 'workspace';

    this.syncSelectedOffering();
    this.handleActiveSessionAutomation();
    this.forceUiRefresh();
  }

  backToCatalog(): void {
    this.clearAlerts();
    this.clearImport();
    this.closeQrFullscreen();
    this.viewMode = 'catalog';
    this.stopActiveSessionAutomation();
    this.forceUiRefresh();
  }

  scrollToSection(sectionId: string): void {
    const section = document.getElementById(sectionId);

    if (!section) return;

    section.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  openQrFullscreen(): void {
    if (!this.canOpenQrFullscreen) {
      this.errorMessage = 'Start a live QR session before opening fullscreen display.';
      this.forceUiRefresh();
      return;
    }

    this.isQrFullscreen = true;
    this.lockPageScroll();
    this.forceUiRefresh();
  }

  closeQrFullscreen(): void {
    if (!this.isQrFullscreen) return;

    this.isQrFullscreen = false;
    this.unlockPageScroll();
    this.forceUiRefresh();
  }

  onOfferingChange(): void {
    this.clearAlerts();
    this.clearImport();
    this.closeQrFullscreen();
    this.syncSelectedOffering();
    this.handleActiveSessionAutomation();
    this.forceUiRefresh();
  }

  onImportTargetChange(): void {
    this.clearImport();
    this.forceUiRefresh();
  }

  createSession(): void {
    if (!this.selectedOfferingId) {
      this.errorMessage = 'Please select a class offering first.';
      this.forceUiRefresh();
      return;
    }

    const instructorId = this.getInstructorId();

    if (!instructorId) {
      this.errorMessage = 'Unable to identify the current teacher record.';
      this.forceUiRefresh();
      return;
    }

    this.isCreatingSession = true;
    this.clearAlerts();
    this.forceUiRefresh();

    this.attendanceService
      .createSession(this.selectedOfferingId, instructorId, {
        durationMinutes: this.selectedDurationMinutes,
        lateThresholdMinutes: this.selectedLateThresholdMinutes || this.defaultLateThresholdMinutes,
        qrRotationSeconds: this.selectedQrRotationSeconds || this.defaultQrRotationSeconds,
      })
      .pipe(take(1))
      .subscribe({
        next: (session) => {
          this.zone.run(() => {
            this.activeSession = session;

            const exists = this.sessions.some((item) => item.id === session.id);
            this.sessions = exists
              ? this.sessions.map((item) => (item.id === session.id ? session : item))
              : [session, ...this.sessions];

            this.isCreatingSession = false;
            this.message = `Live attendance session started for ${this.selectedDurationMinutes} minutes. QR and session code refresh every ${this.selectedQrRotationSeconds || this.defaultQrRotationSeconds} seconds.`;

            this.prepareQrCountdownState();
            this.prepareSessionCountdownState();
            this.generateQrCode();
            this.rebuildStudentRows();
            this.rebuildRequestRows();
            this.handleActiveSessionAutomation();

            this.forceUiRefresh();

            setTimeout(() => {
              this.zone.run(() => {
                this.refreshSessionLiveData(false);
                this.forceUiRefresh();
              });
            }, 250);
          });
        },
        error: (error) => {
          this.zone.run(() => {
            console.error('CREATE SESSION ERROR:', error);
            this.errorMessage = error?.message || 'Unable to create attendance session.';
            this.isCreatingSession = false;
            this.forceUiRefresh();
          });
        },
      });
  }

  closeSession(): void {
    if (!this.activeSession?.id) {
      this.errorMessage = 'No active session selected.';
      this.forceUiRefresh();
      return;
    }

    this.isClosingSession = true;
    this.clearAlerts();
    this.closeQrFullscreen();
    this.forceUiRefresh();

    this.attendanceService
      .closeSession(this.activeSession.id, 'manual_close')
      .pipe(take(1))
      .subscribe({
        next: (closedSession) => {
          this.zone.run(() => {
            this.message = 'Attendance session closed successfully.';

            this.sessions = this.sessions.map((session) =>
              session.id === closedSession.id ? closedSession : session,
            );

            this.activeSession = closedSession;
            this.generateQrCode();
            this.clearImport();
            this.stopActiveSessionAutomation();

            this.isClosingSession = false;
            this.loadFinalSessionRecords(
              closedSession.id || this.activeSession?.id || '',
              'Attendance session closed. Final records, including absent students, are now visible.',
            );
            this.forceUiRefresh();
          });
        },
        error: (error) => {
          this.zone.run(() => {
            console.error('CLOSE SESSION ERROR:', error);
            this.errorMessage = error?.message || 'Unable to close attendance session.';
            this.isClosingSession = false;
            this.forceUiRefresh();
          });
        },
      });
  }

  manualMark(row: StudentAttendanceRow, status: AttendanceStatus): void {
    if (!this.activeSession?.id || this.activeSession.status !== 'active') {
      this.errorMessage = 'Start an active live session first.';
      this.forceUiRefresh();
      return;
    }

    if (!row.student.id) {
      this.errorMessage = 'Invalid student record.';
      this.forceUiRefresh();
      return;
    }

    if (status === 'late' && !row.lateTime) {
      this.errorMessage = 'Please enter the late time before marking this student as late.';
      this.forceUiRefresh();
      return;
    }

    const instructorId = this.getInstructorId();

    if (!instructorId) {
      this.errorMessage = 'Unable to identify the current teacher record.';
      this.forceUiRefresh();
      return;
    }

    row.isSaving = true;
    this.clearAlerts();
    this.forceUiRefresh();

    this.attendanceService
      .manualMark(
        this.activeSession.id,
        row.student.id,
        status,
        instructorId,
        status === 'late' ? row.lateTime : undefined,
        row.remarks,
      )
      .pipe(take(1))
      .subscribe({
        next: (record) => {
          this.zone.run(() => {
            this.records = [record, ...this.records];
            this.message = `${this.getStudentName(row.student)} marked as ${this.getStatusLabel(
              status,
            )}.`;

            this.rebuildStudentRows();
            this.forceUiRefresh();
          });
        },
        error: (error) => {
          this.zone.run(() => {
            console.error('MANUAL MARK ERROR:', error);
            row.isSaving = false;
            this.errorMessage = error?.message || 'Unable to mark attendance.';
            this.forceUiRefresh();
          });
        },
      });
  }

  onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    this.importRows = [];
    this.importFileName = '';
    this.importErrorMessage = '';
    this.importSuccessMessage = '';

    if (!this.selectedOfferingId || !this.selectedOffering) {
      this.importErrorMessage = 'Please open or select a class before uploading attendance.';
      input.value = '';
      this.forceUiRefresh();
      return;
    }

    if (this.importTarget === 'active_session' && !this.canUseActiveSessionImport) {
      this.importErrorMessage = 'Start an active session before importing into the live session.';
      input.value = '';
      this.forceUiRefresh();
      return;
    }

    if (!this.historicalImportDate && this.importTarget === 'historical') {
      this.importErrorMessage = 'Please select the attendance date for the historical import.';
      input.value = '';
      this.forceUiRefresh();
      return;
    }

    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['xlsx', 'xls', 'csv'];

    if (!extension || !allowedExtensions.includes(extension)) {
      this.importErrorMessage = 'Please upload a valid Excel or CSV file.';
      input.value = '';
      this.forceUiRefresh();
      return;
    }

    this.importFileName = file.name;
    this.importLoading = true;
    this.forceUiRefresh();

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];

        if (!firstSheetName) {
          throw new Error('The uploaded file has no worksheet.');
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          defval: '',
        });

        if (!rawRows.length) {
          throw new Error('The uploaded file has no attendance rows.');
        }

        this.zone.run(() => {
          this.importRows = this.prepareImportRows(rawRows);
          this.importLoading = false;
          this.forceUiRefresh();
        });
      } catch (error) {
        this.zone.run(() => {
          console.error('IMPORT PARSE ERROR:', error);
          this.importErrorMessage =
            error instanceof Error ? error.message : 'Unable to read the uploaded file.';
          this.importRows = [];
          this.importLoading = false;
          this.forceUiRefresh();
        });
      }
    };

    reader.onerror = () => {
      this.zone.run(() => {
        this.importErrorMessage = 'Unable to read the uploaded file.';
        this.importRows = [];
        this.importLoading = false;
        this.forceUiRefresh();
      });
    };

    reader.readAsArrayBuffer(file);
  }

  confirmImport(): void {
    if (!this.selectedOfferingId || !this.selectedOffering) {
      this.importErrorMessage = 'Please select a class before confirming import.';
      this.forceUiRefresh();
      return;
    }

    if (!this.validImportRows.length || this.invalidImportRows.length > 0) {
      this.importErrorMessage = 'Please fix invalid rows before confirming the import.';
      this.forceUiRefresh();
      return;
    }

    const instructorId = this.getInstructorId();

    if (!instructorId) {
      this.importErrorMessage = 'Unable to identify the current teacher record.';
      this.forceUiRefresh();
      return;
    }

    if (this.importTarget === 'active_session') {
      this.confirmActiveSessionImport(instructorId);
      return;
    }

    this.confirmHistoricalImport(instructorId);
  }

  clearImport(): void {
    this.importRows = [];
    this.importFileName = '';
    this.importLoading = false;
    this.importErrorMessage = '';
    this.importSuccessMessage = '';
    this.forceUiRefresh();
  }

  approveRequest(row: AttendanceRequestRow): void {
    if (!row.request.id) return;

    const instructorId = this.getInstructorId();

    if (!instructorId) {
      this.errorMessage = 'Unable to identify the current teacher record.';
      this.forceUiRefresh();
      return;
    }

    this.reviewingRequestId = row.request.id;
    this.clearAlerts();
    this.forceUiRefresh();

    this.attendanceService
      .approveAttendanceRequest(row.request.id, instructorId)
      .pipe(take(1))
      .subscribe({
        next: (record) => {
          this.zone.run(() => {
            this.records = [record, ...this.records];

            this.attendanceRequests = this.attendanceRequests.map((request) =>
              request.id === row.request.id
                ? {
                    ...request,
                    status: 'approved',
                    reviewedAt: new Date().toISOString(),
                    reviewedBy: instructorId,
                  }
                : request,
            );

            this.message = `${this.getStudentName(row.student)} attendance request approved.`;
            this.reviewingRequestId = '';

            this.rebuildStudentRows();
            this.rebuildRequestRows();
            this.forceUiRefresh();
          });
        },
        error: (error) => {
          this.zone.run(() => {
            console.error('APPROVE REQUEST ERROR:', error);
            this.errorMessage = error?.message || 'Unable to approve attendance request.';
            this.reviewingRequestId = '';
            this.forceUiRefresh();
          });
        },
      });
  }

  rejectRequest(row: AttendanceRequestRow): void {
    if (!row.request.id) return;

    const instructorId = this.getInstructorId();

    if (!instructorId) {
      this.errorMessage = 'Unable to identify the current teacher record.';
      this.forceUiRefresh();
      return;
    }

    this.reviewingRequestId = row.request.id;
    this.clearAlerts();
    this.forceUiRefresh();

    this.attendanceService
      .rejectAttendanceRequest(row.request.id, instructorId)
      .pipe(take(1))
      .subscribe({
        next: (updatedRequest) => {
          this.zone.run(() => {
            this.attendanceRequests = this.attendanceRequests.map((request) =>
              request.id === updatedRequest.id ? updatedRequest : request,
            );

            this.message = `${this.getStudentName(row.student)} attendance request rejected.`;
            this.reviewingRequestId = '';

            this.rebuildRequestRows();
            this.forceUiRefresh();
          });
        },
        error: (error) => {
          this.zone.run(() => {
            console.error('REJECT REQUEST ERROR:', error);
            this.errorMessage = error?.message || 'Unable to reject attendance request.';
            this.reviewingRequestId = '';
            this.forceUiRefresh();
          });
        },
      });
  }

  refreshQrNow(): void {
    this.rotateQrToken(true);
  }

  refreshLiveAttendance(): void {
    this.refreshSessionLiveData(true);
  }

  clearDisplayedRecord(row: StudentAttendanceRow): void {
    if (!row.record) return;

    this.locallyClearedRecordKeys.add(this.getAttendanceDisplayRecordKey(row.record, row.student));
    this.saveClearedRecordKeysForCurrentSession();
    this.rebuildStudentRows();
    this.message = 'Record removed from the Attendance board.';
    this.forceUiRefresh();
  }

  clearAllDisplayedRecords(): void {
    if (!this.activeSession?.id || this.studentRows.length === 0) return;

    this.studentRows.forEach((row) => {
      if (row.record) {
        this.locallyClearedRecordKeys.add(
          this.getAttendanceDisplayRecordKey(row.record, row.student),
        );
      }
    });

    this.saveClearedRecordKeysForCurrentSession();
    this.rebuildStudentRows();
    this.message = 'Attendance board cleared.';
    this.forceUiRefresh();
  }

  refresh(): void {
    this.loadPageData();
  }

  copySessionCode(): void {
    if (!this.activeSession?.sessionCode) return;

    navigator.clipboard
      .writeText(this.activeSession.sessionCode)
      .then(() => {
        this.zone.run(() => {
          this.message = 'Session code copied.';
          this.forceUiRefresh();
        });
      })
      .catch(() => {
        this.zone.run(() => {
          this.errorMessage = 'Unable to copy session code.';
          this.forceUiRefresh();
        });
      });
  }

  copyQrToken(): void {
    if (!this.activeSession?.qrToken) return;

    navigator.clipboard
      .writeText(this.activeSession.qrToken)
      .then(() => {
        this.zone.run(() => {
          this.message = 'QR token copied.';
          this.forceUiRefresh();
        });
      })
      .catch(() => {
        this.zone.run(() => {
          this.errorMessage = 'Unable to copy QR token.';
          this.forceUiRefresh();
        });
      });
  }

  getStudentName(student?: Student): string {
    if (!student) return 'Unknown Student';

    const lastName = student.lastName || '';
    const firstName = student.firstName || '';

    return (
      `${lastName}, ${firstName}`.trim().replace(/^,/, '').replace(/,$/, '') || 'Unnamed Student'
    );
  }

  getDisplayName(student?: Student): string {
    if (!student) return 'Unknown Student';

    return `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unnamed Student';
  }

  getStatusLabel(status: string): string {
    if (status === 'not-marked') return 'Not Marked';
    if (status === 'present') return 'Present';
    if (status === 'late') return 'Late';
    if (status === 'absent') return 'Absent';
    if (status === 'excused') return 'Excused';
    if (status === 'pending') return 'Pending';
    if (status === 'approved') return 'Approved';
    if (status === 'rejected') return 'Rejected';

    return status;
  }

  getMethodLabel(method?: string): string {
    if (!method) return '—';
    if (method === 'qr') return 'QR Scan';
    if (method === 'code') return 'Session Code';
    if (method === 'manual') return 'Teacher Manual';
    if (method === 'teacher_assisted') return 'Teacher Assisted';
    if (method === 'imported_excel') return 'Excel Import';
    if (method === 'imported_image') return 'Image Import';

    return method;
  }

  getDisplayRemarks(row: StudentAttendanceRow): string {
    const savedRemarks = String(row.record?.remarks || '').trim();

    if (savedRemarks) {
      return savedRemarks;
    }

    if (row.status === 'present') {
      if (row.record?.method === 'qr') return 'Submitted through QR scan.';
      if (row.record?.method === 'code') return 'Submitted through session code.';
      if (row.record?.method === 'teacher_assisted') return 'Recorded by teacher approval.';
      if (row.record?.method === 'manual') return 'Manually marked present by teacher.';
      return 'Attendance submitted within the session.';
    }

    if (row.status === 'late') {
      if (row.record?.method === 'qr') return 'Submitted through QR scan after the late threshold.';
      if (row.record?.method === 'code')
        return 'Submitted through session code after the late threshold.';
      if (row.record?.method === 'teacher_assisted')
        return 'Approved by teacher after the late threshold.';
      if (row.record?.method === 'manual') return 'Manually marked late by teacher.';
      return 'Submitted after the late threshold.';
    }

    if (row.status === 'absent') {
      return 'Auto-marked absent because no attendance was submitted before the session ended.';
    }

    if (row.status === 'excused') {
      return 'Approved excused attendance record.';
    }

    return '—';
  }

  getStatusIcon(status: string): string {
    if (status === 'present') return 'pi pi-check-circle';
    if (status === 'late') return 'pi pi-clock';
    if (status === 'absent') return 'pi pi-times-circle';
    if (status === 'excused') return 'pi pi-shield';
    if (status === 'not-marked') return 'pi pi-circle';
    if (status === 'pending') return 'pi pi-hourglass';
    if (status === 'approved') return 'pi pi-check';
    if (status === 'rejected') return 'pi pi-ban';

    return 'pi pi-info-circle';
  }

  getMethodIcon(method?: string): string {
    if (method === 'qr') return 'pi pi-qrcode';
    if (method === 'code') return 'pi pi-key';
    if (method === 'manual') return 'pi pi-user-edit';
    if (method === 'teacher_assisted') return 'pi pi-user-plus';
    if (method === 'imported_excel') return 'pi pi-file-excel';
    if (method === 'imported_image') return 'pi pi-image';

    return 'pi pi-minus-circle';
  }

  getStudentInitials(student?: Student): string {
    if (!student) return 'ST';

    const firstName = String(student.firstName || '').trim();
    const lastName = String(student.lastName || '').trim();
    const firstInitial = firstName.charAt(0);
    const lastInitial = lastName.charAt(0);
    const initials = `${firstInitial}${lastInitial}`.trim();

    return initials ? initials.toUpperCase() : 'ST';
  }

  isStudentRecentlyRecorded(row: StudentAttendanceRow): boolean {
    if (!row.record?.timeRecorded) return false;

    const recordedAt = new Date(row.record.timeRecorded).getTime();
    if (Number.isNaN(recordedAt)) return false;

    return Date.now() - recordedAt <= 5 * 60 * 1000;
  }

  getRequestReasonLabel(reason: string): string {
    if (reason === 'section_mismatch') return 'Sit-in / irregular student';
    if (reason === 'manual_review') return 'Manual review';

    return reason;
  }

  getOfferingScheduleLabel(offering: ClassOffering): string {
    if (!offering.schedules || offering.schedules.length === 0) {
      return 'No schedule set';
    }

    return offering.schedules
      .map(
        (schedule) =>
          `${schedule.day} ${schedule.startTime}-${schedule.endTime} · ${schedule.room}`,
      )
      .join(' / ');
  }

  getOfferingStudentCount(offering: ClassOffering): number {
    return this.students.filter((student) => this.studentBelongsToOffering(student, offering))
      .length;
  }

  getOfferingActiveSession(offering: ClassOffering): AttendanceSession | null {
    return (
      this.sessions.find(
        (session) =>
          session.classOfferingId === offering.id &&
          session.status === 'active' &&
          session.mode !== 'imported_excel',
      ) || null
    );
  }

  getSessionCloseReasonLabel(session?: AttendanceSession | null): string {
    if (!session?.closeReason) return '—';
    if (session.closeReason === 'manual_close') return 'Closed by teacher';
    if (session.closeReason === 'auto_duration_expired') return 'Time expired';
    if (session.closeReason === 'historical_import') return 'Historical import';

    return session.closeReason;
  }

  formatDate(value?: string): string {
    if (!value) return '—';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleDateString();
  }

  formatTime(value?: string): string {
    if (!value) return '—';

    if (/^\d{2}:\d{2}$/.test(value)) {
      const [hourValue, minute] = value.split(':');
      const hour = Number(hourValue);
      const suffix = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;

      return `${displayHour}:${minute} ${suffix}`;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  trackByOffering(index: number, offering: ClassOffering): string {
    return offering.id || `${offering.subjectCode}-${offering.sectionName}-${index}`;
  }

  trackByStudent(index: number, row: StudentAttendanceRow): string {
    return row.student.id || `${row.student.studentNumber}-${index}`;
  }

  trackByRequest(index: number, row: AttendanceRequestRow): string {
    return row.request.id || `${row.request.sessionId}-${row.request.studentId}-${index}`;
  }

  trackByImportRow(index: number, row: ImportPreviewRow): string {
    return `${row.rowNumber}-${row.studentId || row.studentNumber || index}`;
  }

  private confirmActiveSessionImport(instructorId: string): void {
    if (!this.activeSession?.id || this.activeSession.status !== 'active') {
      this.importErrorMessage = 'Start an active session before importing into the live session.';
      this.forceUiRefresh();
      return;
    }

    const payload: AttendanceRecord[] = this.validImportRows.map((row) => ({
      sessionId: this.activeSession!.id!,
      studentId: row.studentId,
      status: row.status as AttendanceStatus,
      method: 'imported_excel',
      timeRecorded: row.timeRecorded || new Date().toISOString(),
      lateTime: row.status === 'late' ? row.lateTime || undefined : undefined,
      recordedBy: instructorId,
      isValid: true,
      remarks: row.remarks || `Imported from ${this.importFileName || 'Excel attendance sheet'}.`,
    }));

    this.importLoading = true;
    this.importErrorMessage = '';
    this.importSuccessMessage = '';
    this.forceUiRefresh();

    this.attendanceService
      .importAttendanceRecords(payload)
      .pipe(take(1))
      .subscribe({
        next: (savedRecords) => {
          this.zone.run(() => {
            this.records = [...savedRecords, ...this.records];
            this.message = `${savedRecords.length} attendance record(s) imported into the live session.`;
            this.importSuccessMessage = `${savedRecords.length} attendance record(s) imported successfully.`;

            this.rebuildStudentRows();
            this.clearImportPreviewOnly();

            this.importLoading = false;
            this.forceUiRefresh();
          });
        },
        error: (error) => {
          this.zone.run(() => {
            console.error('ACTIVE IMPORT SAVE ERROR:', error);
            this.importErrorMessage =
              error instanceof Error
                ? error.message
                : 'Unable to save imported attendance records.';
            this.importLoading = false;
            this.forceUiRefresh();
          });
        },
      });
  }

  private confirmHistoricalImport(instructorId: string): void {
    if (!this.historicalImportDate) {
      this.importErrorMessage = 'Please select the attendance date for the historical import.';
      this.forceUiRefresh();
      return;
    }

    const records = this.validImportRows.map((row) => ({
      studentId: row.studentId,
      status: row.status as AttendanceStatus,
      timeRecorded: row.timeRecorded,
      lateTime: row.status === 'late' ? row.lateTime || undefined : undefined,
      remarks: row.remarks,
    }));

    this.importLoading = true;
    this.importErrorMessage = '';
    this.importSuccessMessage = '';
    this.forceUiRefresh();

    this.attendanceService
      .importHistoricalAttendanceRecords({
        classOfferingId: this.selectedOfferingId,
        instructorId,
        attendanceDate: this.historicalImportDate,
        startTime: this.historicalStartTime,
        endTime: this.historicalEndTime,
        lateThresholdMinutes: this.selectedLateThresholdMinutes || this.defaultLateThresholdMinutes,
        remarks: this.historicalRemarks || `Historical import from ${this.importFileName}.`,
        records,
      })
      .pipe(take(1))
      .subscribe({
        next: ({ session, records: savedRecords }) => {
          this.zone.run(() => {
            this.sessions = [session, ...this.sessions];
            this.records = [...savedRecords, ...this.records];

            this.message = `${savedRecords.length} historical attendance record(s) imported for ${this.formatDate(
              this.historicalImportDate,
            )}.`;
            this.importSuccessMessage = `${savedRecords.length} record(s) saved for reports.`;

            this.clearImportPreviewOnly();
            this.importLoading = false;

            this.forceUiRefresh();
          });
        },
        error: (error) => {
          this.zone.run(() => {
            console.error('HISTORICAL IMPORT SAVE ERROR:', error);
            this.importErrorMessage =
              error instanceof Error
                ? error.message
                : 'Unable to save historical attendance records.';
            this.importLoading = false;
            this.forceUiRefresh();
          });
        },
      });
  }

  private handleActiveSessionAutomation(): void {
    if (
      this.viewMode !== 'workspace' ||
      !this.activeSession ||
      this.activeSession.status !== 'active'
    ) {
      this.stopActiveSessionAutomation();
      this.resetTimerState();
      this.forceUiRefresh();
      return;
    }

    this.prepareQrCountdownState();
    this.prepareSessionCountdownState();

    if (this.isActiveSessionExpiredLocally()) {
      this.autoCloseCurrentSession(false);
      return;
    }

    this.startUiClockTimer();
    this.startQrRotationTimer();
    this.startLiveAttendanceTimer();

    setTimeout(() => {
      if (this.activeSession?.status === 'active') {
        this.refreshSessionLiveData(false);
      }
    }, 500);

    this.forceUiRefresh();
  }

  private startUiClockTimer(): void {
    this.stopUiClockTimer();

    this.uiClockIntervalId = setInterval(() => {
      this.updateQrCountdownFromSession();
      this.updateSessionCountdownFromSession();

      if (
        this.activeSession &&
        this.activeSession.status === 'active' &&
        this.sessionRemainingSeconds <= 0
      ) {
        this.autoCloseCurrentSession(true);
        return;
      }

      this.forceUiRefresh();
    }, 1000);
  }

  private startQrRotationTimer(): void {
    this.stopQrRotationTimer();

    this.zone.runOutsideAngular(() => {
      this.qrRotationIntervalId = setInterval(() => {
        this.zone.run(() => {
          this.rotateQrToken(false);
        });
      }, this.qrRotationSeconds * 1000);
    });
  }

  private startLiveAttendanceTimer(): void {
    this.stopLiveAttendanceTimer();

    this.liveAttendanceIntervalId = setInterval(() => {
      if (!this.activeSession?.id || this.activeSession.status !== 'active') return;
      this.refreshSessionLiveData(false);
    }, this.liveAttendanceRefreshMs);
  }

  private stopActiveSessionAutomation(): void {
    this.stopQrRotationTimer();
    this.stopUiClockTimer();
    this.stopLiveAttendanceTimer();
    this.isRotatingQr = false;
  }

  private stopQrRotationTimer(): void {
    if (this.qrRotationIntervalId) {
      clearInterval(this.qrRotationIntervalId);
      this.qrRotationIntervalId = null;
    }
  }

  private stopUiClockTimer(): void {
    if (this.uiClockIntervalId) {
      clearInterval(this.uiClockIntervalId);
      this.uiClockIntervalId = null;
    }
  }

  private stopLiveAttendanceTimer(): void {
    if (this.liveAttendanceIntervalId) {
      clearInterval(this.liveAttendanceIntervalId);
      this.liveAttendanceIntervalId = null;
    }
  }

  private prepareQrCountdownState(): void {
    const configuredSeconds = Number(
      this.activeSession?.qrRotationSeconds || this.defaultQrRotationSeconds,
    );

    this.qrRotationSeconds =
      configuredSeconds > 0 ? configuredSeconds : this.defaultQrRotationSeconds;

    this.lastQrRotatedAt =
      this.activeSession?.qrTokenUpdatedAt ||
      this.activeSession?.createdAt ||
      new Date().toISOString();

    this.updateQrCountdownFromSession();
  }

  private prepareSessionCountdownState(): void {
    if (!this.activeSession?.autoCloseAt || !this.activeSession.startTime) {
      this.sessionTotalSeconds =
        (this.activeSession?.durationMinutes || this.defaultDurationMinutes) * 60;
      this.sessionRemainingSeconds = this.sessionTotalSeconds;
      return;
    }

    const start = new Date(this.activeSession.startTime).getTime();
    const end = new Date(this.activeSession.autoCloseAt).getTime();

    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      this.sessionTotalSeconds =
        (this.activeSession.durationMinutes || this.defaultDurationMinutes) * 60;
    } else {
      this.sessionTotalSeconds = Math.round((end - start) / 1000);
    }

    this.updateSessionCountdownFromSession();
  }

  private updateQrCountdownFromSession(): void {
    if (!this.activeSession || this.activeSession.status !== 'active') {
      this.qrCountdownSeconds = this.defaultQrRotationSeconds;
      return;
    }

    const updatedAt = new Date(
      this.activeSession.qrTokenUpdatedAt ||
        this.activeSession.createdAt ||
        new Date().toISOString(),
    ).getTime();

    if (Number.isNaN(updatedAt)) {
      this.qrCountdownSeconds = this.qrRotationSeconds;
      return;
    }

    const elapsedSeconds = Math.floor((Date.now() - updatedAt) / 1000);
    const remainingSeconds = this.qrRotationSeconds - (elapsedSeconds % this.qrRotationSeconds);

    this.qrCountdownSeconds = Math.max(1, remainingSeconds);
  }

  private updateSessionCountdownFromSession(): void {
    if (
      !this.activeSession ||
      this.activeSession.status !== 'active' ||
      !this.activeSession.autoCloseAt
    ) {
      this.sessionRemainingSeconds = 0;
      return;
    }

    const autoCloseAt = new Date(this.activeSession.autoCloseAt).getTime();

    if (Number.isNaN(autoCloseAt)) {
      this.sessionRemainingSeconds = 0;
      return;
    }

    this.sessionRemainingSeconds = Math.max(0, Math.ceil((autoCloseAt - Date.now()) / 1000));
  }

  private resetTimerState(): void {
    this.qrRotationSeconds = this.defaultQrRotationSeconds;
    this.qrCountdownSeconds = this.defaultQrRotationSeconds;
    this.sessionRemainingSeconds = 0;
    this.sessionTotalSeconds = 0;
    this.lastQrRotatedAt = '';
  }

  private rotateQrToken(showManualMessage: boolean): void {
    if (!this.activeSession?.id || this.activeSession.status !== 'active' || this.isRotatingQr) {
      return;
    }

    if (this.isActiveSessionExpiredLocally()) {
      this.autoCloseCurrentSession(showManualMessage);
      return;
    }

    this.isRotatingQr = true;
    this.forceUiRefresh();

    this.attendanceService
      .rotateSessionQrToken(this.activeSession.id)
      .pipe(take(1))
      .subscribe({
        next: (updatedSession) => {
          this.zone.run(() => {
            this.activeSession = updatedSession;
            this.sessions = this.sessions.map((session) =>
              session.id === updatedSession.id ? updatedSession : session,
            );

            this.prepareQrCountdownState();
            this.prepareSessionCountdownState();
            this.generateQrCode();

            if (updatedSession.status === 'closed') {
              this.closeQrFullscreen();
              this.stopActiveSessionAutomation();
              this.rebuildStudentRows();
              this.rebuildRequestRows();
            }

            if (showManualMessage) {
              this.message =
                updatedSession.status === 'active'
                  ? 'QR and session code refreshed successfully.'
                  : 'Session has expired and was closed.';
            }

            this.isRotatingQr = false;
            this.forceUiRefresh();
          });
        },
        error: (error) => {
          this.zone.run(() => {
            console.error('QR ROTATION ERROR:', error);

            if (showManualMessage) {
              this.errorMessage = error?.message || 'Unable to refresh QR code.';
            }

            this.isRotatingQr = false;
            this.forceUiRefresh();
          });
        },
      });
  }

  private autoCloseCurrentSession(showMessage: boolean): void {
    if (!this.activeSession?.id || this.isAutoClosingSession) return;

    this.isAutoClosingSession = true;
    this.forceUiRefresh();

    this.attendanceService
      .closeExpiredSession(this.activeSession.id)
      .pipe(take(1))
      .subscribe({
        next: (closedSession) => {
          this.zone.run(() => {
            this.sessions = this.sessions.map((session) =>
              session.id === closedSession.id ? closedSession : session,
            );

            this.activeSession = closedSession;
            this.closeQrFullscreen();
            this.generateQrCode();
            this.stopActiveSessionAutomation();

            this.isAutoClosingSession = false;
            this.loadFinalSessionRecords(
              closedSession.id || this.activeSession?.id || '',
              showMessage
                ? 'Session duration ended. Final records, including absent students, are now visible.'
                : '',
            );
            this.forceUiRefresh();
          });
        },
        error: (error) => {
          this.zone.run(() => {
            console.error('AUTO CLOSE SESSION ERROR:', error);
            this.errorMessage = error?.message || 'Unable to auto-close the expired session.';
            this.isAutoClosingSession = false;
            this.forceUiRefresh();
          });
        },
      });
  }

  private refreshSessionLiveData(showManualMessage: boolean): void {
    if (!this.activeSession?.id) return;

    forkJoin({
      records: this.attendanceService.getRecordsBySession(this.activeSession.id).pipe(take(1)),
      requests: this.attendanceService
        .getPendingRequestsBySession(this.activeSession.id)
        .pipe(take(1)),
    }).subscribe({
      next: ({ records, requests }) => {
        this.zone.run(() => {
          const currentSessionId = this.activeSession?.id;

          this.records = [
            ...(records || []),
            ...this.records.filter((record) => record.sessionId !== currentSessionId),
          ];

          this.attendanceRequests = [
            ...(requests || []),
            ...this.attendanceRequests.filter(
              (request) =>
                !(request.sessionId === currentSessionId && request.status === 'pending'),
            ),
          ];

          this.lastLiveSyncAt = new Date().toISOString();
          this.liveStatusMessage = showManualMessage
            ? 'Attendance list updated.'
            : 'Live attendance updated.';

          if (showManualMessage) {
            this.message =
              this.activeSession?.status === 'closed'
                ? 'Final attendance records refreshed.'
                : 'Attendance list refreshed.';
          }

          this.rebuildStudentRows();
          this.rebuildRequestRows();
          this.forceUiRefresh();
        });
      },
      error: (error) => {
        this.zone.run(() => {
          console.error('LIVE ATTENDANCE REFRESH ERROR:', error);

          if (showManualMessage) {
            this.errorMessage = 'Unable to refresh attendance records.';
          }

          this.forceUiRefresh();
        });
      },
    });
  }

  private loadFinalSessionRecords(sessionId: string, successMessage: string): void {
    const cleanSessionId = String(sessionId || '').trim();

    if (!cleanSessionId) {
      this.rebuildStudentRows();
      this.rebuildRequestRows();
      this.forceUiRefresh();
      return;
    }

    this.attendanceService
      .getRecordsBySession(cleanSessionId)
      .pipe(take(1))
      .subscribe({
        next: (finalRecords) => {
          this.zone.run(() => {
            this.records = [
              ...(finalRecords || []),
              ...this.records.filter((record) => record.sessionId !== cleanSessionId),
            ];

            if (successMessage) {
              this.message = successMessage;
            }

            this.lastLiveSyncAt = new Date().toISOString();
            this.rebuildStudentRows();
            this.rebuildRequestRows();
            this.forceUiRefresh();
          });
        },
        error: (error) => {
          this.zone.run(() => {
            console.error('LOAD FINAL SESSION RECORDS ERROR:', error);
            this.errorMessage =
              'Session closed, but final attendance records could not be refreshed automatically. Click Sync to reload them.';
            this.rebuildStudentRows();
            this.rebuildRequestRows();
            this.forceUiRefresh();
          });
        },
      });
  }

  private prepareImportRows(rawRows: Record<string, unknown>[]): ImportPreviewRow[] {
    const duplicateTracker = new Set<string>();
    const validStatuses: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];
    const allowedStudents = this.getSelectedOfferingStudents();

    return rawRows.map((rawRow, index) => {
      const studentIdRaw = this.cleanCell(
        this.findCellValue(rawRow, ['studentId', 'student id', 'student record id']),
      );

      const studentNumberRaw = this.cleanCell(
        this.findCellValue(rawRow, [
          'studentNumber',
          'student number',
          'student no',
          'student no.',
          'student id number',
          'id number',
        ]),
      );

      const statusRaw = this.cleanCell(this.findCellValue(rawRow, ['status', 'attendance status']))
        .toLowerCase()
        .replace(/\s+/g, '_');

      const timeRecordedRaw = this.findCellValue(rawRow, [
        'timeRecorded',
        'time recorded',
        'time',
        'date time',
        'datetime',
      ]);

      const lateTime = this.cleanCell(this.findCellValue(rawRow, ['lateTime', 'late time']));
      const remarks = this.cleanCell(this.findCellValue(rawRow, ['remarks', 'remark', 'note']));

      const errors: string[] = [];

      let matchedStudent = allowedStudents.find(
        (student) => student.id && student.id === studentIdRaw,
      );

      if (!matchedStudent && studentNumberRaw) {
        matchedStudent = allowedStudents.find(
          (student) =>
            student.studentNumber?.trim().toLowerCase() === studentNumberRaw.toLowerCase(),
        );
      }

      if (!studentIdRaw && !studentNumberRaw) {
        errors.push('Missing studentId or studentNumber.');
      }

      if (!matchedStudent) {
        errors.push('Student is not found in this selected class section.');
      }

      if (!statusRaw || !validStatuses.includes(statusRaw as AttendanceStatus)) {
        errors.push('Invalid status. Use present, late, absent, or excused.');
      }

      if (statusRaw === 'late' && !lateTime) {
        errors.push('Late time is required for late status.');
      }

      const finalStudentId = matchedStudent?.id || studentIdRaw;
      const duplicateKey =
        this.importTarget === 'active_session'
          ? `${this.activeSession?.id || ''}-${finalStudentId}`
          : `${this.selectedOfferingId}-${this.historicalImportDate}-${finalStudentId}`;

      if (finalStudentId && duplicateTracker.has(duplicateKey)) {
        errors.push('Duplicate student inside uploaded file.');
      }

      if (finalStudentId) {
        duplicateTracker.add(duplicateKey);
      }

      if (finalStudentId && this.importTarget === 'active_session') {
        const alreadyRecorded = this.records.some(
          (record) =>
            record.sessionId === this.activeSession?.id && record.studentId === finalStudentId,
        );

        if (alreadyRecorded) {
          errors.push('Attendance is already recorded for this student in this live session.');
        }
      }

      if (finalStudentId && this.importTarget === 'historical') {
        const alreadyImportedForDate = this.isAlreadyRecordedForHistoricalDate(finalStudentId);

        if (alreadyImportedForDate) {
          errors.push('Attendance already exists for this student on the selected date.');
        }
      }

      const timeRecorded =
        this.importTarget === 'historical'
          ? this.normalizeImportedDateTime(timeRecordedRaw, this.historicalImportDate)
          : this.normalizeImportedDateTime(timeRecordedRaw);

      return {
        rowNumber: index + 2,
        studentId: finalStudentId || '',
        studentNumber: matchedStudent?.studentNumber || studentNumberRaw,
        studentName: matchedStudent ? this.getStudentName(matchedStudent) : 'Unknown Student',
        status: validStatuses.includes(statusRaw as AttendanceStatus)
          ? (statusRaw as AttendanceStatus)
          : '',
        timeRecorded,
        lateTime,
        remarks,
        valid: errors.length === 0,
        errors,
      };
    });
  }

  private findCellValue(row: Record<string, unknown>, possibleKeys: string[]): unknown {
    const normalizedRow = new Map<string, unknown>();

    Object.keys(row).forEach((key) => {
      normalizedRow.set(this.normalizeKey(key), row[key]);
    });

    for (const key of possibleKeys) {
      const value = normalizedRow.get(this.normalizeKey(key));

      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }

    return '';
  }

  private normalizeKey(key: string): string {
    return key.toLowerCase().replace(/[\s_.-]/g, '');
  }

  private cleanCell(value: unknown): string {
    return String(value ?? '').trim();
  }

  private normalizeImportedDateTime(value: unknown, fallbackDate?: string): string {
    if (value === undefined || value === null || value === '') {
      return fallbackDate
        ? this.combineDateAndTime(fallbackDate, this.historicalStartTime || '08:00')
        : new Date().toISOString();
    }

    if (typeof value === 'number') {
      const parsed = XLSX.SSF.parse_date_code(value);

      if (parsed) {
        return new Date(
          parsed.y,
          parsed.m - 1,
          parsed.d,
          parsed.H,
          parsed.M,
          parsed.S,
        ).toISOString();
      }
    }

    const text = String(value).trim();

    if (/^\d{1,2}:\d{2}$/.test(text) && fallbackDate) {
      return this.combineDateAndTime(fallbackDate, text);
    }

    const parsedDate = new Date(text);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString();
    }

    return fallbackDate
      ? this.combineDateAndTime(fallbackDate, this.historicalStartTime || '08:00')
      : new Date().toISOString();
  }

  private combineDateAndTime(dateValue: string, timeValue: string): string {
    const cleanDate = String(dateValue || '').trim();
    const cleanTime = String(timeValue || '00:00').trim();
    const normalizedTime = /^\d{1,2}:\d{2}$/.test(cleanTime) ? cleanTime : '00:00';
    const [hourRaw, minuteRaw] = normalizedTime.split(':');
    const hour = String(Number(hourRaw)).padStart(2, '0');
    const minute = String(Number(minuteRaw)).padStart(2, '0');

    const parsed = new Date(`${cleanDate}T${hour}:${minute}:00`);

    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }

    return parsed.toISOString();
  }

  private clearImportPreviewOnly(): void {
    this.importRows = [];
    this.importFileName = '';
  }

  private findCurrentTeacher(): Teacher | null {
    if (!this.currentUser?.id) return null;

    return (
      this.teachers.find((teacher) => teacher.userId === this.currentUser?.id) ||
      this.teachers.find(
        (teacher) =>
          teacher.email?.trim().toLowerCase() === this.currentUser?.email?.trim().toLowerCase(),
      ) ||
      null
    );
  }

  private syncSelectedOffering(): void {
    this.selectedOffering =
      this.teacherOfferings.find((offering) => offering.id === this.selectedOfferingId) || null;

    const offeringSessions = this.sessions
      .filter(
        (session) =>
          session.classOfferingId === this.selectedOfferingId && session.mode !== 'imported_excel',
      )
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    this.activeSession =
      offeringSessions.find((session) => session.status === 'active') ||
      offeringSessions[0] ||
      null;

    this.generateQrCode();
    this.rebuildStudentRows();
    this.rebuildRequestRows();
  }

  private rebuildStudentRows(): void {
    this.ensureCurrentDisplaySessionScope();

    if (!this.selectedOffering || !this.activeSession?.id) {
      this.studentRows = [];
      return;
    }

    const activeSessionRecords = this.records
      .filter((record) => record.sessionId === this.activeSession?.id)
      .filter(
        (record) => !this.locallyClearedRecordKeys.has(this.getAttendanceDisplayRecordKey(record)),
      )
      .sort((a, b) => String(b.timeRecorded || '').localeCompare(String(a.timeRecorded || '')));

    this.studentRows = activeSessionRecords.map((record) => {
      const matchedStudent =
        this.resolveStudentForRecord(record) || this.buildPlaceholderStudentFromRecord(record);

      return {
        student: matchedStudent,
        record,
        status: record.status,
        lateTime: record.lateTime || '',
        remarks: record.remarks || '',
        isSaving: false,
      };
    });
  }

  private rebuildRequestRows(): void {
    if (!this.activeSession?.id) {
      this.requestRows = [];
      return;
    }

    this.requestRows = this.attendanceRequests
      .filter(
        (request) => request.sessionId === this.activeSession?.id && request.status === 'pending',
      )
      .map((request) => ({
        request,
        student: this.students.find((student) => student.id === request.studentId),
      }))
      .sort((a, b) => (b.request.requestedAt || '').localeCompare(a.request.requestedAt || ''));
  }

  private getTeacherOfferings(): ClassOffering[] {
    const teacherId = this.getInstructorId();

    if (!teacherId) return [];

    return this.offerings
      .filter(
        (offering) =>
          offering.teacherId === teacherId &&
          offering.status !== 'inactive' &&
          offering.status !== 'archived' &&
          !offering.isArchived,
      )
      .sort((a, b) => {
        const sectionCompare = a.sectionName.localeCompare(b.sectionName);
        if (sectionCompare !== 0) return sectionCompare;

        return a.subjectCode.localeCompare(b.subjectCode);
      });
  }

  private getSelectedOfferingStudents(): Student[] {
    if (!this.selectedOffering) return [];

    return this.students
      .filter((student) => this.studentBelongsToOffering(student, this.selectedOffering!))
      .sort((a, b) => this.getStudentName(a).localeCompare(this.getStudentName(b)));
  }

  private studentBelongsToOffering(student: Student, offering: ClassOffering): boolean {
    if (!student || !offering) return false;

    if (student.status === 'inactive' || student.status === 'archived' || student.isArchived) {
      return false;
    }

    const studentSectionId = this.normalizeText(student.sectionId);
    const offeringSectionId = this.normalizeText(offering.sectionId);
    const offeringSectionName = this.normalizeText(offering.sectionName);

    const studentCompactSectionId = this.normalizeCompactText(student.sectionId);
    const offeringCompactSectionId = this.normalizeCompactText(offering.sectionId);
    const offeringCompactSectionName = this.normalizeCompactText(offering.sectionName);

    const normalValues = [studentSectionId].filter(Boolean);
    const normalOfferingValues = [offeringSectionId, offeringSectionName].filter(Boolean);

    const compactValues = [studentCompactSectionId].filter(Boolean);
    const compactOfferingValues = [offeringCompactSectionId, offeringCompactSectionName].filter(
      Boolean,
    );

    const normalMatch = normalValues.some((studentValue) =>
      normalOfferingValues.some(
        (offeringValue) =>
          studentValue === offeringValue ||
          studentValue.endsWith(offeringValue) ||
          offeringValue.endsWith(studentValue),
      ),
    );

    if (normalMatch) return true;

    return compactValues.some((studentValue) =>
      compactOfferingValues.some(
        (offeringValue) =>
          studentValue === offeringValue ||
          studentValue.endsWith(offeringValue) ||
          offeringValue.endsWith(studentValue),
      ),
    );
  }

  private resolveStudentForRecord(record: AttendanceRecord): Student | undefined {
    const recordStudentId = this.normalizeText(record.studentId);
    const recordStudentCompactId = this.normalizeCompactText(record.studentId);
    const recordStudentNumber = this.normalizeText((record as any).studentNumber);

    return this.students.find((student) => {
      const studentDocId = this.normalizeText(student.id);
      const studentUserId = this.normalizeText(student.userId);
      const studentNumber = this.normalizeText(student.studentNumber);
      const studentCompactDocId = this.normalizeCompactText(student.id);
      const studentCompactUserId = this.normalizeCompactText(student.userId);
      const studentCompactNumber = this.normalizeCompactText(student.studentNumber);

      return (
        (!!recordStudentId &&
          (recordStudentId === studentDocId ||
            recordStudentId === studentUserId ||
            recordStudentId === studentNumber)) ||
        (!!recordStudentCompactId &&
          (recordStudentCompactId === studentCompactDocId ||
            recordStudentCompactId === studentCompactUserId ||
            recordStudentCompactId === studentCompactNumber)) ||
        (!!recordStudentNumber && recordStudentNumber === studentNumber)
      );
    });
  }

  private recordBelongsToStudent(record: AttendanceRecord, student: Student): boolean {
    const recordStudentId = this.normalizeText(record.studentId);
    const recordCompactStudentId = this.normalizeCompactText(record.studentId);
    const recordStudentNumber = this.normalizeText((record as any).studentNumber);

    const studentDocId = this.normalizeText(student.id);
    const studentUserId = this.normalizeText(student.userId);
    const studentNumber = this.normalizeText(student.studentNumber);
    const studentCompactDocId = this.normalizeCompactText(student.id);
    const studentCompactUserId = this.normalizeCompactText(student.userId);
    const studentCompactNumber = this.normalizeCompactText(student.studentNumber);

    return (
      (!!recordStudentId &&
        (recordStudentId === studentDocId ||
          recordStudentId === studentUserId ||
          recordStudentId === studentNumber)) ||
      (!!recordCompactStudentId &&
        (recordCompactStudentId === studentCompactDocId ||
          recordCompactStudentId === studentCompactUserId ||
          recordCompactStudentId === studentCompactNumber)) ||
      (!!recordStudentNumber && recordStudentNumber === studentNumber)
    );
  }

  private buildPlaceholderStudentFromRecord(record: AttendanceRecord): Student {
    return {
      id: record.studentId,
      studentNumber: record.studentId || 'Recorded Student',
      firstName: 'Recorded',
      lastName: 'Student',
      sectionId: this.selectedOffering?.sectionId || this.selectedOffering?.sectionName || '',
      yearLevel: '',
      status: 'active',
    };
  }

  private normalizeText(value: unknown): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/ +/g, ' ');
  }

  private normalizeCompactText(value: unknown): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private ensureCurrentDisplaySessionScope(): void {
    const nextSessionId = this.activeSession?.id || '';

    if (this.currentDisplaySessionId !== nextSessionId) {
      this.currentDisplaySessionId = nextSessionId;
      this.loadClearedRecordKeysForCurrentSession();
    }
  }

  private getClearedRecordStorageKey(): string {
    const userId = this.currentUser?.id || this.currentUser?.email || 'teacher';
    const sessionId = this.currentDisplaySessionId || this.activeSession?.id || 'no-session';

    return `sams-attendance-board-cleared:${userId}:${sessionId}`;
  }

  private loadClearedRecordKeysForCurrentSession(): void {
    this.locallyClearedRecordKeys.clear();

    if (!this.currentDisplaySessionId) return;

    try {
      const savedValue = localStorage.getItem(this.getClearedRecordStorageKey());
      const savedKeys = savedValue ? (JSON.parse(savedValue) as string[]) : [];

      if (Array.isArray(savedKeys)) {
        savedKeys.forEach((key) => {
          if (key) this.locallyClearedRecordKeys.add(String(key));
        });
      }
    } catch {
      this.locallyClearedRecordKeys.clear();
    }
  }

  private saveClearedRecordKeysForCurrentSession(): void {
    if (!this.currentDisplaySessionId && this.activeSession?.id) {
      this.currentDisplaySessionId = this.activeSession.id;
    }

    if (!this.currentDisplaySessionId) return;

    try {
      localStorage.setItem(
        this.getClearedRecordStorageKey(),
        JSON.stringify(Array.from(this.locallyClearedRecordKeys)),
      );
    } catch {
      // Browser storage may be unavailable. The board will still clear for the current page session.
    }
  }

  private getAttendanceDisplayRecordKey(record: AttendanceRecord, student?: Student): string {
    return (
      record.id ||
      `${record.sessionId || this.activeSession?.id || 'session'}_${
        record.studentId || student?.id || student?.studentNumber || 'student'
      }`
    );
  }

  private getInstructorId(): string {
    return this.currentTeacher?.id || '';
  }

  private generateQrCode(): void {
    if (!this.activeSession?.qrToken || this.activeSession.status !== 'active') {
      this.qrImageUrl = '';
      this.closeQrFullscreen();
      this.forceUiRefresh();
      return;
    }

    QRCode.toDataURL(this.activeSession.qrToken, {
      width: 420,
      margin: 2,
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        this.zone.run(() => {
          this.qrImageUrl = url;
          this.forceUiRefresh();
        });
      })
      .catch((error) => {
        this.zone.run(() => {
          console.error('QR GENERATION ERROR:', error);
          this.qrImageUrl = '';
          this.closeQrFullscreen();
          this.forceUiRefresh();
        });
      });
  }

  private isActiveSessionExpiredLocally(): boolean {
    if (!this.activeSession || this.activeSession.status !== 'active') return false;
    if (!this.activeSession.autoCloseAt) return false;

    const autoCloseAt = new Date(this.activeSession.autoCloseAt).getTime();

    if (Number.isNaN(autoCloseAt)) return false;

    return Date.now() >= autoCloseAt;
  }

  private isAlreadyRecordedForHistoricalDate(studentId: string): boolean {
    const matchingSessionIds = new Set(
      this.sessions
        .filter(
          (session) =>
            session.classOfferingId === this.selectedOfferingId &&
            session.date === this.historicalImportDate,
        )
        .map((session) => session.id)
        .filter(Boolean) as string[],
    );

    if (!matchingSessionIds.size) return false;

    return this.records.some(
      (record) => record.studentId === studentId && matchingSessionIds.has(record.sessionId),
    );
  }

  private formatDurationFromSeconds(totalSeconds: number): string {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  private getTodayInputValue(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private lockPageScroll(): void {
    document.body.style.overflow = 'hidden';
  }

  private unlockPageScroll(): void {
    document.body.style.overflow = '';
  }

  private clearAlerts(): void {
    this.message = '';
    this.errorMessage = '';
    this.importErrorMessage = '';
  }

  private forceUiRefresh(): void {
    try {
      this.cdr.markForCheck();
    } catch {
      // Ignore rare timing errors when the view is being destroyed.
    }

    requestAnimationFrame(() => {
      try {
        this.cdr.detectChanges();
      } catch {
        // Ignore rare timing errors when Angular is already checking the view.
      }
    });
  }
}
