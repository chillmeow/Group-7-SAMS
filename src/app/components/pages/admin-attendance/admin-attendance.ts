import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';

import { AttendanceService } from '../../../services/attendance.service';
import { ClassOfferingService } from '../../../services/class-offering.service';
import { AttendanceRecord } from '../../../models/attendance-record.model';
import { AttendanceSession } from '../../../models/attendance-session.model';
import { ClassOffering } from '../../../models/class-offering.model';

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
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  sessions: AttendanceSession[] = [];
  records: AttendanceRecord[] = [];
  offerings: ClassOffering[] = [];

  rows: AttendanceRow[] = [];
  filteredRows: AttendanceRow[] = [];

  selectedDate = '';
  selectedSection = 'All';
  selectedSubject = 'All';
  selectedStatus = 'active';

  loading = true;
  selectedRow: AttendanceRow | null = null;
  errorMessage = '';

  ngOnInit(): void {
    this.loadAttendanceData();
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

  get totalRecords(): number {
    return this.filteredRows.reduce((sum, row) => sum + row.total, 0);
  }

  get attendanceRate(): number {
    if (!this.totalRecords) return 0;

    return Math.round(((this.totalPresent + this.totalLate) / this.totalRecords) * 100);
  }

  get sectionOptions(): string[] {
    return [
      'All',
      ...new Set(this.offerings.map((offering) => offering.sectionName).filter(Boolean)),
    ];
  }

  get subjectOptions(): string[] {
    return [
      'All',
      ...new Set(this.offerings.map((offering) => offering.subjectName).filter(Boolean)),
    ];
  }

  loadAttendanceData(): void {
    this.loading = true;
    this.errorMessage = '';
    this.selectedRow = null;
    this.cdr.detectChanges();

    forkJoin({
      sessions: this.attendanceService.getSessions().pipe(take(1)),
      records: this.attendanceService.getRecords().pipe(take(1)),
      offerings: this.classOfferingService.getClassOfferings().pipe(take(1)),
    }).subscribe({
      next: ({ sessions, records, offerings }) => {
        this.zone.run(() => {
          this.sessions = sessions || [];
          this.records = records || [];
          this.offerings = offerings || [];

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
          this.rows = [];
          this.filteredRows = [];

          this.errorMessage = 'Unable to load admin attendance monitoring data.';
          this.loading = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  buildRows(): void {
    this.rows = this.sessions.map((session) => {
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
      };
    });

    this.applyFilters();
  }

  applyFilters(): void {
    this.filteredRows = this.rows.filter((row) => {
      const matchesDate = !this.selectedDate || row.session.date === this.selectedDate;

      const matchesSection =
        this.selectedSection === 'All' || row.offering?.sectionName === this.selectedSection;

      const matchesSubject =
        this.selectedSubject === 'All' || row.offering?.subjectName === this.selectedSubject;

      const matchesStatus =
        this.selectedStatus === 'All' || row.session.status === this.selectedStatus;

      return matchesDate && matchesSection && matchesSubject && matchesStatus;
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
    this.selectedDate = '';
    this.selectedSection = 'All';
    this.selectedSubject = 'All';
    this.selectedStatus = 'active';
    this.selectedRow = null;

    this.applyFilters();
  }

  viewDetails(row: AttendanceRow): void {
    this.selectedRow = row;
    this.cdr.detectChanges();
  }

  closeDetails(): void {
    this.selectedRow = null;
    this.cdr.detectChanges();
  }

  formatDate(date: string): string {
    if (!date) return '—';

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return date;
    }

    return parsed.toLocaleDateString();
  }

  formatTime(date: string): string {
    if (!date) return '—';

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return date;
    }

    return parsed.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
