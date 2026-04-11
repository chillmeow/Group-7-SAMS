import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AttendanceService } from '../../../services/attendance.service';
import { StudentService } from '../../../services/student.service';
import { ClassOfferingService } from '../../../services/class-offering.service';
import { AttendanceRecordModel, AttendanceStatus } from '../../../models/attendance-record.model';
import { AttendanceSessionModel } from '../../../models/attendance-session.model';
import { Student } from '../../../models/student.model';
import { ClassOffering } from '../../../models/class-offering.model';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './attendance.html',
  styleUrl: './attendance.scss',
})
export class AttendanceComponent implements OnInit {
  private attendanceService = inject(AttendanceService);
  private studentService = inject(StudentService);
  private classOfferingService = inject(ClassOfferingService);

  records: AttendanceRecordModel[] = [];
  sessions: AttendanceSessionModel[] = [];
  students: Student[] = [];
  offerings: ClassOffering[] = [];

  filteredRecords: AttendanceViewRecord[] = [];

  searchTerm = '';
  selectedOffering = '';
  selectedStatus = '';
  selectedDate = '';

  showAttendancePanel = false;

  attendanceFormStudents: AttendanceFormStudent[] = [];

  form = {
    offeringId: '',
    date: this.getTodayDate(),
    time: '',
  };

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.studentService.getStudents().subscribe((students) => {
      this.students = students;
      this.refreshView();
    });

    this.classOfferingService.getClassOfferings().subscribe((offerings) => {
      this.offerings = offerings;
      this.refreshView();
    });

    this.attendanceService.getSessions().subscribe((sessions) => {
      this.sessions = sessions;
      this.refreshView();
    });

    this.attendanceService.getRecords().subscribe((records) => {
      this.records = records;
      this.refreshView();
    });
  }

  refreshView(): void {
    this.applyFilters();
    this.loadAttendanceFormStudents();
  }

  get totalSessions(): number {
    return this.sessions.length;
  }

  get presentToday(): number {
    const today = this.getTodayDate();
    return this.buildViewRecords().filter(
      (record) => record.date === today && record.status === 'Present',
    ).length;
  }

  get lateToday(): number {
    const today = this.getTodayDate();
    return this.buildViewRecords().filter(
      (record) => record.date === today && record.status === 'Late',
    ).length;
  }

  get absentToday(): number {
    const today = this.getTodayDate();
    return this.buildViewRecords().filter(
      (record) => record.date === today && record.status === 'Absent',
    ).length;
  }

  getOfferingLabel(offeringId: string): string {
    const offering = this.offerings.find((o) => o.id === offeringId);
    if (!offering) return 'Unknown Offering';
    return `Offering #${offering.id} - Section ${offering.sectionId}`;
  }

  getOfferingStudents(offeringId: string): Student[] {
    const offering = this.offerings.find((o) => o.id === offeringId);
    if (!offering) return [];
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
      status: 'Present',
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
        record.date.toLowerCase().includes(keyword);

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
      date: this.getTodayDate(),
      time: '',
    };
    this.attendanceFormStudents = [];
  }

  onOfferingChange(): void {
    this.loadAttendanceFormStudents();
  }

  setStudentStatus(index: number, status: AttendanceStatus): void {
    this.attendanceFormStudents[index].status = status;
  }

  saveAttendance(): void {
    if (!this.form.offeringId || !this.form.date) {
      alert('Please complete the attendance form first.');
      return;
    }

    const newSession: AttendanceSessionModel = {
      offeringId: this.form.offeringId,
      date: this.form.date,
      qrCode: `SESSION-${this.form.offeringId}-${Date.now()}`,
      status: 'active',
    };

    this.attendanceService.createSession(newSession).subscribe((createdSession) => {
      const recordsToCreate = this.attendanceFormStudents.map((student) => {
        const newRecord: AttendanceRecordModel = {
          sessionId: createdSession.id ?? '',
          studentId: student.studentId,
          status: student.status,
          time: this.form.time ? this.formatTime(this.form.time) : '',
        };

        return this.attendanceService.createRecord(newRecord);
      });

      if (recordsToCreate.length === 0) {
        this.loadData();
        this.closeAttendancePanel();
        this.resetAttendanceForm();
        return;
      }

      let completed = 0;

      recordsToCreate.forEach((request) => {
        request.subscribe(() => {
          completed++;

          if (completed === recordsToCreate.length) {
            this.loadData();
            this.closeAttendancePanel();
            this.resetAttendanceForm();
            alert('Attendance saved successfully!');
          }
        });
      });
    });
  }

  editRecord(record: AttendanceViewRecord): void {
    const newStatus = prompt(
      `Update status for ${record.studentName}\nEnter: Present, Late, Absent, or Excused`,
      record.status,
    ) as AttendanceStatus | null;

    if (!newStatus) return;

    const validStatuses: AttendanceStatus[] = ['Present', 'Late', 'Absent', 'Excused'];
    if (!validStatuses.includes(newStatus)) {
      alert('Invalid status entered.');
      return;
    }

    this.attendanceService.updateRecord(record.id ?? '', { status: newStatus }).subscribe(() => {
      this.loadData();
    });
  }

  deleteRecord(id?: string): void {
    if (!id) return;

    const confirmed = confirm('Are you sure you want to delete this attendance record?');
    if (!confirmed) return;

    this.attendanceService.deleteRecord(id).subscribe(() => {
      this.loadData();
    });
  }

  private buildViewRecords(): AttendanceViewRecord[] {
    return this.records.map((record) => {
      const session = this.sessions.find((s) => s.id === record.sessionId);

      return {
        id: record.id,
        sessionId: record.sessionId,
        studentId: record.studentId,
        studentName: this.getStudentName(record.studentId),
        studentNumber: this.getStudentNumber(record.studentId),
        offeringId: session?.offeringId ?? '',
        offeringLabel: this.getOfferingLabel(session?.offeringId ?? ''),
        date: session?.date ?? '',
        time: record.time ?? '',
        status: record.status,
      };
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

  private formatTime(time24: string): string {
    const [hours, minutes] = time24.split(':').map(Number);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${minutes.toString().padStart(2, '0')} ${suffix}`;
  }
}
