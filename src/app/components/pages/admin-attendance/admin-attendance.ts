import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError, take } from 'rxjs/operators';

import { AttendanceService } from '../../../services/attendance.service';
import { ClassOfferingService } from '../../../services/class-offering.service';
import { StudentService } from '../../../services/student.service';

import { AttendanceRecord, AttendanceStatus } from '../../../models/attendance-record.model';
import { AttendanceSession } from '../../../models/attendance-session.model';
import { ClassOffering } from '../../../models/class-offering.model';
import { Student } from '../../../models/student.model';

type SessionStatusFilter = 'All' | 'active' | 'closed';
type AttendanceViewMode = 'sessions' | 'logs';
type SummaryTone = 'blue' | 'green' | 'orange' | 'red' | 'purple';

interface AttendanceSummaryCard {
  label: string;
  value: number | string;
  icon: string;
  tone: SummaryTone;
}

interface AttendanceRow {
  session: AttendanceSession;
  offering?: ClassOffering;
  records: AttendanceRecord[];
  present: number;
  late: number;
  absent: number;
  excused: number;
  total: number;
  rate: number;
  latestRecordTime: string;
}

interface AttendanceLogRow {
  record: AttendanceRecord;
  session?: AttendanceSession;
  offering?: ClassOffering;
  student?: Student;
}

@Component({
  selector: 'app-admin-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-attendance.html',
  styleUrl: './admin-attendance.scss',
})
export class AdminAttendance implements OnInit {
  private readonly attendanceService = inject(AttendanceService);
  private readonly classOfferingService = inject(ClassOfferingService);
  private readonly studentService = inject(StudentService);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  sessions: AttendanceSession[] = [];
  records: AttendanceRecord[] = [];
  offerings: ClassOffering[] = [];
  students: Student[] = [];

  rows: AttendanceRow[] = [];
  filteredRows: AttendanceRow[] = [];

  selectedDate = this.toInputDate(new Date());
  selectedSection = 'All';
  selectedSubject = 'All';
  selectedStatus: SessionStatusFilter = 'All';
  search = '';
  viewMode: AttendanceViewMode = 'sessions';

  loading = true;
  selectedRow: AttendanceRow | null = null;
  errorMessage = '';

  readonly statusOptions: SessionStatusFilter[] = ['All', 'active', 'closed'];

  ngOnInit(): void {
    this.loadAttendanceData();
  }

  get summaryCards(): AttendanceSummaryCard[] {
    return [
      {
        label: 'Active Sessions',
        value: this.activeSessionCount,
        icon: 'pi pi-bolt',
        tone: 'blue',
      },
      {
        label: 'Today Records',
        value: this.totalRecords,
        icon: 'pi pi-database',
        tone: 'purple',
      },
      {
        label: 'Present / Late',
        value: this.totalPresent + this.totalLate,
        icon: 'pi pi-check-circle',
        tone: 'green',
      },
      {
        label: 'Attendance Rate',
        value: `${this.attendanceRate}%`,
        icon: 'pi pi-chart-line',
        tone: this.attendanceRate >= 90 ? 'green' : this.attendanceRate >= 75 ? 'orange' : 'red',
      },
    ];
  }

  get statusCards(): AttendanceSummaryCard[] {
    return [
      {
        label: 'Present',
        value: this.totalPresent,
        icon: 'pi pi-check',
        tone: 'green',
      },
      {
        label: 'Late',
        value: this.totalLate,
        icon: 'pi pi-clock',
        tone: 'orange',
      },
      {
        label: 'Absent',
        value: this.totalAbsent,
        icon: 'pi pi-times-circle',
        tone: 'red',
      },
      {
        label: 'Excused',
        value: this.totalExcused,
        icon: 'pi pi-info-circle',
        tone: 'blue',
      },
    ];
  }

  get activeSessionCount(): number {
    return this.filteredRows.filter((row) => row.session.status === 'active').length;
  }

  get closedSessionCount(): number {
    return this.filteredRows.filter((row) => row.session.status === 'closed').length;
  }

  get totalPresent(): number {
    return this.filteredRows.reduce((sum, row) => sum + row.present, 0);
  }

  get totalLate(): number {
    return this.filteredRows.reduce((sum, row) => sum + row.late, 0);
  }

  get totalAbsent(): number {
    return this.filteredRows.reduce((sum, row) => sum + row.absent, 0);
  }

  get totalExcused(): number {
    return this.filteredRows.reduce((sum, row) => sum + row.excused, 0);
  }

