import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';

import { AuthService } from '../../../services/auth.service';
import { ApiService } from '../../../services/api.service';

import { User } from '../../../models/user.model';

type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused' | string;

interface ParentAttendanceRow {
  id: string;
  studentName: string;
  studentNumber: string;
  subjectLabel: string;
  sectionLabel: string;
  status: AttendanceStatus;
  method: string;
  dateTime: string;
  lateTime?: string;
}

interface ChildOption {
  id: string;
  name: string;
  studentNumber: string;
  yearLevel: string;
  sectionId: string;
  status: string;
}

@Component({
  selector: 'app-parent-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './parent-attendance.html',
  styleUrl: './parent-attendance.scss',
})
export class ParentAttendanceComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly apiService = inject(ApiService);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  currentUser: User | null = null;

  isLoading = false;
  errorMessage = '';

  parentRecord: any | null = null;
  children: ChildOption[] = [];
  selectedStudentId = '';

  attendanceRows: ParentAttendanceRow[] = [];

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadParentAttendance();
  }

  get selectedChild(): ChildOption | null {
    return this.children.find((child) => child.id === this.selectedStudentId) || null;
  }

  get filteredRows(): ParentAttendanceRow[] {
    if (!this.selectedStudentId) return this.attendanceRows;

    return this.attendanceRows.filter((row) => row.id.includes(this.selectedStudentId));
  }

  get presentCount(): number {
    return this.filteredRows.filter((row) => row.status === 'present').length;
  }

  get lateCount(): number {
    return this.filteredRows.filter((row) => row.status === 'late').length;
  }

  get absentCount(): number {
    return this.filteredRows.filter((row) => row.status === 'absent').length;
  }

  get excusedCount(): number {
    return this.filteredRows.filter((row) => row.status === 'excused').length;
  }

  get totalRecords(): number {
    return this.filteredRows.length;
  }

  get attendanceRate(): number {
    if (this.totalRecords === 0) return 0;

    return Math.round(((this.presentCount + this.lateCount) / this.totalRecords) * 100);
  }

  get hasConcern(): boolean {
    return this.absentCount > 0 || this.lateCount >= 3;
  }

  loadParentAttendance(): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      parents: this.apiService.getParents().pipe(take(1)),
      students: this.apiService.getStudents().pipe(take(1)),
      attendance: this.apiService.getAttendance().pipe(take(1)),
      sessions: this.apiService.getSessions().pipe(take(1)),
      offerings: this.apiService.getClassOfferings().pipe(take(1)),
      sections: this.apiService.getSections().pipe(take(1)),
      subjects: this.apiService.getSubjects().pipe(take(1)),
    }).subscribe({
      next: ({ parents, students, attendance, sessions, offerings, sections, subjects }) => {
        this.zone.run(() => {
          this.parentRecord = this.findCurrentParent(parents);

          if (!this.parentRecord) {
            this.children = [];
            this.attendanceRows = [];
            this.errorMessage =
              'Your parent account is not linked to a parent record yet. Please contact the administrator.';
            this.isLoading = false;
            this.cdr.detectChanges();
            return;
          }

          const parentId = String(this.parentRecord.id || '');

          const linkedStudents = students.filter((student: any) => {
            const studentParentId = String((student as any).parentId || '').trim();
            const directStudentId = String((this.parentRecord as any).studentId || '').trim();
            const studentIds = Array.isArray((this.parentRecord as any).studentIds)
              ? (this.parentRecord as any).studentIds.map((id: any) => String(id))
              : [];

            return (
              studentParentId === parentId ||
              directStudentId === String(student.id) ||
              studentIds.includes(String(student.id))
            );
          });

          this.children = linkedStudents.map((student: any) => ({
            id: String(student.id),
            name: this.getStudentName(student),
            studentNumber: student.studentNumber || 'No student number',
            yearLevel: student.yearLevel || 'Not set',
            sectionId: String(student.sectionId || ''),
            status: student.status || 'active',
          }));

          if (!this.selectedStudentId && this.children.length > 0) {
            this.selectedStudentId = this.children[0].id;
          }

          const linkedStudentIds = this.children.map((child) => child.id);

          this.attendanceRows = attendance
            .filter((record: any) => linkedStudentIds.includes(String(record.studentId)))
            .map((record: any) => {
              const student = linkedStudents.find(
                (item: any) => String(item.id) === String(record.studentId),
              );

              const session = sessions.find(
                (item: any) => String(item.id) === String(record.sessionId),
              );

              const offering = offerings.find(
                (item: any) =>
                  String(item.id) ===
                  String((session as any)?.classOfferingId || (session as any)?.offeringId || ''),
              );

              const section = sections.find(
                (item: any) =>
                  String(item.id) === String(student?.sectionId || offering?.sectionId),
              );

              const subject = subjects.find(
                (item: any) => String(item.id) === String(offering?.subjectId),
              );

              return {
                id: `${record.studentId}-${record.id}`,
                studentName: this.getStudentName(student),
                studentNumber: student?.studentNumber || 'No student number',
                subjectLabel:
                  (offering as any)?.subjectCode ||
                  (offering as any)?.subjectName ||
                  subject?.subjectCode ||
                  subject?.subjectName ||
                  'Class',
                sectionLabel:
                  (offering as any)?.sectionName || section?.sectionName || 'No section',
                status: record.status || 'unknown',
                method: this.getMethodLabel(record.method),
                dateTime: record.timeRecorded || record.time || '',
                lateTime: record.lateTime || '',
              };
            })
            .sort((a, b) => String(b.dateTime).localeCompare(String(a.dateTime)));

          this.isLoading = false;
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.zone.run(() => {
          this.errorMessage = 'Unable to load parent attendance monitoring data.';
          this.isLoading = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  onChildChange(): void {
    this.cdr.detectChanges();
  }

  getStatusLabel(status: AttendanceStatus): string {
    if (status === 'present') return 'Present';
    if (status === 'late') return 'Late';
    if (status === 'absent') return 'Absent';
    if (status === 'excused') return 'Excused';

    return status || 'Unknown';
  }

  getStatusDescription(status: AttendanceStatus): string {
    if (status === 'present') return 'Student attended the class.';
    if (status === 'late') return 'Student attended but was marked late.';
    if (status === 'absent') return 'Student was marked absent.';
    if (status === 'excused') return 'Student absence was excused.';

    return 'Attendance status recorded.';
  }

  formatDateTime(value?: string): string {
    if (!value) return 'No date';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
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

    return this.formatDateTime(value);
  }

  trackByRow(index: number, row: ParentAttendanceRow): string {
    return row.id || `${row.studentNumber}-${index}`;
  }

  trackByChild(index: number, child: ChildOption): string {
    return child.id || `${child.studentNumber}-${index}`;
  }

  private findCurrentParent(parents: any[]): any | null {
    if (!this.currentUser) return null;

    return (
      parents.find((parent: any) => String(parent.userId || '') === String(this.currentUser?.id)) ||
      parents.find(
        (parent: any) =>
          String(parent.email || '')
            .toLowerCase()
            .trim() ===
          String(this.currentUser?.email || '')
            .toLowerCase()
            .trim(),
      ) ||
      null
    );
  }

  private getStudentName(student: any): string {
    if (!student) return 'Student';

    return `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student';
  }

  private getMethodLabel(method?: string): string {
    if (!method) return 'Not specified';
    if (method === 'qr') return 'QR Scan';
    if (method === 'code') return 'Session Code';
    if (method === 'manual') return 'Teacher Manual';
    if (method === 'teacher_assisted') return 'Teacher Assisted';
    if (method === 'imported_excel') return 'Excel Import';
    if (method === 'imported_image') return 'Image Import';

    return method;
  }
}
