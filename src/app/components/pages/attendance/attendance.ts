import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QRCodeComponent } from 'angularx-qrcode';

import { AttendanceService } from '../../../services/attendance.service';
import { StudentService } from '../../../services/student.service';
import { ClassOfferingService } from '../../../services/class-offering.service';

import { AttendanceRecord } from '../../../models/attendance-record.model';
import { AttendanceSession } from '../../../models/attendance-session.model';
import { Student } from '../../../models/student.model';
import { ClassOffering } from '../../../models/class-offering.model';

type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';

interface AttendanceViewRecord {
  id?: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  offeringId: string;
  offeringLabel: string;
  date: string;
  time: string;
  status: AttendanceStatus;
  method: 'qr' | 'manual' | 'code';
  isValid?: boolean;
}

interface AttendanceFormStudent {
  studentId: string;
  name: string;
  studentNumber: string;
  status: AttendanceStatus;
}

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule, QRCodeComponent],
  templateUrl: './attendance.html',
  styleUrl: './attendance.scss',
})
export class AttendanceComponent implements OnInit {
  private attendanceService = inject(AttendanceService);
  private studentService = inject(StudentService);
  private classOfferingService = inject(ClassOfferingService);

  records: AttendanceRecord[] = [];
  sessions: AttendanceSession[] = [];
  students: Student[] = [];
  offerings: ClassOffering[] = [];

  filteredRecords: AttendanceViewRecord[] = [];

  searchTerm = '';
  selectedOffering = '';
  selectedStatus = '';
  selectedDate = '';

  showAttendancePanel = false;
  savingAttendance = false;

  attendanceFormStudents: AttendanceFormStudent[] = [];

  form = {
    offeringId: '',
  };

  currentInstructorId = 'teacher-001';

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.studentService.getStudents().subscribe({
      next: (students) => {
        this.students = students;
        this.refreshView();
      },
      error: (error) => console.error('Failed to load students:', error),
    });

    this.classOfferingService.getClassOfferings().subscribe({
      next: (offerings) => {
        this.offerings = offerings;
        this.refreshView();
      },
      error: (error) => console.error('Failed to load class offerings:', error),
    });

    this.attendanceService.getSessions().subscribe({
      next: (sessions) => {
        this.sessions = sessions;
        this.refreshView();
      },
      error: (error) => console.error('Failed to load sessions:', error),
    });