  get totalRecords(): number {
    return this.filteredRows.reduce((sum, row) => sum + row.total, 0);
  }

  get attendanceRate(): number {
    if (!this.totalRecords) {
      return 0;
    }

    return Math.round(
      ((this.totalPresent + this.totalLate + this.totalExcused) / this.totalRecords) * 100,
    );
  }

  get filteredLogs(): AttendanceLogRow[] {
    const visibleSessionIds = new Set(
      this.filteredRows.map((row) => String(row.session.id || '')).filter(Boolean),
    );

    return this.records
      .filter((record) => visibleSessionIds.has(String(record.sessionId)))
      .map((record) => {
        const session = this.sessions.find((item) => String(item.id) === String(record.sessionId));
        const offering = session
          ? this.offerings.find((item) => String(item.id) === String(session.classOfferingId))
          : undefined;
        const student = this.findStudent(record.studentId);

        return {
          record,
          session,
          offering,
          student,
        };
      })
      .sort(
        (a, b) => this.getRecordDate(b.record).getTime() - this.getRecordDate(a.record).getTime(),
      )
      .slice(0, 25);
  }

  get recentActiveSessions(): AttendanceRow[] {
    return this.filteredRows.filter((row) => row.session.status === 'active').slice(0, 6);
  }

  get sectionOptions(): string[] {
    const sections = this.rows.map((row) => row.offering?.sectionName || '').filter(Boolean);

    return ['All', ...Array.from(new Set(sections)).sort()];
  }

  get subjectOptions(): string[] {
    const subjects = this.rows
      .map((row) => row.offering?.subjectName || row.offering?.subjectCode || '')
      .filter(Boolean);

    return ['All', ...Array.from(new Set(subjects)).sort()];
  }

  get monitoringDateLabel(): string {
    if (!this.selectedDate) {
      return 'All available dates';
    }

    return this.formatDate(this.selectedDate);
  }

  get hasFilters(): boolean {
    return Boolean(
      this.search ||
      this.selectedDate ||
      this.selectedSection !== 'All' ||
      this.selectedSubject !== 'All' ||
      this.selectedStatus !== 'All',
    );
  }

