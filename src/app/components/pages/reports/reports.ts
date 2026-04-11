import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { ReportService } from '../../../services/report.service';

interface AttendanceSummaryRow {
  subject: string;
  section: string;
  teacher: string;
  totalStudents: number;
  totalSessions: number;
  presentRate: number;
  absentRate: number;
  lateRate: number;
}

interface StudentRiskRow {
  studentName: string;
  studentNo: string;
  section: string;
  absences: number;
  lates: number;
  attendanceRate: number;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class ReportsComponent implements OnInit {
  private authService = inject(AuthService);
  private reportService = inject(ReportService);

  currentUser: any = null;
  currentRole = '';

  selectedSection = '';
  selectedSubject = '';
  selectedMonth = '';
  searchTerm = '';

  isLoading = false;

  totalStudents = 0;
  totalAttendanceSessions = 0;
  overallAttendanceRate = 0;
  totalAbsences = 0;

  sections: string[] = ['BSIT 1A', 'BSIT 1B', 'BSIT 2A', 'BSIT 2B', 'BSIT 3A'];
  subjects: string[] = [
    'Programming 1',
    'Programming 2',
    'Database Systems',
    'Web Development',
    'Human Computer Interaction',
  ];

  attendanceSummary: AttendanceSummaryRow[] = [
    {
      subject: 'Web Development',
      section: 'BSIT 2A',
      teacher: 'Mr. Cruz',
      totalStudents: 42,
      totalSessions: 18,
      presentRate: 91,
      absentRate: 5,
      lateRate: 4,
    },
    {
      subject: 'Database Systems',
      section: 'BSIT 2B',
      teacher: 'Ms. Santos',
      totalStudents: 39,
      totalSessions: 16,
      presentRate: 88,
      absentRate: 7,
      lateRate: 5,
    },
    {
      subject: 'Human Computer Interaction',
      section: 'BSIT 3A',
      teacher: 'Mrs. Ramos',
      totalStudents: 36,
      totalSessions: 14,
      presentRate: 93,
      absentRate: 3,
      lateRate: 4,
    },
    {
      subject: 'Programming 2',
      section: 'BSIT 1A',
      teacher: 'Mr. Villanueva',
      totalStudents: 45,
      totalSessions: 20,
      presentRate: 86,
      absentRate: 9,
      lateRate: 5,
    },
  ];

  filteredAttendanceSummary: AttendanceSummaryRow[] = [];

  studentRisks: StudentRiskRow[] = [
    {
      studentName: 'John Michael Reyes',
      studentNo: '2023-00124',
      section: 'BSIT 2A',
      absences: 6,
      lates: 3,
      attendanceRate: 78,
    },
    {
      studentName: 'Angelica Dela Cruz',
      studentNo: '2023-00125',
      section: 'BSIT 2B',
      absences: 5,
      lates: 4,
      attendanceRate: 80,
    },
    {
      studentName: 'Kevin Santos',
      studentNo: '2023-00126',
      section: 'BSIT 1A',
      absences: 7,
      lates: 2,
      attendanceRate: 74,
    },
    {
      studentName: 'Maria Lopez',
      studentNo: '2023-00127',
      section: 'BSIT 3A',
      absences: 4,
      lates: 5,
      attendanceRate: 82,
    },
  ];

  filteredStudentRisks: StudentRiskRow[] = [];

  get canExportReports(): boolean {
    return this.currentRole === 'admin';
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser?.() || null;
    this.currentRole = this.currentUser?.role || '';
    this.filteredAttendanceSummary = [...this.attendanceSummary];
    this.filteredStudentRisks = [...this.studentRisks];
    this.computeStats();
  }

  applyFilters(): void {
    const search = this.searchTerm.toLowerCase().trim();

    this.filteredAttendanceSummary = this.attendanceSummary.filter((item) => {
      const matchesSection = !this.selectedSection || item.section === this.selectedSection;

      const matchesSubject = !this.selectedSubject || item.subject === this.selectedSubject;

      const matchesSearch =
        !search ||
        item.subject.toLowerCase().includes(search) ||
        item.section.toLowerCase().includes(search) ||
        item.teacher.toLowerCase().includes(search);

      return matchesSection && matchesSubject && matchesSearch;
    });

    this.filteredStudentRisks = this.studentRisks.filter((item) => {
      const matchesSection = !this.selectedSection || item.section === this.selectedSection;

      const matchesSearch =
        !search ||
        item.studentName.toLowerCase().includes(search) ||
        item.studentNo.toLowerCase().includes(search) ||
        item.section.toLowerCase().includes(search);

      return matchesSection && matchesSearch;
    });

    this.computeStats();
  }

  resetFilters(): void {
    this.selectedSection = '';
    this.selectedSubject = '';
    this.selectedMonth = '';
    this.searchTerm = '';
    this.filteredAttendanceSummary = [...this.attendanceSummary];
    this.filteredStudentRisks = [...this.studentRisks];
    this.computeStats();
  }

  computeStats(): void {
    const rows = this.filteredAttendanceSummary;

    this.totalStudents = rows.reduce((sum, row) => sum + row.totalStudents, 0);
    this.totalAttendanceSessions = rows.reduce((sum, row) => sum + row.totalSessions, 0);
    this.totalAbsences = rows.reduce(
      (sum, row) =>
        sum + Math.round((row.totalStudents * row.totalSessions * row.absentRate) / 100),
      0,
    );

    if (rows.length > 0) {
      this.overallAttendanceRate = Math.round(
        rows.reduce((sum, row) => sum + row.presentRate, 0) / rows.length,
      );
    } else {
      this.overallAttendanceRate = 0;
    }
  }

  exportPdf(): void {
    alert('Export PDF clicked. You can connect this to your report service.');
  }

  exportExcel(): void {
    alert('Export Excel clicked. You can connect this to your report service.');
  }

  generateReport(): void {
    alert('Generate report clicked. Connect this to your backend or json-server logic.');
  }

  getRateClass(rate: number): string {
    if (rate >= 90) return 'excellent';
    if (rate >= 80) return 'good';
    if (rate >= 70) return 'warning';
    return 'danger';
  }
}
