import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';
import * as XLSX from 'xlsx';

import { AuthService } from '../../../services/auth.service';
import { ApiService } from '../../../services/api.service';

interface AttendanceSummaryRow {
  subject: string;
  section: string;
  teacher: string;
  totalStudents: number;
  totalSessions: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
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
  excused: number;
  totalRecords: number;
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
  private readonly authService = inject(AuthService);
  private readonly apiService = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  currentUser: any = null;
  currentRole = '';

  selectedSection = '';
  selectedSubject = '';
  selectedMonth = '';
  searchTerm = '';

  isLoading = false;
  errorMessage = '';

  totalStudents = 0;
  totalAttendanceSessions = 0;
  overallAttendanceRate = 0;
  totalAbsences = 0;

  sections: string[] = [];
  subjects: string[] = [];

  attendanceSummary: AttendanceSummaryRow[] = [];
  filteredAttendanceSummary: AttendanceSummaryRow[] = [];

  studentRisks: StudentRiskRow[] = [];
  filteredStudentRisks: StudentRiskRow[] = [];

  private students: any[] = [];
  private teachers: any[] = [];
  private sectionsData: any[] = [];
  private subjectsData: any[] = [];
  private offerings: any[] = [];
  private sessions: any[] = [];
  private attendance: any[] = [];

  get canExportReports(): boolean {
    return this.currentRole === 'admin';
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser?.() || null;
    this.currentRole = this.authService.getUserRole?.() || this.currentUser?.role || '';
    this.loadReports();
  }

