import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AttendanceService } from '../../../services/attendance.service';
import { AttendanceRecord } from '../../../models/attendance-record.model';

type Status = 'present' | 'late' | 'absent' | 'excused';

@Component({
  selector: 'app-student-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './student-attendance.html',
  styleUrl: './student-attendance.scss',
})
export class StudentAttendanceComponent implements OnInit {
  private attendanceService = inject(AttendanceService);

  // ⚠️ replace later with auth user
  studentId = 'student-001';

  sessionCode = '';
  loading = false;
  message = '';
  error = '';

  records: AttendanceRecord[] = [];

  ngOnInit(): void {
    this.loadHistory();
  }

  submitAttendance(): void {
    if (!this.sessionCode.trim()) {
      this.error = 'Please enter a session code.';
      return;
    }

    this.loading = true;
    this.message = '';
    this.error = '';

    this.attendanceService.submitViaCode(this.sessionCode.trim(), this.studentId).subscribe({
      next: () => {
        this.message = '✅ Attendance recorded successfully!';
        this.sessionCode = '';
        this.loadHistory();
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to record attendance.';
        this.loading = false;
      },
    });
  }

  loadHistory(): void {
    this.attendanceService.getRecordsByStudent(this.studentId).subscribe((records) => {
      this.records = records.sort((a, b) =>
        (b.timeRecorded || '').localeCompare(a.timeRecorded || ''),
      );
    });
  }

  getStatusLabel(status: Status): string {
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
}