    this.attendanceService.getRecords().subscribe({
      next: (records) => {
        this.records = records;
        this.refreshView();
      },
      error: (error) => console.error('Failed to load records:', error),
    });
  }

  refreshView(): void {
    this.applyFilters();

    if (this.showAttendancePanel) {
      this.loadAttendanceFormStudents();
    }
  }

  get totalSessions(): number {
    return this.sessions.length;
  }

  get presentToday(): number {
    const today = this.getTodayDate();
    return this.buildViewRecords().filter(
      (record) => record.date === today && record.status === 'present',
    ).length;
  }

  get lateToday(): number {
    const today = this.getTodayDate();
    return this.buildViewRecords().filter(
      (record) => record.date === today && record.status === 'late',
    ).length;
  }

  get absentToday(): number {
    const today = this.getTodayDate();
    return this.buildViewRecords().filter(
      (record) => record.date === today && record.status === 'absent',
    ).length;
  }

  get activeSession(): AttendanceSession | null {
    const active = [...this.sessions].reverse().find((session) => session.status === 'active');

    return active ?? null;
  }

  getOfferingLabel(offeringId: string): string {
    const offering = this.offerings.find((o) => o.id === offeringId);

    if (!offering) {
      return 'Unknown Class Offering';
    }

    return `Class Offering #${offering.id} • Section ${offering.sectionId}`;
  }

  getOfferingStudents(offeringId: string): Student[] {
    const offering = this.offerings.find((o) => o.id === offeringId);

    if (!offering) {
      return [];
    }

    return this.students.filter((student) => student.sectionId === offering.sectionId);
  }

  loadAttendanceFormStudents(): void {
    if (!this.form.offeringId) {
      this.attendanceFormStudents = [];
      return;
    }

    this.attendanceFormStudents = this.getOfferingStudents(this.form.offeringId).map((student) => ({
      studentId: student.id ?? '',
      name: `${student.firstName} ${student.lastName}`,
      studentNumber: student.studentNumber,
      status: 'present',
    }));
  }

  applyFilters(): void {
    const keyword = this.searchTerm.toLowerCase().trim();

    this.filteredRecords = this.buildViewRecords().filter((record) => {
      const matchesSearch =
        !keyword ||
        record.studentName.toLowerCase().includes(keyword) ||
        record.studentNumber.toLowerCase().includes(keyword) ||
        record.offeringLabel.toLowerCase().includes(keyword) ||
        record.date.toLowerCase().includes(keyword) ||
        this.getStatusLabel(record.status).toLowerCase().includes(keyword) ||
        this.getMethodLabel(record.method).toLowerCase().includes(keyword);

      const matchesOffering = !this.selectedOffering || record.offeringId === this.selectedOffering;

      const matchesStatus = !this.selectedStatus || record.status === this.selectedStatus;

      const matchesDate = !this.selectedDate || record.date === this.selectedDate;

      return matchesSearch && matchesOffering && matchesStatus && matchesDate;
    });
  }

  refreshPage(): void {
    this.searchTerm = '';
    this.selectedOffering = '';
    this.selectedStatus = '';
    this.selectedDate = '';
    this.applyFilters();
  }

  openAttendancePanel(): void {
    this.showAttendancePanel = true;
    this.loadAttendanceFormStudents();
  }

  closeAttendancePanel(): void {
    this.showAttendancePanel = false;
  }

  resetAttendanceForm(): void {
    this.form = {
      offeringId: '',
    };
    this.attendanceFormStudents = [];
  }

  onOfferingChange(): void {
    this.loadAttendanceFormStudents();
  }

  setStudentStatus(index: number, status: AttendanceStatus): void {
    this.attendanceFormStudents[index].status = status;
  }

  markAllStudents(status: AttendanceStatus): void {
    this.attendanceFormStudents = this.attendanceFormStudents.map((student) => ({
      ...student,
      status,
    }));
  }

  saveAttendance(): void {
    if (!this.form.offeringId) {
      alert('Please select a class offering first.');
      return;
    }

    if (this.attendanceFormStudents.length === 0) {
      alert('No students found for the selected class offering.');
      return;
    }

    this.savingAttendance = true;

    this.attendanceService.createSession(this.form.offeringId, this.currentInstructorId).subscribe({
      next: (createdSession) => {
        if (!createdSession.id) {
          this.savingAttendance = false;
          alert('Session creation failed.');
          return;
        }

        let completed = 0;
        let failed = 0;
        const total = this.attendanceFormStudents.length;

        this.attendanceFormStudents.forEach((student) => {
          this.attendanceService
            .manualMark(
              createdSession.id!,
              student.studentId,
              student.status,
              this.currentInstructorId,
            )
            .subscribe({
              next: () => {
                completed++;
                if (completed + failed === total) {
                  this.finishSavingAttendance(failed);
                }
              },
              error: (error) => {
                console.error('Failed to save attendance record:', error);
                failed++;
                if (completed + failed === total) {
                  this.finishSavingAttendance(failed);
                }
              },
            });
        });
      },
      error: (error) => {
        console.error('Failed to create attendance session:', error);
        this.savingAttendance = false;
        alert('Failed to create attendance session.');
      },
    });
  }

  finishSavingAttendance(failed: number): void {
    this.savingAttendance = false;
    this.loadData();
    this.closeAttendancePanel();
    this.resetAttendanceForm();

    if (failed > 0) {
      alert(`Attendance saved with ${failed} failed record(s).`);
    } else {
      alert('Attendance saved successfully.');
    }
  }

  closeCurrentSession(): void {
    if (!this.activeSession?.id) return;

    const confirmed = confirm('Close the current active attendance session?');
    if (!confirmed) return;

    this.attendanceService.closeSession(this.activeSession.id).subscribe({
      next: () => {
        this.loadData();
        alert('Attendance session closed successfully.');
      },
      error: (error) => {
        console.error('Failed to close session:', error);
        alert('Failed to close attendance session.');
      },
    });
  }

  editRecord(record: AttendanceViewRecord): void {
    const newStatus = prompt(
      `Update status for ${record.studentName}\nEnter: present, late, absent, or excused`,
      record.status,
    ) as AttendanceStatus | null;

    if (!newStatus) return;

    const normalizedStatus = newStatus.toLowerCase().trim() as AttendanceStatus;
    const validStatuses: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];

    if (!validStatuses.includes(normalizedStatus)) {
      alert('Invalid status entered.');
      return;
    }

    if (!record.id) return;

    this.attendanceService.updateRecord(record.id, { status: normalizedStatus }).subscribe({
      next: () => this.loadData(),
      error: (error) => {
        console.error('Failed to update record:', error);
        alert('Failed to update attendance record.');
      },
    });
  }

  deleteRecord(id?: string): void {
    if (!id) return;

    const confirmed = confirm('Are you sure you want to delete this attendance record?');
    if (!confirmed) return;

    this.attendanceService.deleteRecord(id).subscribe({
      next: () => this.loadData(),
      error: (error) => {
        console.error('Failed to delete record:', error);
        alert('Failed to delete attendance record.');
      },
    });
  }

  getStatusLabel(status: AttendanceStatus): string {
    switch (status) {
      case 'present':
        return 'Present';
      case 'late':
        return 'Late';
      case 'absent':
        return 'Absent';
      case 'excused':
        return 'Excused';
      default:
        return status;
    }
  }

  getMethodLabel(method: 'qr' | 'manual' | 'code'): string {
    switch (method) {
      case 'qr':
        return 'QR Scan';
      case 'manual':
        return 'Manual';
      case 'code':
        return 'Session Code';
      default:
        return method;
    }
  }

  trackByRecord(index: number, record: AttendanceViewRecord): string {
    return record.id ?? `${record.sessionId}-${record.studentId}-${index}`;
  }

  trackByStudent(index: number, student: AttendanceFormStudent): string {
    return student.studentId || `${student.studentNumber}-${index}`;
  }

  private buildViewRecords(): AttendanceViewRecord[] {
    return this.records
      .map((record) => {
        const session = this.sessions.find((s) => s.id === record.sessionId);

        return {
          id: record.id,
          sessionId: record.sessionId,
          studentId: record.studentId,
          studentName: this.getStudentName(record.studentId),
          studentNumber: this.getStudentNumber(record.studentId),
          offeringId: session?.classOfferingId ?? '',
          offeringLabel: this.getOfferingLabel(session?.classOfferingId ?? ''),
          date: session?.date ?? '',
          time: this.formatDateTime(record.timeRecorded),
          status: record.status,
          method: record.method,
          isValid: record.isValid,
        };
      })
      .sort((a, b) => {
        const dateA = `${a.date} ${a.time}`;
        const dateB = `${b.date} ${b.time}`;
        return dateB.localeCompare(dateA);
      });
  }

  private getStudentName(studentId: string): string {
    const student = this.students.find((st) => st.id === studentId);
    return student ? `${student.firstName} ${student.lastName}` : 'Unknown';
  }

  private getStudentNumber(studentId: string): string {
    const student = this.students.find((st) => st.id === studentId);
    return student?.studentNumber ?? '';
  }

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  private formatDateTime(value: string): string {
    if (!value) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
