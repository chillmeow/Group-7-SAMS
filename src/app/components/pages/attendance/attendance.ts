import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface AttendanceRecord {
  id: number;
  studentName: string;
  studentNo: string;
  offering: string;
  date: string;
  time: string;
  status: 'Present' | 'Late' | 'Absent' | 'Excused';
  markedBy: string;
}

interface AttendanceFormStudent {
  name: string;
  studentNo: string;
  status: 'Present' | 'Late' | 'Absent' | 'Excused';
}

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './attendance.html',
  styleUrl: './attendance.scss'
})
export class AttendanceComponent {
  searchTerm = '';
  selectedOffering = '';
  selectedStatus = '';
  selectedDate = '';

  showAttendancePanel = false;

  classOfferings: string[] = [
    'Web Development - BSIT 2A',
    'Database Systems - BSIT 2B',
    'Human Computer Interaction - BSIT 3A',
    'Programming 2 - BSIT 1A'
  ];

  records: AttendanceRecord[] = [
    {
      id: 1,
      studentName: 'John Michael Reyes',
      studentNo: '2023-00124',
      offering: 'Web Development - BSIT 2A',
      date: '2026-03-11',
      time: '08:00 AM',
      status: 'Present',
      markedBy: 'Admin'
    },
    {
      id: 2,
      studentName: 'Angelica Dela Cruz',
      studentNo: '2023-00125',
      offering: 'Web Development - BSIT 2A',
      date: '2026-03-11',
      time: '08:00 AM',
      status: 'Late',
      markedBy: 'Admin'
    },
    {
      id: 3,
      studentName: 'Kevin Santos',
      studentNo: '2023-00126',
      offering: 'Database Systems - BSIT 2B',
      date: '2026-03-11',
      time: '10:00 AM',
      status: 'Absent',
      markedBy: 'Admin'
    },
    {
      id: 4,
      studentName: 'Maria Lopez',
      studentNo: '2023-00127',
      offering: 'Programming 2 - BSIT 1A',
      date: '2026-03-10',
      time: '01:00 PM',
      status: 'Excused',
      markedBy: 'Admin'
    }
  ];

  filteredRecords: AttendanceRecord[] = [...this.records];

  attendanceFormStudents: AttendanceFormStudent[] = [
    { name: 'John Michael Reyes', studentNo: '2023-00124', status: 'Present' },
    { name: 'Angelica Dela Cruz', studentNo: '2023-00125', status: 'Present' },
    { name: 'Kevin Santos', studentNo: '2023-00126', status: 'Present' },
    { name: 'Maria Lopez', studentNo: '2023-00127', status: 'Present' }
  ];

  form = {
    offering: '',
    date: this.getTodayDate(),
    time: '',
    instructor: ''
  };

  get totalSessions(): number {
    const uniqueSessions = new Set(
      this.records.map(record => `${record.offering}-${record.date}-${record.time}`)
    );
    return uniqueSessions.size;
  }

  get presentToday(): number {
    const today = this.getTodayDate();
    return this.records.filter(
      record => record.date === today && record.status === 'Present'
    ).length;
  }

  get lateToday(): number {
    const today = this.getTodayDate();
    return this.records.filter(
      record => record.date === today && record.status === 'Late'
    ).length;
  }

  get absentToday(): number {
    const today = this.getTodayDate();
    return this.records.filter(
      record => record.date === today && record.status === 'Absent'
    ).length;
  }

  applyFilters(): void {
    this.filteredRecords = this.records.filter(record => {
      const matchesSearch =
        !this.searchTerm ||
        record.studentName.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        record.studentNo.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        record.offering.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        record.date.toLowerCase().includes(this.searchTerm.toLowerCase());

      const matchesOffering =
        !this.selectedOffering || record.offering === this.selectedOffering;

      const matchesStatus =
        !this.selectedStatus || record.status === this.selectedStatus;

      const matchesDate =
        !this.selectedDate || record.date === this.selectedDate;

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
  }

  closeAttendancePanel(): void {
    this.showAttendancePanel = false;
  }

  resetAttendanceForm(): void {
    this.form = {
      offering: '',
      date: this.getTodayDate(),
      time: '',
      instructor: ''
    };

    this.attendanceFormStudents = this.attendanceFormStudents.map(student => ({
      ...student,
      status: 'Present'
    }));
  }

  setStudentStatus(
    index: number,
    status: 'Present' | 'Late' | 'Absent' | 'Excused'
  ): void {
    this.attendanceFormStudents[index].status = status;
  }

  saveAttendance(): void {
    if (!this.form.offering || !this.form.date || !this.form.time || !this.form.instructor) {
      alert('Please complete the attendance form first.');
      return;
    }

    const newRecords: AttendanceRecord[] = this.attendanceFormStudents.map((student, index) => ({
      id: Date.now() + index,
      studentName: student.name,
      studentNo: student.studentNo,
      offering: this.form.offering,
      date: this.form.date,
      time: this.formatTime(this.form.time),
      status: student.status,
      markedBy: 'Admin'
    }));

    this.records = [...newRecords, ...this.records];
    this.applyFilters();
    this.closeAttendancePanel();
    this.resetAttendanceForm();

    alert('Attendance saved successfully!');
  }

  editRecord(record: AttendanceRecord): void {
    const newStatus = prompt(
      `Update status for ${record.studentName}\nEnter: Present, Late, Absent, or Excused`,
      record.status
    ) as 'Present' | 'Late' | 'Absent' | 'Excused' | null;

    if (!newStatus) return;

    const validStatuses = ['Present', 'Late', 'Absent', 'Excused'];
    if (!validStatuses.includes(newStatus)) {
      alert('Invalid status entered.');
      return;
    }

    this.records = this.records.map(item =>
      item.id === record.id ? { ...item, status: newStatus } : item
    );

    this.applyFilters();
  }

  deleteRecord(id: number): void {
    const confirmed = confirm('Are you sure you want to delete this attendance record?');
    if (!confirmed) return;

    this.records = this.records.filter(record => record.id !== id);
    this.applyFilters();
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