  loadReports(): void {
    this.zone.run(() => {
      this.isLoading = true;
      this.errorMessage = '';
      this.cdr.detectChanges();
    });

    forkJoin({
      students: this.apiService.getStudents().pipe(take(1)),
      teachers: this.apiService.getTeachers().pipe(take(1)),
      sections: this.apiService.getSections().pipe(take(1)),
      subjects: this.apiService.getSubjects().pipe(take(1)),
      offerings: this.apiService.getClassOfferings().pipe(take(1)),
      sessions: this.apiService.getSessions().pipe(take(1)),
      attendance: this.apiService.getAttendance().pipe(take(1)),
    }).subscribe({
      next: ({ students, teachers, sections, subjects, offerings, sessions, attendance }) => {
        this.zone.run(() => {
          this.students = students || [];
          this.teachers = teachers || [];
          this.sectionsData = sections || [];
          this.subjectsData = subjects || [];
          this.offerings = offerings || [];
          this.sessions = sessions || [];
          this.attendance = attendance || [];

          this.sections = this.sectionsData
            .map((section: any) => this.getSectionLabel(section))
            .filter(Boolean)
            .sort();

          this.subjects = this.subjectsData
            .map((subject: any) => this.getSubjectLabel(subject))
            .filter(Boolean)
            .sort();

          this.buildReports();
          this.applyFilters(false);

          this.isLoading = false;
          this.cdr.detectChanges();
        });
      },
      error: (error) => {
        this.zone.run(() => {
          console.error('REPORTS LOAD ERROR:', error);
          this.errorMessage = 'Unable to load reports data from the database.';
          this.isLoading = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  applyFilters(shouldDetect = true): void {
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

    if (shouldDetect) {
      this.cdr.detectChanges();
    }
  }

  resetFilters(): void {
    this.selectedSection = '';
    this.selectedSubject = '';
    this.selectedMonth = '';
    this.searchTerm = '';
    this.buildReports();
    this.applyFilters();
  }

  onMonthChange(): void {
    this.buildReports();
    this.applyFilters();
  }

  computeStats(): void {
    const visibleRows = this.filteredAttendanceSummary;

    const coveredStudentIds = new Set<string>();
    const coveredSessionIds = new Set<string>();

    const visibleSubjectSectionPairs = visibleRows.map(
      (row) => `${row.subject}---${row.section}---${row.teacher}`,
    );

    const monthFilteredAttendance = this.getMonthFilteredAttendance();

    monthFilteredAttendance.forEach((record: any) => {
      const session = this.sessions.find(
        (item: any) => String(item.id) === String(record.sessionId),
      );

      const offering = this.findOfferingBySession(session);

      if (!session || !offering) return;

      const subject = this.getSubjectLabelByOffering(offering);
      const section = this.getSectionLabelByOffering(offering);
      const teacher = this.getTeacherLabelByOffering(offering);

      const pair = `${subject}---${section}---${teacher}`;

      if (visibleSubjectSectionPairs.includes(pair)) {
        coveredStudentIds.add(String(record.studentId));
        coveredSessionIds.add(String(record.sessionId));
      }
    });

    const presentCount = monthFilteredAttendance.filter((record: any) =>
      this.isVisibleRecord(record, visibleRows, 'present'),
    ).length;

    const lateCount = monthFilteredAttendance.filter((record: any) =>
      this.isVisibleRecord(record, visibleRows, 'late'),
    ).length;

    const excusedCount = monthFilteredAttendance.filter((record: any) =>
      this.isVisibleRecord(record, visibleRows, 'excused'),
    ).length;

    const absentCount = monthFilteredAttendance.filter((record: any) =>
      this.isVisibleRecord(record, visibleRows, 'absent'),
    ).length;

    const totalValidRecords = presentCount + lateCount + absentCount + excusedCount;

    this.totalStudents = coveredStudentIds.size;
    this.totalAttendanceSessions = coveredSessionIds.size;
    this.totalAbsences = absentCount;

    this.overallAttendanceRate =
      totalValidRecords === 0
        ? 0
        : Math.round(((presentCount + lateCount + excusedCount) / totalValidRecords) * 100);
  }

  exportPdf(): void {
    const reportWindow = window.open('', '_blank', 'width=1200,height=900');

    if (!reportWindow) {
      alert('Please allow pop-ups to export the PDF report.');
      return;
    }

    const generatedDate = new Date().toLocaleString();
    const preparedBy =
      `${this.currentUser?.firstName || ''} ${this.currentUser?.lastName || ''}`.trim() || 'Admin';

    const classRows = this.filteredAttendanceSummary
      .map(
        (row) => `
          <tr>
            <td>${this.escapeHtml(row.subject)}</td>
            <td>${this.escapeHtml(row.section)}</td>
            <td>${this.escapeHtml(row.teacher)}</td>
            <td>${row.totalStudents}</td>
            <td>${row.totalSessions}</td>
            <td>${row.presentCount}</td>
            <td>${row.lateCount}</td>
            <td>${row.absentCount}</td>
            <td>${row.excusedCount}</td>
            <td>${row.presentRate}%</td>
          </tr>
        `,
      )
      .join('');

    const riskRows = this.filteredStudentRisks
      .map(
        (row) => `
          <tr>
            <td>${this.escapeHtml(row.studentName)}</td>
            <td>${this.escapeHtml(row.studentNo)}</td>
            <td>${this.escapeHtml(row.section)}</td>
            <td>${row.absences}</td>
            <td>${row.lates}</td>
            <td>${row.excused}</td>
            <td>${row.totalRecords}</td>
            <td>${row.attendanceRate}%</td>
          </tr>
        `,
      )
      .join('');

    reportWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>SAMS Attendance Report</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 32px;
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
              background: #ffffff;
            }
            .report-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 3px solid #1d4ed8;
              padding-bottom: 18px;
              margin-bottom: 22px;
            }
            .brand h1 {
              margin: 0;
              font-size: 28px;
              color: #1e3a8a;
              letter-spacing: 0.04em;
            }
            .brand p {
              margin: 4px 0 0;
              font-size: 13px;
              color: #475569;
            }
            .report-title { text-align: right; }
            .report-title h2 {
              margin: 0;
              font-size: 24px;
              color: #111827;
            }
            .report-title p {
              margin: 5px 0 0;
              font-size: 12px;
              color: #64748b;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 12px;
              margin-bottom: 22px;
            }
            .meta-card {
              border: 1px solid #dbe3ef;
              border-radius: 12px;
              padding: 12px;
              background: #f8fafc;
            }
            .meta-card span {
              display: block;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              color: #64748b;
              font-weight: 700;
            }
            .meta-card strong {
              display: block;
              margin-top: 6px;
              font-size: 22px;
              color: #111827;
            }
            .filters {
              margin-bottom: 22px;
              padding: 12px;
              border: 1px solid #dbe3ef;
              border-radius: 12px;
              background: #ffffff;
              font-size: 12px;
              color: #475569;
            }
            .section { margin-top: 24px; }
            .section h3 {
              margin: 0 0 10px;
              font-size: 17px;
              color: #111827;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 11.5px;
            }
            th {
              background: #1e3a8a;
              color: #ffffff;
              padding: 9px 8px;
              text-align: left;
              border: 1px solid #1e3a8a;
            }
            td {
              padding: 8px;
              border: 1px solid #dbe3ef;
              vertical-align: top;
            }
            tr:nth-child(even) td { background: #f8fafc; }
            .empty {
              padding: 14px;
              border: 1px solid #dbe3ef;
              border-radius: 10px;
              color: #64748b;
              background: #f8fafc;
            }
            .footer {
              margin-top: 34px;
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 48px;
              font-size: 12px;
            }
            .signature-line {
              margin-top: 42px;
              border-top: 1px solid #111827;
              padding-top: 6px;
              text-align: center;
            }
            @media print {
              body { padding: 18mm; }
              button { display: none; }
              .section { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="report-header">
            <div class="brand">
              <h1>SAMS</h1>
              <p>Student Attendance Monitoring System</p>
              <p>Attendance Monitoring Report</p>
            </div>
            <div class="report-title">
              <h2>Attendance Summary Report</h2>
              <p>Generated: ${this.escapeHtml(generatedDate)}</p>
              <p>Prepared by: ${this.escapeHtml(preparedBy)}</p>
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-card"><span>Students Covered</span><strong>${this.totalStudents}</strong></div>
            <div class="meta-card"><span>Sessions</span><strong>${this.totalAttendanceSessions}</strong></div>
            <div class="meta-card"><span>Attendance Rate</span><strong>${this.overallAttendanceRate}%</strong></div>
            <div class="meta-card"><span>Total Absences</span><strong>${this.totalAbsences}</strong></div>
          </div>

          <div class="filters">
            <strong>Applied Filters:</strong>
            Section: ${this.escapeHtml(this.selectedSection || 'All')} |
            Subject: ${this.escapeHtml(this.selectedSubject || 'All')} |
            Month: ${this.escapeHtml(this.selectedMonth || 'All')} |
            Search: ${this.escapeHtml(this.searchTerm || 'None')}
          </div>

          <div class="section">
            <h3>Attendance Summary by Class</h3>
            ${
              classRows
                ? `
                  <table>
                    <thead>
                      <tr>
                        <th>Subject</th><th>Section</th><th>Teacher</th><th>Students</th>
                        <th>Sessions</th><th>Present</th><th>Late</th><th>Absent</th>
                        <th>Excused</th><th>Rate</th>
                      </tr>
                    </thead>
                    <tbody>${classRows}</tbody>
                  </table>
                `
                : `<div class="empty">No class summary records available.</div>`
            }
          </div>

          <div class="section">
            <h3>Students With Attendance Concerns</h3>
            ${
              riskRows
                ? `
                  <table>
                    <thead>
                      <tr>
                        <th>Student</th><th>Student No.</th><th>Section</th><th>Absences</th>
                        <th>Lates</th><th>Excused</th><th>Total Records</th><th>Rate</th>
                      </tr>
                    </thead>
                    <tbody>${riskRows}</tbody>
                  </table>
                `
                : `<div class="empty">No attendance concern records available.</div>`
            }
          </div>

          <div class="footer">
            <div><div class="signature-line">Prepared By</div></div>
            <div><div class="signature-line">Reviewed / Approved By</div></div>
          </div>

          <script>
            window.onload = function () { window.print(); };
          </script>
        </body>
      </html>
    `);

    reportWindow.document.close();
  }

  exportExcel(): void {
    const generatedDate = new Date().toLocaleString();
    const preparedBy =
      `${this.currentUser?.firstName || ''} ${this.currentUser?.lastName || ''}`.trim() || 'Admin';

    const summarySheetData = [
      ['SAMS - Student Attendance Monitoring System'],
      ['Attendance Summary Report'],
      [],
      ['Generated Date', generatedDate],
      ['Prepared By', preparedBy],
      ['Section Filter', this.selectedSection || 'All'],
      ['Subject Filter', this.selectedSubject || 'All'],
      ['Month Filter', this.selectedMonth || 'All'],
      ['Search Filter', this.searchTerm || 'None'],
      [],
      ['Total Students Covered', this.totalStudents],
      ['Attendance Sessions', this.totalAttendanceSessions],
      ['Overall Attendance Rate', `${this.overallAttendanceRate}%`],
      ['Total Absences', this.totalAbsences],
    ];

    const classSummaryData = [
      [
        'Subject',
        'Section',
        'Teacher',
        'Total Students',
        'Total Sessions',
        'Present Count',
        'Late Count',
        'Absent Count',
        'Excused Count',
        'Attendance Rate',
        'Absent Rate',
        'Late Rate',
      ],
      ...this.filteredAttendanceSummary.map((row) => [
        row.subject,
        row.section,
        row.teacher,
        row.totalStudents,
        row.totalSessions,
        row.presentCount,
        row.lateCount,
        row.absentCount,
        row.excusedCount,
        `${row.presentRate}%`,
        `${row.absentRate}%`,
        `${row.lateRate}%`,
      ]),
    ];

    const studentConcernData = [
      [
        'Student Name',
        'Student Number',
        'Section',
        'Absences',
        'Lates',
        'Excused',
        'Total Records',
        'Attendance Rate',
      ],
      ...this.filteredStudentRisks.map((row) => [
        row.studentName,
        row.studentNo,
        row.section,
        row.absences,
        row.lates,
        row.excused,
        row.totalRecords,
        `${row.attendanceRate}%`,
      ]),
    ];

    const workbook = XLSX.utils.book_new();

    const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetData);
    const classSheet = XLSX.utils.aoa_to_sheet(classSummaryData);
    const riskSheet = XLSX.utils.aoa_to_sheet(studentConcernData);

    summarySheet['!cols'] = [{ wch: 28 }, { wch: 32 }];
    classSheet['!cols'] = [
      { wch: 20 },
      { wch: 16 },
      { wch: 24 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 12 },
      { wch: 13 },
      { wch: 14 },
      { wch: 16 },
      { wch: 13 },
      { wch: 12 },
    ];
    riskSheet['!cols'] = [
      { wch: 28 },
      { wch: 18 },
      { wch: 16 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 14 },
      { wch: 16 },
    ];

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Report Summary');
    XLSX.utils.book_append_sheet(workbook, classSheet, 'Class Attendance');
    XLSX.utils.book_append_sheet(workbook, riskSheet, 'Student Concerns');

    const fileDate = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `SAMS_Attendance_Report_${fileDate}.xlsx`);
  }

  generateReport(): void {
    this.loadReports();
  }

  getRateClass(rate: number): string {
    if (rate >= 90) return 'excellent';
    if (rate >= 80) return 'good';
    if (rate >= 70) return 'warning';
    return 'danger';
  }

  private buildReports(): void {
    const monthAttendance = this.getMonthFilteredAttendance();

    this.attendanceSummary = this.offerings.map((offering: any) => {
      const offeringSessions = this.sessions.filter((session: any) => {
        const sessionOfferingId = String(session.classOfferingId || session.offeringId || '');
        return sessionOfferingId === String(offering.id);
      });

      const offeringSessionIds = offeringSessions.map((session: any) => String(session.id));

      const records = monthAttendance.filter((record: any) =>
        offeringSessionIds.includes(String(record.sessionId)),
      );

      const presentCount = this.countStatus(records, 'present');
      const lateCount = this.countStatus(records, 'late');
      const absentCount = this.countStatus(records, 'absent');
      const excusedCount = this.countStatus(records, 'excused');

      const totalRecords = presentCount + lateCount + absentCount + excusedCount;

      return {
        subject: this.getSubjectLabelByOffering(offering),
        section: this.getSectionLabelByOffering(offering),
        teacher: this.getTeacherLabelByOffering(offering),
        totalStudents: this.students.filter(
          (student: any) => String(student.sectionId || '') === String(offering.sectionId || ''),
        ).length,
        totalSessions: offeringSessions.length,
        presentCount,
        lateCount,
        absentCount,
        excusedCount,
        presentRate: this.getRate(presentCount + lateCount + excusedCount, totalRecords),
        absentRate: this.getRate(absentCount, totalRecords),
        lateRate: this.getRate(lateCount, totalRecords),
      };
    });

    this.attendanceSummary = this.attendanceSummary.filter(
      (row) => row.totalSessions > 0 || row.totalStudents > 0,
    );

    this.studentRisks = this.students
      .map((student: any) => {
        const records = monthAttendance.filter(
          (record: any) => String(record.studentId) === String(student.id),
        );

        const presentCount = this.countStatus(records, 'present');
        const lateCount = this.countStatus(records, 'late');
        const absentCount = this.countStatus(records, 'absent');
        const excusedCount = this.countStatus(records, 'excused');

        const totalRecords = presentCount + lateCount + absentCount + excusedCount;

        return {
          studentName: this.getStudentName(student),
          studentNo: student.studentNumber || 'No student number',
          section: this.getSectionLabelByStudent(student),
          absences: absentCount,
          lates: lateCount,
          excused: excusedCount,
          totalRecords,
          attendanceRate: this.getRate(presentCount + lateCount + excusedCount, totalRecords),
        };
      })
      .filter(
        (row) =>
          row.totalRecords > 0 && (row.absences > 0 || row.lates > 0 || row.attendanceRate < 85),
      )
      .sort((a, b) => {
        if (b.absences !== a.absences) return b.absences - a.absences;
        if (b.lates !== a.lates) return b.lates - a.lates;
        return a.attendanceRate - b.attendanceRate;
      });
  }

  private getMonthFilteredAttendance(): any[] {
    if (!this.selectedMonth) {
      return this.attendance;
    }

    return this.attendance.filter((record: any) => {
      const session = this.sessions.find(
        (item: any) => String(item.id) === String(record.sessionId),
      );

      const value = record.timeRecorded || record.time || record.timestamp || session?.date || '';

      return String(value).startsWith(this.selectedMonth);
    });
  }

  private isVisibleRecord(
    record: any,
    visibleRows: AttendanceSummaryRow[],
    status: string,
  ): boolean {
    if (String(record.status || '').toLowerCase() !== status) {
      return false;
    }

    const session = this.sessions.find((item: any) => String(item.id) === String(record.sessionId));

    const offering = this.findOfferingBySession(session);

    if (!session || !offering) return false;

    const subject = this.getSubjectLabelByOffering(offering);
    const section = this.getSectionLabelByOffering(offering);
    const teacher = this.getTeacherLabelByOffering(offering);

    return visibleRows.some(
      (row) => row.subject === subject && row.section === section && row.teacher === teacher,
    );
  }

  private findOfferingBySession(session: any): any | null {
    if (!session) return null;

    const offeringId = session.classOfferingId || session.offeringId || '';

    return (
      this.offerings.find((offering: any) => String(offering.id) === String(offeringId)) || null
    );
  }

  private countStatus(records: any[], status: string): number {
    return records.filter(
      (record: any) => String(record.status || '').toLowerCase() === status.toLowerCase(),
    ).length;
  }

  private getRate(part: number, total: number): number {
    if (!total) return 0;
    return Math.round((part / total) * 100);
  }

  private getStudentName(student: any): string {
    return `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || 'Student';
  }

  private getTeacherLabelByOffering(offering: any): string {
    const teacher = this.teachers.find(
      (item: any) => String(item.id) === String(offering.teacherId || offering.instructorId || ''),
    );

    if (!teacher) return 'No teacher assigned';

    return `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || 'Teacher';
  }

  private getSectionLabelByOffering(offering: any): string {
    const section = this.sectionsData.find(
      (item: any) => String(item.id) === String(offering.sectionId || ''),
    );

    return this.getSectionLabel(section);
  }

  private getSectionLabelByStudent(student: any): string {
    const section = this.sectionsData.find(
      (item: any) => String(item.id) === String(student.sectionId || ''),
    );

    return this.getSectionLabel(section);
  }

  private getSectionLabel(section: any): string {
    if (!section) return 'No section';
    return section.sectionName || section.name || section.code || 'No section';
  }

  private getSubjectLabelByOffering(offering: any): string {
    if (offering.subjectCode || offering.subjectName) {
      return offering.subjectCode || offering.subjectName;
    }

    const subject = this.subjectsData.find(
      (item: any) => String(item.id) === String(offering.subjectId || ''),
    );

    return this.getSubjectLabel(subject);
  }

  private getSubjectLabel(subject: any): string {
    if (!subject) return 'No subject';
    return subject.subjectCode || subject.subjectName || subject.name || 'No subject';
  }

  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
