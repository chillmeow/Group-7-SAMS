import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
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
export class AttendanceComponent implements OnInit {
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

  ngOnInit(): void {
    this.loadPageData();
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

  get validImportRows(): ImportPreviewRow[] {
    return this.importRows.filter((row) => row.valid);
  }

  get invalidImportRows(): ImportPreviewRow[] {
    return this.importRows.filter((row) => !row.valid);
  }

  loadPageData(): void {
    this.isLoading = true;
    this.clearAlerts();

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

          this.isLoading = false;
          this.cdr.detectChanges();
        });
      },
      error: (error) => {
        this.zone.run(() => {
          console.error('LOAD ATTENDANCE PAGE ERROR:', error);
          this.errorMessage = 'Unable to load attendance data.';
          this.isLoading = false;
          this.cdr.detectChanges();
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
    this.cdr.detectChanges();
  }

  backToCatalog(): void {
    this.clearAlerts();
    this.clearImport();
    this.viewMode = 'catalog';
    this.cdr.detectChanges();
  }

  onOfferingChange(): void {
    this.clearAlerts();
    this.clearImport();
    this.syncSelectedOffering();
    this.cdr.detectChanges();
  }

  createSession(): void {
    if (!this.selectedOfferingId) {
      this.errorMessage = 'Please select a class offering first.';
      return;
    }

    const instructorId = this.getInstructorId();

    if (!instructorId) {
      this.errorMessage = 'Unable to identify the current teacher record.';
      return;
    }

    this.isCreatingSession = true;
    this.clearAlerts();
    this.cdr.detectChanges();

    this.attendanceService.createSession(this.selectedOfferingId, instructorId).subscribe({
      next: (session) => {
        this.zone.run(() => {
          this.message = 'Attendance session created successfully.';
          this.activeSession = session;
          this.sessions = [session, ...this.sessions];
          this.isCreatingSession = false;

          this.generateQrCode();
          this.rebuildStudentRows();
          this.rebuildRequestRows();

          this.cdr.detectChanges();
        });
      },
      error: (error) => {
        this.zone.run(() => {
          console.error('CREATE SESSION ERROR:', error);
          this.errorMessage = 'Unable to create attendance session.';
          this.isCreatingSession = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  closeSession(): void {
    if (!this.activeSession?.id) {
      this.errorMessage = 'No active session selected.';
      return;
    }

    this.isClosingSession = true;
    this.clearAlerts();
    this.cdr.detectChanges();

    this.attendanceService.closeSession(this.activeSession.id).subscribe({
      next: (closedSession) => {
        this.zone.run(() => {
          this.message = 'Attendance session closed successfully.';

          this.sessions = this.sessions.map((session) =>
            session.id === closedSession.id ? closedSession : session,
          );

          this.activeSession = closedSession;
          this.generateQrCode();
          this.rebuildStudentRows();
          this.rebuildRequestRows();
          this.clearImport();

          this.isClosingSession = false;
          this.cdr.detectChanges();
        });
      },
      error: (error) => {
        this.zone.run(() => {
          console.error('CLOSE SESSION ERROR:', error);
          this.errorMessage = 'Unable to close attendance session.';
          this.isClosingSession = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  manualMark(row: StudentAttendanceRow, status: AttendanceStatus): void {
    if (!this.activeSession?.id) {
      this.errorMessage = 'Create an active session first.';
      return;
    }

    if (!row.student.id) {
      this.errorMessage = 'Invalid student record.';
      return;
    }

    if (status === 'late' && !row.lateTime) {
      this.errorMessage = 'Please enter the late time before marking this student as late.';
      return;
    }

    const instructorId = this.getInstructorId();

    if (!instructorId) {
      this.errorMessage = 'Unable to identify the current teacher record.';
      return;
    }

    row.isSaving = true;
    this.clearAlerts();
    this.cdr.detectChanges();

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
            this.cdr.detectChanges();
          });
        },
        error: (error) => {
          this.zone.run(() => {
            console.error('MANUAL MARK ERROR:', error);
            row.isSaving = false;
            this.errorMessage = error?.message || 'Unable to mark attendance.';
            this.cdr.detectChanges();
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

    if (!this.activeSession?.id || this.activeSession.status !== 'active') {
      this.importErrorMessage = 'Create an active attendance session before importing a sheet.';
      input.value = '';
      return;
    }

    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['xlsx', 'xls', 'csv'];

    if (!extension || !allowedExtensions.includes(extension)) {
      this.importErrorMessage = 'Please upload a valid Excel or CSV file.';
      input.value = '';
      return;
    }

    this.importFileName = file.name;
    this.importLoading = true;

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
          this.cdr.detectChanges();
        });
      } catch (error) {
        this.zone.run(() => {
          console.error('IMPORT PARSE ERROR:', error);
          this.importErrorMessage =
            error instanceof Error ? error.message : 'Unable to read the uploaded file.';
          this.importRows = [];
          this.importLoading = false;
          this.cdr.detectChanges();
        });
      }
    };

    reader.onerror = () => {
      this.zone.run(() => {
        this.importErrorMessage = 'Unable to read the uploaded file.';
        this.importRows = [];
        this.importLoading = false;
        this.cdr.detectChanges();
      });
    };

    reader.readAsArrayBuffer(file);
  }

  confirmImport(): void {
    if (!this.activeSession?.id || this.activeSession.status !== 'active') {
      this.importErrorMessage = 'Create an active attendance session before confirming import.';
      return;
    }

    if (!this.validImportRows.length || this.invalidImportRows.length > 0) {
      this.importErrorMessage = 'Please fix invalid rows before confirming the import.';
      return;
    }

    const instructorId = this.getInstructorId();

    if (!instructorId) {
      this.importErrorMessage = 'Unable to identify the current teacher record.';
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

    this.attendanceService
      .importAttendanceRecords(payload)
      .pipe(take(1))
      .subscribe({
        next: (savedRecords) => {
          this.zone.run(() => {
            this.records = [...savedRecords, ...this.records];
            this.message = `${savedRecords.length} attendance record(s) imported successfully.`;
            this.importSuccessMessage = `${savedRecords.length} attendance record(s) imported successfully.`;

            this.rebuildStudentRows();
            this.clearImportPreviewOnly();

            this.importLoading = false;
            this.cdr.detectChanges();
          });
        },
        error: (error) => {
          this.zone.run(() => {
            console.error('IMPORT SAVE ERROR:', error);
            this.importErrorMessage =
              error instanceof Error
                ? error.message
                : 'Unable to save imported attendance records.';
            this.importLoading = false;
            this.cdr.detectChanges();
          });
        },
      });
  }

  clearImport(): void {
    this.importRows = [];
    this.importFileName = '';
    this.importLoading = false;
    this.importErrorMessage = '';
    this.importSuccessMessage = '';
  }

  approveRequest(row: AttendanceRequestRow): void {
    if (!row.request.id) return;

    const instructorId = this.getInstructorId();

    if (!instructorId) {
      this.errorMessage = 'Unable to identify the current teacher record.';
      return;
    }

    this.reviewingRequestId = row.request.id;
    this.clearAlerts();
    this.cdr.detectChanges();

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
            this.cdr.detectChanges();
          });
        },
        error: (error) => {
          this.zone.run(() => {
            console.error('APPROVE REQUEST ERROR:', error);
            this.errorMessage = error?.message || 'Unable to approve attendance request.';
            this.reviewingRequestId = '';
            this.cdr.detectChanges();
          });
        },
      });
  }

  rejectRequest(row: AttendanceRequestRow): void {
    if (!row.request.id) return;

    const instructorId = this.getInstructorId();

    if (!instructorId) {
      this.errorMessage = 'Unable to identify the current teacher record.';
      return;
    }

    this.reviewingRequestId = row.request.id;
    this.clearAlerts();
    this.cdr.detectChanges();

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
            this.cdr.detectChanges();
          });
        },
        error: (error) => {
          this.zone.run(() => {
            console.error('REJECT REQUEST ERROR:', error);
            this.errorMessage = error?.message || 'Unable to reject attendance request.';
            this.reviewingRequestId = '';
            this.cdr.detectChanges();
          });
        },
      });
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
          this.cdr.detectChanges();
        });
      })
      .catch(() => {
        this.zone.run(() => {
          this.errorMessage = 'Unable to copy session code.';
          this.cdr.detectChanges();
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
          this.cdr.detectChanges();
        });
      })
      .catch(() => {
        this.zone.run(() => {
          this.errorMessage = 'Unable to copy QR token.';
          this.cdr.detectChanges();
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

  getRequestReasonLabel(reason: string): string {
    if (reason === 'section_mismatch') return 'Section mismatch / sit-in request';
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
    return this.students.filter(
      (student) =>
        student.sectionId === offering.sectionId &&
        student.status !== 'inactive' &&
        student.status !== 'archived',
    ).length;
  }

  getOfferingActiveSession(offering: ClassOffering): AttendanceSession | null {
    return (
      this.sessions.find(
        (session) => session.classOfferingId === offering.id && session.status === 'active',
      ) || null
    );
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

  private prepareImportRows(rawRows: Record<string, unknown>[]): ImportPreviewRow[] {
    const duplicateTracker = new Set<string>();

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
        ]),
      );

      const statusRaw = this.cleanCell(this.findCellValue(rawRow, ['status'])).toLowerCase();

      const timeRecordedRaw = this.findCellValue(rawRow, [
        'timeRecorded',
        'time recorded',
        'time',
        'date time',
        'datetime',
      ]);

      const lateTime = this.cleanCell(this.findCellValue(rawRow, ['lateTime', 'late time']));
      const remarks = this.cleanCell(this.findCellValue(rawRow, ['remarks', 'remark', 'note']));

      const validStatuses: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];
      const errors: string[] = [];

      let matchedStudent = this.studentRows
        .map((row) => row.student)
        .find((student) => student.id && student.id === studentIdRaw);

      if (!matchedStudent && studentNumberRaw) {
        matchedStudent = this.studentRows
          .map((row) => row.student)
          .find(
            (student) =>
              student.studentNumber?.trim().toLowerCase() === studentNumberRaw.toLowerCase(),
          );
      }

      if (!studentIdRaw && !studentNumberRaw) {
        errors.push('Missing studentId or studentNumber.');
      }

      if (!matchedStudent) {
        errors.push('Student is not found in this selected section.');
      }

      if (!statusRaw || !validStatuses.includes(statusRaw as AttendanceStatus)) {
        errors.push('Invalid status. Use present, late, absent, or excused.');
      }

      if (statusRaw === 'late' && !lateTime) {
        errors.push('Late time is required for late status.');
      }

      const finalStudentId = matchedStudent?.id || studentIdRaw;
      const duplicateKey = `${this.activeSession?.id || ''}-${finalStudentId}`;

      if (finalStudentId && duplicateTracker.has(duplicateKey)) {
        errors.push('Duplicate student inside uploaded file.');
      }

      if (finalStudentId) {
        duplicateTracker.add(duplicateKey);
      }

      const alreadyRecorded = this.records.some(
        (record) =>
          record.sessionId === this.activeSession?.id && record.studentId === finalStudentId,
      );

      if (finalStudentId && alreadyRecorded) {
        errors.push('Attendance is already recorded for this student.');
      }

      const timeRecorded = this.normalizeImportedDateTime(timeRecordedRaw);

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

  private normalizeImportedDateTime(value: unknown): string {
    if (value === undefined || value === null || value === '') {
      return new Date().toISOString();
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
    const parsedDate = new Date(text);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString();
    }

    return new Date().toISOString();
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

    this.activeSession =
      this.sessions.find(
        (session) =>
          session.classOfferingId === this.selectedOfferingId && session.status === 'active',
      ) || null;

    this.generateQrCode();
    this.rebuildStudentRows();
    this.rebuildRequestRows();
  }

  private rebuildStudentRows(): void {
    if (!this.selectedOffering) {
      this.studentRows = [];
      return;
    }

    const previousRows = new Map(
      this.studentRows.map((row) => [
        row.student.id || row.student.studentNumber,
        {
          lateTime: row.lateTime,
          remarks: row.remarks,
          isSaving: row.isSaving,
        },
      ]),
    );

    const sectionStudents = this.students
      .filter(
        (student) =>
          student.sectionId === this.selectedOffering?.sectionId &&
          student.status !== 'inactive' &&
          student.status !== 'archived',
      )
      .sort((a, b) => this.getStudentName(a).localeCompare(this.getStudentName(b)));

    this.studentRows = sectionStudents.map((student) => {
      const record = this.records.find(
        (item) => item.sessionId === this.activeSession?.id && item.studentId === student.id,
      );

      const previous = previousRows.get(student.id || student.studentNumber);

      return {
        student,
        record,
        status: record ? record.status : 'not-marked',
        lateTime: record?.lateTime || previous?.lateTime || '',
        remarks: record?.remarks || previous?.remarks || '',
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
          offering.status !== 'archived',
      )
      .sort((a, b) => {
        const sectionCompare = a.sectionName.localeCompare(b.sectionName);
        if (sectionCompare !== 0) return sectionCompare;

        return a.subjectCode.localeCompare(b.subjectCode);
      });
  }

  private getInstructorId(): string {
    return this.currentTeacher?.id || '';
  }

  private generateQrCode(): void {
    if (!this.activeSession?.qrToken || this.activeSession.status !== 'active') {
      this.qrImageUrl = '';
      this.cdr.detectChanges();
      return;
    }

    QRCode.toDataURL(this.activeSession.qrToken, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        this.zone.run(() => {
          this.qrImageUrl = url;
          this.cdr.detectChanges();
        });
      })
      .catch((error) => {
        this.zone.run(() => {
          console.error('QR GENERATION ERROR:', error);
          this.qrImageUrl = '';
          this.cdr.detectChanges();
        });
      });
  }

  private clearAlerts(): void {
    this.message = '';
    this.errorMessage = '';
    this.importErrorMessage = '';
  }
}