  loadAttendanceData(): void {
    this.loading = true;
    this.errorMessage = '';
    this.selectedRow = null;
    this.cdr.detectChanges();

    forkJoin({
      sessions: this.attendanceService.getSessions().pipe(
        take(1),
        catchError(() => of([] as AttendanceSession[])),
      ),
      records: this.attendanceService.getRecords().pipe(
        take(1),
        catchError(() => of([] as AttendanceRecord[])),
      ),
      offerings: this.classOfferingService.getClassOfferings().pipe(
        take(1),
        catchError(() => of([] as ClassOffering[])),
      ),
      students: this.studentService.getStudents().pipe(
        take(1),
        catchError(() => of([] as Student[])),
      ),
    }).subscribe({
      next: ({ sessions, records, offerings, students }) => {
        this.zone.run(() => {
          this.sessions = sessions || [];
          this.records = (records || []).filter((record) => record.isValid !== false);
          this.offerings = offerings || [];
          this.students = students || [];

          this.buildRows();

          this.loading = false;
          this.cdr.detectChanges();
        });
      },
      error: (error) => {
        this.zone.run(() => {
          console.error('ADMIN ATTENDANCE LOAD ERROR:', error);

          this.sessions = [];
          this.records = [];
          this.offerings = [];
          this.students = [];
          this.rows = [];
          this.filteredRows = [];

          this.errorMessage = 'Unable to load live attendance monitoring data.';
          this.loading = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  buildRows(): void {
    this.rows = this.sessions
      .map((session) => {
        const offering = this.offerings.find(
          (item) => String(item.id) === String(session.classOfferingId),
        );

        const sessionRecords = this.records.filter(
          (record) => String(record.sessionId) === String(session.id),
        );

        const present = sessionRecords.filter((record) => record.status === 'present').length;
        const late = sessionRecords.filter((record) => record.status === 'late').length;
        const absent = sessionRecords.filter((record) => record.status === 'absent').length;
        const excused = sessionRecords.filter((record) => record.status === 'excused').length;

        const total = sessionRecords.length;
        const rate = total ? Math.round(((present + late + excused) / total) * 100) : 0;

        const latestRecordTime =
          sessionRecords
            .map((record) => record.timeRecorded)
            .filter(Boolean)
            .sort()
            .reverse()[0] ||
          session.startTime ||
          session.createdAt ||
          session.date;

        return {
          session,
          offering,
          records: sessionRecords,
          present,
          late,
          absent,
          excused,
          total,
          rate,
          latestRecordTime,
        };
      })
      .sort((a, b) => {
        if (a.session.status !== b.session.status) {
          return a.session.status === 'active' ? -1 : 1;
        }

        return this.getSessionDate(b.session).getTime() - this.getSessionDate(a.session).getTime();
      });

    this.applyFilters();
  }

  applyFilters(): void {
    const keyword = this.search.trim().toLowerCase();

    this.filteredRows = this.rows.filter((row) => {
      const sessionDate = this.getSessionInputDate(row.session);
      const subjectCode = row.offering?.subjectCode || '';
      const subjectName = row.offering?.subjectName || '';
      const sectionName = row.offering?.sectionName || '';
      const teacherName = row.offering?.teacherName || '';
      const sessionCode = row.session.sessionCode || '';

      const matchesDate = !this.selectedDate || sessionDate === this.selectedDate;

      const matchesSection = this.selectedSection === 'All' || sectionName === this.selectedSection;

      const matchesSubject =
        this.selectedSubject === 'All' ||
        subjectName === this.selectedSubject ||
        subjectCode === this.selectedSubject;

      const matchesStatus =
        this.selectedStatus === 'All' || row.session.status === this.selectedStatus;

      const searchableText = [
        subjectCode,
        subjectName,
        sectionName,
        teacherName,
        sessionCode,
        row.session.status,
        String(row.rate),
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = !keyword || searchableText.includes(keyword);

      return matchesDate && matchesSection && matchesSubject && matchesStatus && matchesSearch;
    });

    if (
      this.selectedRow &&
      !this.filteredRows.some(
        (row) => String(row.session.id) === String(this.selectedRow?.session.id),
      )
    ) {
      this.selectedRow = null;
    }

    this.cdr.detectChanges();
  }

  resetFilters(): void {
    this.selectedDate = this.toInputDate(new Date());
    this.selectedSection = 'All';
    this.selectedSubject = 'All';
    this.selectedStatus = 'All';
    this.search = '';
    this.selectedRow = null;

    this.applyFilters();
  }

  showToday(): void {
    this.selectedDate = this.toInputDate(new Date());
    this.selectedStatus = 'All';
    this.applyFilters();
  }

  showActiveSessions(): void {
    this.selectedDate = '';
    this.selectedStatus = 'active';
    this.applyFilters();
  }

  setViewMode(mode: AttendanceViewMode): void {
    this.viewMode = mode;
  }

  viewDetails(row: AttendanceRow): void {
    this.selectedRow = row;
    this.cdr.detectChanges();
  }

  closeDetails(): void {
    this.selectedRow = null;
    this.cdr.detectChanges();
  }

  getSessionTitle(row: AttendanceRow): string {
    const subjectCode = row.offering?.subjectCode || 'Unknown Subject';
    const sectionName = row.offering?.sectionName || 'Unknown Section';

    return `${subjectCode} • ${sectionName}`;
  }

  getSubjectName(row: AttendanceRow): string {
    return row.offering?.subjectName || 'No subject linked';
  }

  getSectionName(row: AttendanceRow): string {
    return row.offering?.sectionName || 'No section linked';
  }

  getTeacherName(row: AttendanceRow): string {
    return row.offering?.teacherName || 'No faculty linked';
  }

  getSessionCode(row: AttendanceRow): string {
    return row.session.sessionCode || 'No code';
  }

  getSessionStatusLabel(status: string | undefined): string {
    if (status === 'active') {
      return 'Active';
    }

    if (status === 'closed') {
      return 'Closed';
    }

    return 'Unknown';
  }

  getSessionStatusClass(status: string | undefined): string {
    if (status === 'active') {
      return 'active';
    }

    if (status === 'closed') {
      return 'closed';
    }

    return 'neutral';
  }

  getAttendanceStatusLabel(status: AttendanceStatus | undefined): string {
    if (status === 'present') {
      return 'Present';
    }

    if (status === 'late') {
      return 'Late';
    }

    if (status === 'absent') {
      return 'Absent';
    }

    if (status === 'excused') {
      return 'Excused';
    }

    return 'Unknown';
  }

  getAttendanceStatusClass(status: AttendanceStatus | undefined): string {
    if (status === 'present') {
      return 'present';
    }

    if (status === 'late') {
      return 'late';
    }

    if (status === 'absent') {
      return 'absent';
    }

    if (status === 'excused') {
      return 'excused';
    }

    return 'neutral';
  }

  getStudentName(record: AttendanceRecord): string {
    const student = this.findStudent(record.studentId);

    if (!student) {
      return 'Unknown Student';
    }

    return `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unnamed Student';
  }

  getStudentNumber(record: AttendanceRecord): string {
    const student = this.findStudent(record.studentId);

    return student?.studentNumber || record.studentId || 'No student number';
  }

  getRecordMethodLabel(method: string | undefined): string {
    if (method === 'qr') {
      return 'QR Scan';
    }

    if (method === 'code') {
      return 'Session Code';
    }

    if (method === 'manual') {
      return 'Manual';
    }

    if (method === 'teacher_assisted') {
      return 'Teacher Assisted';
    }

    if (method === 'imported_excel') {
      return 'Excel Import';
    }

    if (method === 'imported_image') {
      return 'Image Import';
    }

    return 'Other';
  }

  getRecordTime(record: AttendanceRecord): string {
    return this.formatTime(record.timeRecorded);
  }

  getRecordDate(record: AttendanceRecord): Date {
    const parsed = new Date(record.timeRecorded || '');

    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }

    const session = this.sessions.find((item) => String(item.id) === String(record.sessionId));

    return session ? this.getSessionDate(session) : new Date(0);
  }

  getSessionDateLabel(row: AttendanceRow): string {
    return this.formatDate(row.session.date || row.session.startTime || row.session.createdAt);
  }

  getSessionTimeRange(row: AttendanceRow): string {
    const start = this.formatTime(row.session.startTime);
    const end = row.session.endTime ? this.formatTime(row.session.endTime) : '';

    return end && end !== '—' ? `${start} - ${end}` : start;
  }

  getLatestActivityLabel(row: AttendanceRow): string {
    if (!row.latestRecordTime) {
      return 'No activity yet';
    }

    return this.formatTime(row.latestRecordTime);
  }

  getRateClass(rate: number): string {
    if (rate >= 90) {
      return 'good';
    }

    if (rate >= 75) {
      return 'warning';
    }

    return 'danger';
  }

  getBarWidth(value: number): string {
    const safeValue = Math.max(0, Math.min(100, value));
    return `${safeValue}%`;
  }

  formatDate(date: string): string {
    if (!date) {
      return '—';
    }

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return date;
    }

    return parsed.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  formatTime(date: string): string {
    if (!date) {
      return '—';
    }

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return date;
    }

    return parsed.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  trackByRow(index: number, row: AttendanceRow): string | number {
    return row.session.id || row.session.sessionCode || index;
  }

  trackByRecord(index: number, record: AttendanceRecord): string | number {
    return record.id || `${record.sessionId}-${record.studentId}-${index}`;
  }

  trackByLog(index: number, log: AttendanceLogRow): string | number {
    return log.record.id || `${log.record.sessionId}-${log.record.studentId}-${index}`;
  }

  trackByIndex(index: number): number {
    return index;
  }

  private findStudent(studentId: string): Student | undefined {
    const normalized = this.normalizeKey(studentId);

    return this.students.find((student) => {
      return (
        this.normalizeKey(student.id) === normalized ||
        this.normalizeKey(student.studentNumber) === normalized
      );
    });
  }

  private getSessionDate(session: AttendanceSession): Date {
    const startTime = new Date(session.startTime || '');

    if (!Number.isNaN(startTime.getTime())) {
      return startTime;
    }

    const sessionDate = new Date(session.date || '');

    if (!Number.isNaN(sessionDate.getTime())) {
      return sessionDate;
    }

    const createdAt = new Date(session.createdAt || '');

    if (!Number.isNaN(createdAt.getTime())) {
      return createdAt;
    }

    return new Date(0);
  }

  private getSessionInputDate(session: AttendanceSession): string {
    if (session.date && /^\d{4}-\d{2}-\d{2}$/.test(session.date)) {
      return session.date;
    }

    return this.toInputDate(this.getSessionDate(session));
  }

  private toInputDate(date: Date): string {
    return `${date.getFullYear()}-${this.pad(date.getMonth() + 1)}-${this.pad(date.getDate())}`;
  }

  private pad(value: number): string {
    return String(value).padStart(2, '0');
  }

  private normalizeKey(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLowerCase();
  }
}
