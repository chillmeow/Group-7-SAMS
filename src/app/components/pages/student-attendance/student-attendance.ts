import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';
import { Html5Qrcode } from 'html5-qrcode';

import { AttendanceService } from '../../../services/attendance.service';
import { AuthService } from '../../../services/auth.service';
import { StudentService } from '../../../services/student.service';

import { AttendanceRecord } from '../../../models/attendance-record.model';
import { Student } from '../../../models/student.model';

type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';
type SubmissionMode = 'code' | 'qr';

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

  private qrScanner: Html5Qrcode | null = null;
  private readonly scannerElementId = 'student-qr-reader';

  currentUser = this.authService.getCurrentUser();
  currentStudent: Student | null = null;

  submissionMode: SubmissionMode = 'code';

  sessionCode = '';
  qrToken = '';

  loading = false;
  historyLoading = false;
  scannerOpen = false;
  scannerStarting = false;

  message = '';
  error = '';

  records: AttendanceRecord[] = [];
  students: Student[] = [];

  ngOnInit(): void {
    this.loadStudentData();
  }

  ngOnDestroy(): void {
    this.stopScanner();
  }

  get studentName(): string {
    if (!this.currentStudent) return 'Student';
    return `${this.currentStudent.firstName || ''} ${this.currentStudent.lastName || ''}`.trim();
  }

  get studentNumber(): string {
    return this.currentStudent?.studentNumber || '—';
  }

  setMode(mode: SubmissionMode): void {
    this.submissionMode = mode;
    this.message = '';
    this.error = '';

    if (mode === 'code') {
      this.stopScanner();
    }
  }

  loadStudentData(): void {
    this.historyLoading = true;
    this.clearAlerts();

    this.studentService
      .getStudents()
      .pipe(take(1))
      .subscribe({
        next: (students) => {
          this.zone.run(() => {
            this.students = students || [];
            this.currentStudent = this.findCurrentStudent();

            if (!this.currentStudent?.id) {
              this.error =
                'No linked student record was found for the current login. Please check the student account link.';
              this.records = [];
              this.historyLoading = false;
              this.cdr.detectChanges();
              return;
            }

            this.loadHistory();
          });
        },
        error: () => {
          this.zone.run(() => {
            this.students = [];
            this.currentStudent = null;
            this.records = [];
            this.error = 'Failed to load student account data.';
            this.historyLoading = false;
            this.cdr.detectChanges();
          });
        },
      });
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
            // Ignore scan frame errors.
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
              'Unable to open camera. Please allow camera permission or paste the QR token manually.';
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
    if (!this.currentStudent?.id) {
      this.error = 'No linked student record was found for the current login.';
      return;
    }

    const inputValue =
      this.submissionMode === 'code' ? this.sessionCode.trim() : this.qrToken.trim();

    if (!inputValue) {
      this.error =
        this.submissionMode === 'code'
          ? 'Please enter a session code.'
          : 'Please scan or paste a QR token.';
      return;
    }

    this.loading = true;
    this.clearAlerts();

    const request =
      this.submissionMode === 'code'
        ? this.attendanceService.submitViaCode(inputValue, this.currentStudent.id)
        : this.attendanceService.submitViaQR(inputValue, this.currentStudent.id);

    request.pipe(take(1)).subscribe({
      next: () => {
        this.zone.run(() => {
          this.message = 'Attendance recorded successfully.';
          this.sessionCode = '';
          this.qrToken = '';
          this.loading = false;
          this.loadHistory();
          this.cdr.detectChanges();
        });
      },
      error: (err) => {
        this.zone.run(() => {
          this.error = err?.message || 'Failed to record attendance.';
          this.loading = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  loadHistory(): void {
    if (!this.currentStudent?.id) {
      this.records = [];
      this.historyLoading = false;
      return;
    }

    this.historyLoading = true;

    forkJoin({
      records: this.attendanceService.getRecordsByStudent(this.currentStudent.id).pipe(take(1)),
    }).subscribe({
      next: ({ records }) => {
        this.zone.run(() => {
          this.records = (records || []).sort((a, b) =>
            (b.timeRecorded || '').localeCompare(a.timeRecorded || ''),
          );
          this.historyLoading = false;
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.zone.run(() => {
          this.records = [];
          this.error = 'Failed to load attendance history.';
          this.historyLoading = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  refresh(): void {
    this.loadStudentData();
  }

  getStatusLabel(status: AttendanceStatus): string {
    if (status === 'present') return 'Present';
    if (status === 'late') return 'Late';
    if (status === 'absent') return 'Absent';
    if (status === 'excused') return 'Excused';

    return status;
  }

  getMethodLabel(method: 'qr' | 'manual' | 'code'): string {
    if (method === 'qr') return 'QR Scan';
    if (method === 'manual') return 'Manual';
    if (method === 'code') return 'Session Code';

    return method;
  }

  formatDateTime(value: string): string {
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

  trackByRecord(index: number, record: AttendanceRecord): string {
    return record.id || `${record.sessionId}-${record.studentId}-${index}`;
  }

  private findCurrentStudent(): Student | null {
    if (!this.currentUser?.id) {
      return null;
    }

    return (
      this.students.find((student) => student.userId === this.currentUser?.id) ||
      this.students.find(
        (student) =>
          student.email?.trim().toLowerCase() === this.currentUser?.email?.trim().toLowerCase(),
      ) ||
      null
    );
  }

  private clearAlerts(): void {
    this.message = '';
    this.error = '';
  }
}
