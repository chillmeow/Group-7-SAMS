import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, from, of } from 'rxjs';
import { catchError, take } from 'rxjs/operators';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';

import { db } from '../../../firebase.config';
import { AuthService } from '../../../services/auth.service';
import { ApiService } from '../../../services/api.service';

type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';
type ReportRecordView = 'active' | 'archived';
type GeneratedReportStatus = 'active' | 'archived';

interface AttendanceSummaryRow {
  program: string;
  subject: string;
  section: string;
  teacher: string;
  totalStudents: number;
  totalSessions: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  attendanceRate: number;
  absentRate: number;
  lateRate: number;
}

interface StudentConcernRow {
  studentName: string;
  studentNo: string;
  program: string;
  section: string;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  totalRecords: number;
  attendanceRate: number;
}

interface DetailedReportRow {
  recordId: string;
  sessionId: string;
  studentName: string;
  studentNo: string;
  program: string;
  section: string;
  subject: string;
  status: AttendanceStatus;
  method: string;
  timeRecorded: string;
  sessionDate: string;
  remarks: string;
  monthKey: string;
  monthLabel: string;
  year: string;
}

interface MonthGroup {
  monthKey: string;
  monthLabel: string;
  records: DetailedReportRow[];
}

interface FacultySessionGroup {
  sessionKey: string;
  sessionLabel: string;
  totalRecords: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  attendanceRate: number;
  records: DetailedReportRow[];
}

interface FacultyClassGroup {
  classKey: string;
  program: string;
  subject: string;
  section: string;
  totalRecords: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  attendanceRate: number;
  sessionGroups: FacultySessionGroup[];
}

interface FacultyMonthDirectoryGroup {
  monthKey: string;
  monthLabel: string;
  totalRecords: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  attendanceRate: number;
  classGroups: FacultyClassGroup[];
}

interface GeneratedFacultyReport {
  id?: string;
  title: string;
  periodLabel: string;
  filterLabel: string;
  generatedAt: string;
  generatedBy: string;
  generatedByUserId: string;
  generatedByEmail: string;
  generatedByRole: string;
  ownerKeys: string[];
  status: GeneratedReportStatus;
  isArchived?: boolean;
  archivedAt?: string;
  totalStudents: number;
  totalSessions: number;
  totalRecords: number;
  attendanceRate: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  selectedYear: string;
  selectedMonth: string;
  selectedProgram: string;
  selectedSubject: string;
  selectedSection: string;
  selectedStatus: string;
  classSummary: AttendanceSummaryRow[];
  studentConcerns: StudentConcernRow[];
  detailedRecordsPreview: DetailedReportRow[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface GeneratedFacultyReportGroup {
  label: string;
  reports: GeneratedFacultyReport[];
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

  private readonly generatedReportsCollectionName = 'facultyGeneratedReports';

  currentUser: any = null;
  currentRole = '';

  selectedProgram = '';
  selectedSubject = '';
  selectedSection = '';
  selectedStatus = '';
  selectedYear = '';
  selectedMonth = '';
  searchTerm = '';

  isLoading = false;
  isClearingRecords = false;
  isReportSaving = false;
  processingGeneratedReportId = '';
  errorMessage = '';
  successMessage = '';

  totalStudents = 0;
  totalAttendanceSessions = 0;
  overallAttendanceRate = 0;
  totalAbsences = 0;
  totalPresent = 0;
  totalLate = 0;
  totalExcused = 0;
  totalRecords = 0;

  programs: string[] = [];
  subjects: string[] = [];
  sections: string[] = [];
  years: string[] = [];

  months = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];

  attendanceSummary: AttendanceSummaryRow[] = [];
  filteredAttendanceSummary: AttendanceSummaryRow[] = [];

  studentConcerns: StudentConcernRow[] = [];
  filteredStudentConcerns: StudentConcernRow[] = [];

  detailedRecords: DetailedReportRow[] = [];
  filteredDetailedRecords: DetailedReportRow[] = [];
  groupedDetailedRecords: MonthGroup[] = [];
  reportDirectory: FacultyMonthDirectoryGroup[] = [];

  generatedReports: GeneratedFacultyReport[] = [];
  reportRecordView: ReportRecordView = 'active';
  reportRecordSearch = '';

  studentRisks: StudentConcernRow[] = [];
  filteredStudentRisks: StudentConcernRow[] = [];

  private students: any[] = [];
  private teachers: any[] = [];
  private sectionsData: any[] = [];
  private subjectsData: any[] = [];
  private offerings: any[] = [];
  private sessions: any[] = [];
  private attendance: any[] = [];

  private teacherOfferings: any[] = [];

  get canExportReports(): boolean {
    return !this.isLoading && this.filteredDetailedRecords.length > 0;
  }

  get canClearRecords(): boolean {
    return !this.isLoading && !this.isClearingRecords && this.filteredDetailedRecords.length > 0;
  }

  get selectedMonthLabel(): string {
    const month = this.months.find((item) => item.value === this.selectedMonth);
    return month?.label || 'All Months';
  }

  get reportPeriodLabel(): string {
    if (this.selectedYear && this.selectedMonth) {
      return `${this.selectedMonthLabel} ${this.selectedYear}`;
    }

    if (this.selectedYear) {
      return `Year ${this.selectedYear}`;
    }

    if (this.selectedMonth) {
      return `${this.selectedMonthLabel} - All Years`;
    }

    return 'All Available Records';
  }

  get activeFilterLabel(): string {
    const parts: string[] = [];

    if (this.selectedProgram) parts.push(this.selectedProgram);
    if (this.selectedSubject) parts.push(this.selectedSubject);
    if (this.selectedSection) parts.push(this.selectedSection);
    if (this.selectedStatus) parts.push(this.getStatusLabel(this.selectedStatus));

    return parts.length ? parts.join(' / ') : 'All handled classes';
  }

  get activeGeneratedReports(): GeneratedFacultyReport[] {
    return this.generatedReports.filter((report) => !this.isArchivedGeneratedReport(report));
  }

  get archivedGeneratedReports(): GeneratedFacultyReport[] {
    return this.generatedReports.filter((report) => this.isArchivedGeneratedReport(report));
  }

  get activeGeneratedReportsCount(): number {
    return this.activeGeneratedReports.length;
  }

  get archivedGeneratedReportsCount(): number {
    return this.archivedGeneratedReports.length;
  }

  get canGenerateReportRecord(): boolean {
    return !this.isLoading && !this.isReportSaving && this.filteredDetailedRecords.length > 0;
  }

  get visibleGeneratedReports(): GeneratedFacultyReport[] {
    const source =
      this.reportRecordView === 'archived'
        ? this.archivedGeneratedReports
        : this.activeGeneratedReports;
    const search = this.normalizeSearch(this.reportRecordSearch);

    if (!search) return source;

    return source.filter((report) =>
      this.normalizeSearch(
        [
          report.title,
          report.periodLabel,
          report.filterLabel,
          report.generatedBy,
          report.status,
          report.selectedProgram,
          report.selectedSubject,
          report.selectedSection,
        ].join(' '),
      ).includes(search),
    );
  }

  get generatedReportGroups(): GeneratedFacultyReportGroup[] {
    const groups = new Map<string, GeneratedFacultyReport[]>();

    this.visibleGeneratedReports.forEach((report) => {
      const label = this.getGeneratedReportGroupLabel(report);
      const existing = groups.get(label) || [];
      existing.push(report);
      groups.set(label, existing);
    });

    return Array.from(groups.entries()).map(([label, reports]) => ({
      label,
      reports: reports.sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt))),
    }));
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser?.() || null;
    this.currentRole = String(
      this.authService.getUserRole?.() || this.currentUser?.role || '',
    ).toLowerCase();

    this.loadReports();
  }

  loadReports(): void {
    this.zone.run(() => {
      this.isLoading = true;
      this.errorMessage = '';
      this.successMessage = '';
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
      generatedReports: from(this.fetchGeneratedReports()).pipe(
        catchError((error) => {
          console.error('FACULTY GENERATED REPORTS LOAD ERROR:', error);
          return of([] as GeneratedFacultyReport[]);
        }),
      ),
    }).subscribe({
      next: ({
        students,
        teachers,
        sections,
        subjects,
        offerings,
        sessions,
        attendance,
        generatedReports,
      }) => {
        this.zone.run(() => {
          this.students = students || [];
          this.teachers = teachers || [];
          this.sectionsData = sections || [];
          this.subjectsData = subjects || [];
          this.offerings = offerings || [];
          this.sessions = sessions || [];

          this.attendance = (attendance || []).filter((record: any) => record.isValid !== false);
          this.generatedReports = generatedReports || [];

          this.teacherOfferings = this.getVisibleFacultyOfferings();

          this.programs = Array.from(
            new Set(
              this.teacherOfferings
                .map((offering: any) => this.getProgramLabelByOffering(offering))
                .filter((program) => program && program !== 'No program'),
            ),
          ).sort();

          this.subjects = Array.from(
            new Set(
              this.teacherOfferings
                .map((offering: any) => this.getSubjectLabelByOffering(offering))
                .filter(Boolean),
            ),
          ).sort();

          this.sections = Array.from(
            new Set(
              this.teacherOfferings
                .map((offering: any) => this.getSectionLabelByOffering(offering))
                .filter(Boolean),
            ),
          ).sort();

          this.buildReports();
          this.years = this.buildAvailableYears();
          this.applyFilters(false);

          this.isLoading = false;
          this.cdr.detectChanges();
        });
      },
      error: (error) => {
        this.zone.run(() => {
          console.error('FACULTY REPORTS LOAD ERROR:', error);
          this.errorMessage = 'Unable to load faculty attendance report data.';
          this.isLoading = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  generateReport(): void {
    this.loadReports();
  }

  applyFilters(shouldDetect = true): void {
    const search = this.normalizeSearch(this.searchTerm);

    this.filteredDetailedRecords = this.detailedRecords.filter((row) => {
      const matchesProgram = !this.selectedProgram || row.program === this.selectedProgram;
      const matchesSubject = !this.selectedSubject || row.subject === this.selectedSubject;
      const matchesSection = !this.selectedSection || row.section === this.selectedSection;
      const matchesStatus = !this.selectedStatus || row.status === this.selectedStatus;
      const matchesYear = !this.selectedYear || row.year === this.selectedYear;
      const matchesMonth = !this.selectedMonth || row.monthKey.endsWith(`-${this.selectedMonth}`);

      const matchesSearch =
        !search ||
        this.normalizeSearch(row.studentName).includes(search) ||
        this.normalizeSearch(row.studentNo).includes(search) ||
        this.normalizeSearch(row.program).includes(search) ||
        this.normalizeSearch(row.section).includes(search) ||
        this.normalizeSearch(row.subject).includes(search) ||
        this.normalizeSearch(row.status).includes(search) ||
        this.normalizeSearch(row.method).includes(search) ||
        this.normalizeSearch(row.remarks).includes(search);

      return (
        matchesProgram &&
        matchesSubject &&
        matchesSection &&
        matchesStatus &&
        matchesYear &&
        matchesMonth &&
        matchesSearch
      );
    });

    this.filteredAttendanceSummary = this.attendanceSummary.filter((row) => {
      const matchesProgram = !this.selectedProgram || row.program === this.selectedProgram;
      const matchesSubject = !this.selectedSubject || row.subject === this.selectedSubject;
      const matchesSection = !this.selectedSection || row.section === this.selectedSection;

      const matchesSearch =
        !search ||
        this.normalizeSearch(row.program).includes(search) ||
        this.normalizeSearch(row.subject).includes(search) ||
        this.normalizeSearch(row.section).includes(search) ||
        this.normalizeSearch(row.teacher).includes(search);

      const hasVisibleRecords = this.filteredDetailedRecords.some(
        (record) =>
          record.program === row.program &&
          record.subject === row.subject &&
          record.section === row.section,
      );

      return (
        matchesProgram && matchesSubject && matchesSection && matchesSearch && hasVisibleRecords
      );
    });

    this.filteredStudentConcerns = this.studentConcerns.filter((row) => {
      const matchesProgram = !this.selectedProgram || row.program === this.selectedProgram;
      const matchesSection = !this.selectedSection || row.section === this.selectedSection;

      const matchesSearch =
        !search ||
        this.normalizeSearch(row.studentName).includes(search) ||
        this.normalizeSearch(row.studentNo).includes(search) ||
        this.normalizeSearch(row.program).includes(search) ||
        this.normalizeSearch(row.section).includes(search);

      const hasVisibleRecords = this.filteredDetailedRecords.some(
        (record) =>
          record.studentNo === row.studentNo ||
          this.normalizeSearch(record.studentName) === this.normalizeSearch(row.studentName),
      );

      return matchesProgram && matchesSection && matchesSearch && hasVisibleRecords;
    });

    this.filteredStudentRisks = this.filteredStudentConcerns;
    this.groupedDetailedRecords = this.buildGroupedRecords(this.filteredDetailedRecords);
    this.reportDirectory = this.buildReportDirectory(this.filteredDetailedRecords);
    this.computeStats();

    if (shouldDetect) {
      this.cdr.detectChanges();
    }
  }

  resetFilters(): void {
    this.selectedProgram = '';
    this.selectedSubject = '';
    this.selectedSection = '';
    this.selectedStatus = '';
    this.selectedYear = '';
    this.selectedMonth = '';
    this.searchTerm = '';
    this.successMessage = '';
    this.errorMessage = '';
    this.applyFilters();
  }

  async clearFilteredRecords(): Promise<void> {
    await Swal.fire({
      icon: 'info',
      title: 'Use Generated Reports Instead',
      html: `
        <div style="text-align:left; line-height:1.6">
          <p>For safety, the Faculty Reports module no longer clears raw attendance records.</p>
          <p>Use <b>Generate Report</b> to save the current faculty report, then use <b>Archive</b> to organize old saved reports.</p>
          <p>The original attendance records remain available as the source of truth for audit, parent monitoring, and future reports.</p>
        </div>
      `,
      confirmButtonText: 'OK',
      confirmButtonColor: '#2563eb',
    });
  }

  setReportRecordView(view: ReportRecordView): void {
    if (this.isReportSaving || this.processingGeneratedReportId) return;

    this.reportRecordView = view;
    this.reportRecordSearch = '';
  }

  async generateFacultyReportRecord(): Promise<void> {
    if (!this.canGenerateReportRecord) {
      await Swal.fire({
        icon: 'info',
        title: 'No report data to save',
        text: 'There are no filtered faculty attendance records available to generate as a saved report.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#2563eb',
      });
      return;
    }

    const result = await Swal.fire({
      icon: 'question',
      title: 'Generate faculty report?',
      html: `
        <div style="text-align:left; line-height:1.6">
          <p>This will save a faculty report snapshot for:</p>
          <p><b>Period:</b> ${this.escapeHtml(this.reportPeriodLabel)}</p>
          <p><b>Scope:</b> ${this.escapeHtml(this.activeFilterLabel)}</p>
          <p>The original attendance records will remain unchanged.</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Generate Report',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#2563eb',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!result.isConfirmed) return;

    this.zone.run(() => {
      this.isReportSaving = true;
      this.errorMessage = '';
      this.successMessage = '';
      this.cdr.detectChanges();
    });

    try {
      const payload = this.buildGeneratedReportPayload();
      await addDoc(collection(db, this.generatedReportsCollectionName), payload);

      this.successMessage = `${payload.title} was saved under Generated Faculty Reports.`;
      await this.reloadGeneratedReportsOnly();

      await Swal.fire({
        icon: 'success',
        title: 'Report generated',
        text: `${payload.title} was saved successfully.`,
        confirmButtonText: 'OK',
        confirmButtonColor: '#2563eb',
      });
    } catch (error) {
      console.error('GENERATE FACULTY REPORT ERROR:', error);
      this.errorMessage = 'Unable to save the generated faculty report.';

      await Swal.fire({
        icon: 'error',
        title: 'Report generation failed',
        text:
          error instanceof Error
            ? error.message
            : 'The generated faculty report could not be saved. Please check Firebase permissions.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#dc2626',
      });
    } finally {
      this.zone.run(() => {
        this.isReportSaving = false;
        this.cdr.detectChanges();
      });
    }
  }

  async archiveGeneratedReport(report: GeneratedFacultyReport): Promise<void> {
    if (!report.id || this.processingGeneratedReportId) return;

    const result = await Swal.fire({
      icon: 'warning',
      title: 'Archive saved report?',
      text: `${report.title} will move to Archive. This will not delete attendance records.`,
      showCancelButton: true,
      confirmButtonText: 'Archive',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#d97706',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!result.isConfirmed || !report.id) return;

    this.processingGeneratedReportId = report.id;
    this.cdr.detectChanges();

    try {
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, this.generatedReportsCollectionName, report.id), {
        status: 'archived',
        isArchived: true,
        archivedAt: nowIso,
        updatedAt: nowIso,
      });

      await this.reloadGeneratedReportsOnly();

      await Swal.fire({
        icon: 'success',
        title: 'Report archived',
        text: `${report.title} was moved to Archive.`,
        confirmButtonText: 'OK',
        confirmButtonColor: '#2563eb',
      });
    } catch (error) {
      console.error('ARCHIVE FACULTY REPORT ERROR:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Archive failed',
        text: 'The saved report could not be archived. Please check Firebase permissions.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#dc2626',
      });
    } finally {
      this.processingGeneratedReportId = '';
      this.cdr.detectChanges();
    }
  }

  async restoreGeneratedReport(report: GeneratedFacultyReport): Promise<void> {
    if (!report.id || this.processingGeneratedReportId) return;

    const result = await Swal.fire({
      icon: 'question',
      title: 'Restore saved report?',
      text: `${report.title} will return to Active saved reports.`,
      showCancelButton: true,
      confirmButtonText: 'Restore',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!result.isConfirmed || !report.id) return;

    this.processingGeneratedReportId = report.id;
    this.cdr.detectChanges();

    try {
      const nowIso = new Date().toISOString();
      await updateDoc(doc(db, this.generatedReportsCollectionName, report.id), {
        status: 'active',
        isArchived: false,
        archivedAt: '',
        updatedAt: nowIso,
      });

      await this.reloadGeneratedReportsOnly();

      await Swal.fire({
        icon: 'success',
        title: 'Report restored',
        text: `${report.title} was restored to Active saved reports.`,
        confirmButtonText: 'OK',
        confirmButtonColor: '#2563eb',
      });
    } catch (error) {
      console.error('RESTORE FACULTY REPORT ERROR:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Restore failed',
        text: 'The saved report could not be restored. Please check Firebase permissions.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#dc2626',
      });
    } finally {
      this.processingGeneratedReportId = '';
      this.cdr.detectChanges();
    }
  }

  async deleteGeneratedReportPermanently(report: GeneratedFacultyReport): Promise<void> {
    if (!report.id || this.processingGeneratedReportId) return;

    if (!this.isArchivedGeneratedReport(report)) {
      await Swal.fire({
        icon: 'info',
        title: 'Archive first',
        text: 'Saved reports must be archived before permanent deletion.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#2563eb',
      });
      return;
    }

    const result = await Swal.fire({
      icon: 'error',
      title: 'Delete permanently?',
      html: `
        <div style="text-align:left; line-height:1.6">
          <p>This will permanently delete <b>${this.escapeHtml(report.title)}</b>.</p>
          <p>This only deletes the saved report snapshot. It does not delete original attendance records.</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Delete Permanently',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      reverseButtons: true,
      focusCancel: true,
    });

    if (!result.isConfirmed || !report.id) return;

    this.processingGeneratedReportId = report.id;
    this.cdr.detectChanges();

    try {
      await deleteDoc(doc(db, this.generatedReportsCollectionName, report.id));
      await this.reloadGeneratedReportsOnly();

      await Swal.fire({
        icon: 'success',
        title: 'Report deleted',
        text: `${report.title} was permanently deleted.`,
        confirmButtonText: 'OK',
        confirmButtonColor: '#2563eb',
      });
    } catch (error) {
      console.error('DELETE FACULTY REPORT ERROR:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Delete failed',
        text: 'The saved report could not be deleted. Please check Firebase permissions.',
        confirmButtonText: 'OK',
        confirmButtonColor: '#dc2626',
      });
    } finally {
      this.processingGeneratedReportId = '';
      this.cdr.detectChanges();
    }
  }

  exportGeneratedReport(report: GeneratedFacultyReport): void {
    const summarySheetData = [
      ['SAMS - Student Attendance Monitoring System'],
      ['Generated Faculty Report Snapshot'],
      [],
      ['Report Title', report.title],
      ['Period', report.periodLabel],
      ['Scope', report.filterLabel],
      ['Generated At', this.formatDateTime(report.generatedAt)],
      ['Generated By', report.generatedBy],
      ['Status', report.status === 'archived' ? 'Archived' : 'Active'],
      [],
      ['Students Covered', report.totalStudents],
      ['Sessions', report.totalSessions],
      ['Attendance Rate', `${report.attendanceRate}%`],
      ['Present', report.presentCount],
      ['Late', report.lateCount],
      ['Absent', report.absentCount],
      ['Excused', report.excusedCount],
      ['Total Records', report.totalRecords],
    ];

    const classSheetData = [
      [
        'Program',
        'Subject',
        'Section',
        'Teacher',
        'Students',
        'Sessions',
        'Present',
        'Late',
        'Absent',
        'Excused',
        'Attendance Rate',
      ],
      ...(report.classSummary || []).map((row) => [
        row.program,
        row.subject,
        row.section,
        row.teacher,
        row.totalStudents,
        row.totalSessions,
        row.presentCount,
        row.lateCount,
        row.absentCount,
        row.excusedCount,
        `${row.attendanceRate}%`,
      ]),
    ];

    const studentSheetData = [
      [
        'Student Name',
        'Student Number',
        'Program',
        'Section',
        'Present',
        'Late',
        'Absent',
        'Excused',
        'Total Records',
        'Attendance Rate',
      ],
      ...(report.studentConcerns || []).map((row) => [
        row.studentName,
        row.studentNo,
        row.program,
        row.section,
        row.presentCount,
        row.lateCount,
        row.absentCount,
        row.excusedCount,
        row.totalRecords,
        `${row.attendanceRate}%`,
      ]),
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(summarySheetData),
      'Report Summary',
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(classSheetData),
      'Class Summary',
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(studentSheetData),
      'Student Monitoring',
    );

    const fileDate = new Date().toISOString().slice(0, 10);
    const safeTitle = report.title.replace(/[^a-z0-9]/gi, '_').slice(0, 60);
    XLSX.writeFile(workbook, `${safeTitle || 'SAMS_Faculty_Report'}_${fileDate}.xlsx`);
  }

  computeStats(): void {
    const visibleRecords = this.filteredDetailedRecords;

    const studentKeys = new Set<string>();
    const sessionKeys = new Set<string>();

    visibleRecords.forEach((row) => {
      studentKeys.add(row.studentNo || row.studentName);
      sessionKeys.add(row.sessionId);
    });

    this.totalPresent = visibleRecords.filter((row) => row.status === 'present').length;
    this.totalLate = visibleRecords.filter((row) => row.status === 'late').length;
    this.totalAbsences = visibleRecords.filter((row) => row.status === 'absent').length;
    this.totalExcused = visibleRecords.filter((row) => row.status === 'excused').length;
    this.totalRecords = visibleRecords.length;

    this.totalStudents = studentKeys.size;
    this.totalAttendanceSessions = sessionKeys.size;

    this.overallAttendanceRate =
      this.totalRecords === 0
        ? 0
        : Math.round(
            ((this.totalPresent + this.totalLate + this.totalExcused) / this.totalRecords) * 100,
          );
  }

  exportPdf(): void {
    this.openPrintableReport(true);
  }

  printReport(): void {
    this.openPrintableReport(true);
  }

  exportExcel(): void {
    const generatedDate = new Date().toLocaleString();
    const preparedBy = this.getPreparedByName();

    const summarySheetData = [
      ['SAMS - Student Attendance Monitoring System'],
      ['Faculty Attendance Monitoring Report'],
      [],
      ['Generated Date', generatedDate],
      ['Prepared By', preparedBy],
      ['Program Filter', this.selectedProgram || 'All Programs'],
      ['Subject Filter', this.selectedSubject || 'All Subjects'],
      ['Section Filter', this.selectedSection || 'All Sections'],
      [
        'Status Filter',
        this.selectedStatus ? this.getStatusLabel(this.selectedStatus) : 'All Status',
      ],
      ['Year Filter', this.selectedYear || 'All Years'],
      ['Month Filter', this.selectedMonthLabel],
      ['Search Filter', this.searchTerm || 'None'],
      [],
      ['Students Covered', this.totalStudents],
      ['Attendance Sessions', this.totalAttendanceSessions],
      ['Overall Attendance Rate', `${this.overallAttendanceRate}%`],
      ['Present', this.totalPresent],
      ['Late', this.totalLate],
      ['Absent', this.totalAbsences],
      ['Excused', this.totalExcused],
      ['Total Records', this.totalRecords],
    ];

    const classSummaryData = [
      [
        'Program',
        'Subject',
        'Section',
        'Teacher',
        'Students',
        'Sessions',
        'Present',
        'Late',
        'Absent',
        'Excused',
        'Attendance Rate',
        'Absent Rate',
        'Late Rate',
      ],
      ...this.filteredAttendanceSummary.map((row) => [
        row.program,
        row.subject,
        row.section,
        row.teacher,
        row.totalStudents,
        row.totalSessions,
        row.presentCount,
        row.lateCount,
        row.absentCount,
        row.excusedCount,
        `${row.attendanceRate}%`,
        `${row.absentRate}%`,
        `${row.lateRate}%`,
      ]),
    ];

    const studentConcernData = [
      [
        'Student Name',
        'Student Number',
        'Program',
        'Section',
        'Present',
        'Late',
        'Absent',
        'Excused',
        'Total Records',
        'Attendance Rate',
      ],
      ...this.filteredStudentConcerns.map((row) => [
        row.studentName,
        row.studentNo,
        row.program,
        row.section,
        row.presentCount,
        row.lateCount,
        row.absentCount,
        row.excusedCount,
        row.totalRecords,
        `${row.attendanceRate}%`,
      ]),
    ];

    const detailedData = [
      [
        'Month',
        'Student Name',
        'Student Number',
        'Program',
        'Section',
        'Subject',
        'Status',
        'Method',
        'Time Recorded',
        'Remarks',
      ],
      ...this.filteredDetailedRecords.map((row) => [
        row.monthLabel,
        row.studentName,
        row.studentNo,
        row.program,
        row.section,
        row.subject,
        this.getStatusLabel(row.status),
        this.getMethodLabel(row.method),
        this.formatDateTime(row.timeRecorded),
        row.remarks || '—',
      ]),
    ];

    const workbook = XLSX.utils.book_new();

    const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetData);
    const classSheet = XLSX.utils.aoa_to_sheet(classSummaryData);
    const concernSheet = XLSX.utils.aoa_to_sheet(studentConcernData);
    const detailedSheet = XLSX.utils.aoa_to_sheet(detailedData);

    summarySheet['!cols'] = [{ wch: 30 }, { wch: 38 }];
    classSheet['!cols'] = [
      { wch: 24 },
      { wch: 18 },
      { wch: 16 },
      { wch: 24 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 16 },
      { wch: 14 },
      { wch: 12 },
    ];
    concernSheet['!cols'] = [
      { wch: 28 },
      { wch: 18 },
      { wch: 24 },
      { wch: 16 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 14 },
      { wch: 16 },
    ];
    detailedSheet['!cols'] = [
      { wch: 20 },
      { wch: 28 },
      { wch: 18 },
      { wch: 24 },
      { wch: 16 },
      { wch: 18 },
      { wch: 12 },
      { wch: 18 },
      { wch: 24 },
      { wch: 46 },
    ];

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Report Summary');
    XLSX.utils.book_append_sheet(workbook, classSheet, 'Class Summary');
    XLSX.utils.book_append_sheet(workbook, concernSheet, 'Student Monitoring');
    XLSX.utils.book_append_sheet(workbook, detailedSheet, 'Detailed Records');

    const fileDate = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `SAMS_Faculty_Attendance_Report_${fileDate}.xlsx`);
  }

  getRateClass(rate: number): string {
    if (rate >= 90) return 'excellent';
    if (rate >= 80) return 'good';
    if (rate >= 70) return 'warning';
    return 'danger';
  }

  getStatusLabel(status: string): string {
    const value = String(status || '').toLowerCase();

    if (value === 'present') return 'Present';
    if (value === 'late') return 'Late';
    if (value === 'absent') return 'Absent';
    if (value === 'excused') return 'Excused';

    return 'Unknown';
  }

  getMethodLabel(method: string): string {
    const value = String(method || '').toLowerCase();

    if (value === 'qr') return 'QR Scan';
    if (value === 'code') return 'Session Code';
    if (value === 'manual') return 'Teacher Manual';
    if (value === 'teacher_assisted') return 'Teacher Assisted';
    if (value === 'imported_excel') return 'Excel Import';
    if (value === 'imported_image') return 'Image Import';

    return method || '—';
  }

  formatDateTime(value: unknown): string {
    const date = new Date(String(value || ''));

    if (Number.isNaN(date.getTime())) {
      return '—';
    }

    return date.toLocaleString([], {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatDate(value: unknown): string {
    const date = new Date(String(value || ''));

    if (Number.isNaN(date.getTime())) {
      return '—';
    }

    return date.toLocaleDateString([], {
      month: 'short',
      year: 'numeric',
    });
  }

  getGeneratedReportStatusClass(report: GeneratedFacultyReport): string {
    return this.isArchivedGeneratedReport(report) ? 'archived' : 'active';
  }

  getGeneratedReportDateLabel(report: GeneratedFacultyReport): string {
    return this.formatDateTime(report.generatedAt);
  }

  trackByGeneratedReport(index: number, report: GeneratedFacultyReport): string {
    return report.id || `${report.title}-${index}`;
  }

  trackByGeneratedReportGroup(index: number, group: GeneratedFacultyReportGroup): string {
    return group.label || String(index);
  }

  trackByMonthDirectory(index: number, group: FacultyMonthDirectoryGroup): string {
    return group.monthKey || String(index);
  }

  trackByClassGroup(index: number, group: FacultyClassGroup): string {
    return group.classKey || String(index);
  }

  trackBySessionGroup(index: number, group: FacultySessionGroup): string {
    return group.sessionKey || String(index);
  }

  trackByDetailedRecord(index: number, record: DetailedReportRow): string {
    return record.recordId || `${record.sessionId}-${record.studentNo}-${index}`;
  }

  private async fetchGeneratedReports(): Promise<GeneratedFacultyReport[]> {
    const snapshot = await getDocs(collection(db, this.generatedReportsCollectionName));
    const allReports = snapshot.docs
      .map((docSnap) => this.mapGeneratedReport(docSnap.id, docSnap.data()))
      .sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)));

    if (this.currentRole === 'admin') {
      return allReports;
    }

    const currentKeys = this.getCurrentFacultyOwnerKeys();

    return allReports.filter((report) =>
      (report.ownerKeys || []).some((key) => currentKeys.has(this.normalizeText(key))),
    );
  }

  private async reloadGeneratedReportsOnly(): Promise<void> {
    this.generatedReports = await this.fetchGeneratedReports();
    this.cdr.detectChanges();
  }

  private buildGeneratedReportPayload(): Omit<GeneratedFacultyReport, 'id'> {
    const nowIso = new Date().toISOString();
    const preparedBy = this.getPreparedByName();
    const ownerKeys = Array.from(this.getCurrentFacultyOwnerKeys());
    const subjectPart = this.selectedSubject || 'All Subjects';
    const sectionPart = this.selectedSection || 'All Sections';

    return {
      title: `Faculty Report - ${this.reportPeriodLabel} - ${subjectPart} / ${sectionPart}`,
      periodLabel: this.reportPeriodLabel,
      filterLabel: this.activeFilterLabel,
      generatedAt: nowIso,
      generatedBy: preparedBy,
      generatedByUserId: String(this.currentUser?.id || this.currentUser?.uid || ''),
      generatedByEmail: String(this.currentUser?.email || ''),
      generatedByRole: this.currentRole || 'faculty',
      ownerKeys,
      status: 'active',
      isArchived: false,
      archivedAt: '',
      totalStudents: this.totalStudents,
      totalSessions: this.totalAttendanceSessions,
      totalRecords: this.totalRecords,
      attendanceRate: this.overallAttendanceRate,
      presentCount: this.totalPresent,
      lateCount: this.totalLate,
      absentCount: this.totalAbsences,
      excusedCount: this.totalExcused,
      selectedYear: this.selectedYear,
      selectedMonth: this.selectedMonth,
      selectedProgram: this.selectedProgram,
      selectedSubject: this.selectedSubject,
      selectedSection: this.selectedSection,
      selectedStatus: this.selectedStatus,
      classSummary: this.filteredAttendanceSummary,
      studentConcerns: this.filteredStudentConcerns.slice(0, 50),
      detailedRecordsPreview: this.filteredDetailedRecords.slice(0, 100),
      notes:
        'Generated by the Faculty Reports module. This is a saved report snapshot for the faculty duty scope only and does not replace raw attendance records.',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  private mapGeneratedReport(id: string, data: any): GeneratedFacultyReport {
    const status: GeneratedReportStatus =
      data?.isArchived === true || data?.status === 'archived' ? 'archived' : 'active';

    return {
      id,
      title: String(data?.title || 'Faculty Generated Report'),
      periodLabel: String(data?.periodLabel || 'No period'),
      filterLabel: String(data?.filterLabel || 'All handled classes'),
      generatedAt: String(data?.generatedAt || data?.createdAt || ''),
      generatedBy: String(data?.generatedBy || 'Faculty'),
      generatedByUserId: String(data?.generatedByUserId || ''),
      generatedByEmail: String(data?.generatedByEmail || ''),
      generatedByRole: String(data?.generatedByRole || 'faculty'),
      ownerKeys: Array.isArray(data?.ownerKeys)
        ? data.ownerKeys.map((key: unknown) => String(key))
        : [],
      status,
      isArchived: status === 'archived',
      archivedAt: String(data?.archivedAt || ''),
      totalStudents: Number(data?.totalStudents || 0),
      totalSessions: Number(data?.totalSessions || 0),
      totalRecords: Number(data?.totalRecords || 0),
      attendanceRate: Number(data?.attendanceRate || 0),
      presentCount: Number(data?.presentCount || 0),
      lateCount: Number(data?.lateCount || 0),
      absentCount: Number(data?.absentCount || 0),
      excusedCount: Number(data?.excusedCount || 0),
      selectedYear: String(data?.selectedYear || ''),
      selectedMonth: String(data?.selectedMonth || ''),
      selectedProgram: String(data?.selectedProgram || ''),
      selectedSubject: String(data?.selectedSubject || ''),
      selectedSection: String(data?.selectedSection || ''),
      selectedStatus: String(data?.selectedStatus || ''),
      classSummary: Array.isArray(data?.classSummary) ? data.classSummary : [],
      studentConcerns: Array.isArray(data?.studentConcerns) ? data.studentConcerns : [],
      detailedRecordsPreview: Array.isArray(data?.detailedRecordsPreview)
        ? data.detailedRecordsPreview
        : [],
      notes: String(data?.notes || ''),
      createdAt: String(data?.createdAt || ''),
      updatedAt: String(data?.updatedAt || ''),
    };
  }

  private isArchivedGeneratedReport(report: GeneratedFacultyReport): boolean {
    return report.isArchived === true || report.status === 'archived';
  }

  private getGeneratedReportGroupLabel(report: GeneratedFacultyReport): string {
    if (report.selectedYear && report.selectedMonth) {
      return `${this.getMonthLabel(`${report.selectedYear}-${report.selectedMonth}`)}`;
    }

    if (report.selectedYear) {
      return `Year ${report.selectedYear}`;
    }

    const generatedDate = new Date(report.generatedAt || '');

    if (!Number.isNaN(generatedDate.getTime())) {
      return generatedDate.toLocaleDateString([], { month: 'long', year: 'numeric' });
    }

    return 'Saved Faculty Reports';
  }

  private getCurrentFacultyOwnerKeys(): Set<string> {
    const keys = new Set<string>();
    const add = (value: unknown): void => {
      const normalized = this.normalizeText(value);
      if (normalized) keys.add(normalized);
    };

    add(this.currentUser?.id);
    add(this.currentUser?.uid);
    add(this.currentUser?.userId);
    add(this.currentUser?.teacherId);
    add(this.currentUser?.facultyId);
    add(this.currentUser?.email);
    add(this.getPreparedByName());

    this.getCurrentFacultyIdentifiers().forEach((value) => add(value));

    return keys;
  }

  private buildReports(): void {
    const visibleOfferingIds = new Set(
      this.teacherOfferings.map((offering: any) => String(offering.id)),
    );

    const visibleSessions = this.sessions.filter((session: any) => {
      const offering = this.findOfferingBySession(session);
      return offering && visibleOfferingIds.has(String(offering.id));
    });

    const visibleSessionIds = new Set(visibleSessions.map((session: any) => String(session.id)));

    const visibleAttendance = this.attendance.filter((record: any) =>
      visibleSessionIds.has(String(record.sessionId)),
    );

    this.detailedRecords = visibleAttendance
      .map((record: any) => this.buildDetailedRecordRow(record))
      .filter((row: DetailedReportRow | null): row is DetailedReportRow => !!row)
      .sort((a, b) => String(b.timeRecorded || '').localeCompare(String(a.timeRecorded || '')));

    this.attendanceSummary = this.teacherOfferings
      .map((offering: any) => {
        const offeringSessions = visibleSessions.filter((session: any) => {
          const sessionOfferingId = String(session.classOfferingId || session.offeringId || '');
          return sessionOfferingId === String(offering.id);
        });

        const offeringSessionIds = new Set(
          offeringSessions.map((session: any) => String(session.id)),
        );

        const records = visibleAttendance.filter((record: any) =>
          offeringSessionIds.has(String(record.sessionId)),
        );

        const presentCount = this.countStatus(records, 'present');
        const lateCount = this.countStatus(records, 'late');
        const absentCount = this.countStatus(records, 'absent');
        const excusedCount = this.countStatus(records, 'excused');

        const totalRecords = presentCount + lateCount + absentCount + excusedCount;

        return {
          program: this.getProgramLabelByOffering(offering),
          subject: this.getSubjectLabelByOffering(offering),
          section: this.getSectionLabelByOffering(offering),
          teacher: this.getTeacherLabelByOffering(offering),
          totalStudents: this.getOfferingStudentCount(offering),
          totalSessions: offeringSessions.length,
          presentCount,
          lateCount,
          absentCount,
          excusedCount,
          attendanceRate: this.getRate(presentCount + lateCount + excusedCount, totalRecords),
          absentRate: this.getRate(absentCount, totalRecords),
          lateRate: this.getRate(lateCount, totalRecords),
        };
      })
      .filter((row) => row.totalSessions > 0 || row.totalStudents > 0);

    this.studentConcerns = this.getStudentsCoveredByFaculty()
      .map((student: any) => {
        const records = visibleAttendance.filter((record: any) =>
          this.recordBelongsToStudent(record, student),
        );

        const presentCount = this.countStatus(records, 'present');
        const lateCount = this.countStatus(records, 'late');
        const absentCount = this.countStatus(records, 'absent');
        const excusedCount = this.countStatus(records, 'excused');
        const totalRecords = presentCount + lateCount + absentCount + excusedCount;

        return {
          studentName: this.getStudentName(student),
          studentNo: student.studentNumber || 'No student number',
          program: this.getProgramLabelByStudent(student),
          section: this.getSectionLabelByStudent(student),
          presentCount,
          lateCount,
          absentCount,
          excusedCount,
          totalRecords,
          attendanceRate: this.getRate(presentCount + lateCount + excusedCount, totalRecords),
        };
      })
      .filter(
        (row) =>
          row.totalRecords > 0 &&
          (row.absentCount > 0 || row.lateCount > 0 || row.attendanceRate < 85),
      )
      .sort((a, b) => {
        if (b.absentCount !== a.absentCount) return b.absentCount - a.absentCount;
        if (b.lateCount !== a.lateCount) return b.lateCount - a.lateCount;
        return a.attendanceRate - b.attendanceRate;
      });

    this.studentRisks = this.studentConcerns;
  }

  private buildDetailedRecordRow(record: any): DetailedReportRow | null {
    const session = this.findSessionByRecord(record);
    const offering = this.findOfferingBySession(session);
    const student = this.findStudentByRecord(record);

    if (!session || !offering || !student) {
      return null;
    }

    const status = String(record.status || '').toLowerCase() as AttendanceStatus;

    if (!['present', 'late', 'absent', 'excused'].includes(status)) {
      return null;
    }

    const timeRecorded =
      record.timeRecorded ||
      record.time ||
      record.timestamp ||
      session.startTime ||
      session.date ||
      '';

    const monthKey = this.getMonthKey(timeRecorded || session.date || session.startTime);
    const year = monthKey ? monthKey.slice(0, 4) : '';

    return {
      recordId: String(record.id || ''),
      sessionId: String(record.sessionId || session.id || ''),
      studentName: this.getStudentName(student),
      studentNo: student.studentNumber || 'No student number',
      program: this.getBestProgramLabel(student, offering),
      section: this.getSectionLabelByOffering(offering),
      subject: this.getSubjectLabelByOffering(offering),
      status,
      method: record.method || '—',
      timeRecorded,
      sessionDate: session.date || this.getDateOnly(session.startTime || timeRecorded),
      remarks: this.getDisplayRemarks(record),
      monthKey,
      monthLabel: this.getMonthLabel(monthKey),
      year,
    };
  }

  private buildAvailableYears(): string[] {
    return Array.from(new Set(this.detailedRecords.map((row) => row.year).filter(Boolean))).sort(
      (a, b) => b.localeCompare(a),
    );
  }

  private buildGroupedRecords(records: DetailedReportRow[]): MonthGroup[] {
    const groups = new Map<string, DetailedReportRow[]>();

    records.forEach((record) => {
      const key = record.monthKey || 'unknown';
      const existing = groups.get(key) || [];
      existing.push(record);
      groups.set(key, existing);
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthKey, groupRecords]) => ({
        monthKey,
        monthLabel: groupRecords[0]?.monthLabel || 'No Date',
        records: groupRecords.sort((a, b) =>
          String(b.timeRecorded || '').localeCompare(String(a.timeRecorded || '')),
        ),
      }));
  }

  private buildReportDirectory(records: DetailedReportRow[]): FacultyMonthDirectoryGroup[] {
    const monthMap = new Map<string, DetailedReportRow[]>();

    records.forEach((record) => {
      const monthKey = record.monthKey || 'unknown';
      const existing = monthMap.get(monthKey) || [];
      existing.push(record);
      monthMap.set(monthKey, existing);
    });

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthKey, monthRecords]) => {
        const classMap = new Map<string, DetailedReportRow[]>();

        monthRecords.forEach((record) => {
          const classKey = this.normalizeDirectoryKey(
            `${record.program}|${record.subject}|${record.section}`,
          );
          const existing = classMap.get(classKey) || [];
          existing.push(record);
          classMap.set(classKey, existing);
        });

        const classGroups = Array.from(classMap.entries())
          .map(([classKey, classRecords]) => {
            const sessionMap = new Map<string, DetailedReportRow[]>();

            classRecords.forEach((record) => {
              const sessionKey = record.sessionId || record.sessionDate || record.timeRecorded;
              const existing = sessionMap.get(sessionKey) || [];
              existing.push(record);
              sessionMap.set(sessionKey, existing);
            });

            const sessionGroups = Array.from(sessionMap.entries())
              .map(([sessionKey, sessionRecords]) => {
                const sortedSessionRecords = [...sessionRecords].sort((a, b) =>
                  a.studentName.localeCompare(b.studentName),
                );

                return {
                  sessionKey,
                  sessionLabel: this.getSessionGroupLabel(sortedSessionRecords[0]),
                  totalRecords: sortedSessionRecords.length,
                  presentCount: this.countDetailedStatus(sortedSessionRecords, 'present'),
                  lateCount: this.countDetailedStatus(sortedSessionRecords, 'late'),
                  absentCount: this.countDetailedStatus(sortedSessionRecords, 'absent'),
                  excusedCount: this.countDetailedStatus(sortedSessionRecords, 'excused'),
                  attendanceRate: this.getDetailedAttendanceRate(sortedSessionRecords),
                  records: sortedSessionRecords,
                };
              })
              .sort(
                (a, b) =>
                  this.getSortableSessionTime(b.records[0]) -
                  this.getSortableSessionTime(a.records[0]),
              );

            return {
              classKey,
              program: classRecords[0]?.program || 'No program',
              subject: classRecords[0]?.subject || 'No subject',
              section: classRecords[0]?.section || 'No section',
              totalRecords: classRecords.length,
              presentCount: this.countDetailedStatus(classRecords, 'present'),
              lateCount: this.countDetailedStatus(classRecords, 'late'),
              absentCount: this.countDetailedStatus(classRecords, 'absent'),
              excusedCount: this.countDetailedStatus(classRecords, 'excused'),
              attendanceRate: this.getDetailedAttendanceRate(classRecords),
              sessionGroups,
            };
          })
          .sort((a, b) => {
            const subjectCompare = a.subject.localeCompare(b.subject);
            if (subjectCompare !== 0) return subjectCompare;
            return a.section.localeCompare(b.section);
          });

        return {
          monthKey,
          monthLabel: monthRecords[0]?.monthLabel || 'No Date',
          totalRecords: monthRecords.length,
          presentCount: this.countDetailedStatus(monthRecords, 'present'),
          lateCount: this.countDetailedStatus(monthRecords, 'late'),
          absentCount: this.countDetailedStatus(monthRecords, 'absent'),
          excusedCount: this.countDetailedStatus(monthRecords, 'excused'),
          attendanceRate: this.getDetailedAttendanceRate(monthRecords),
          classGroups,
        };
      });
  }

  private getSessionGroupLabel(record: DetailedReportRow | undefined): string {
    if (!record) return 'No session date';

    const date = new Date(String(record.timeRecorded || record.sessionDate || ''));

    if (Number.isNaN(date.getTime())) {
      return record.sessionDate || 'No session date';
    }

    return date.toLocaleString([], {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private getSortableSessionTime(record: DetailedReportRow | undefined): number {
    if (!record) return 0;

    const date = new Date(String(record.timeRecorded || record.sessionDate || ''));

    if (Number.isNaN(date.getTime())) {
      return 0;
    }

    return date.getTime();
  }

  private countDetailedStatus(records: DetailedReportRow[], status: AttendanceStatus): number {
    return records.filter((record) => record.status === status).length;
  }

  private getDetailedAttendanceRate(records: DetailedReportRow[]): number {
    if (!records.length) return 0;

    const attended = records.filter(
      (record) =>
        record.status === 'present' || record.status === 'late' || record.status === 'excused',
    ).length;

    return Math.round((attended / records.length) * 100);
  }

  private normalizeDirectoryKey(value: unknown): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private getVisibleFacultyOfferings(): any[] {
    const activeOfferings = this.offerings.filter(
      (offering: any) => !offering.isArchived && offering.status !== 'archived',
    );

    if (this.currentRole === 'admin') {
      return activeOfferings;
    }

    return activeOfferings.filter((offering: any) =>
      this.isOfferingHandledByCurrentFaculty(offering),
    );
  }

  private isOfferingHandledByCurrentFaculty(offering: any): boolean {
    const identifiers = this.getCurrentFacultyIdentifiers();

    const offeringTeacherValues = [
      offering.teacherId,
      offering.instructorId,
      offering.facultyId,
      offering.teacherName,
      offering.instructorName,
      offering.facultyName,
    ].map((value) => this.normalizeText(value));

    return offeringTeacherValues.some((value) => value && identifiers.has(value));
  }

  private getCurrentFacultyIdentifiers(): Set<string> {
    const identifiers = new Set<string>();

    const add = (value: unknown): void => {
      const normalized = this.normalizeText(value);
      if (normalized) identifiers.add(normalized);
    };

    add(this.currentUser?.id);
    add(this.currentUser?.uid);
    add(this.currentUser?.userId);
    add(this.currentUser?.teacherId);
    add(this.currentUser?.facultyId);
    add(this.currentUser?.email);
    add(this.getPreparedByName());

    const currentEmail = this.normalizeText(this.currentUser?.email);
    const currentName = this.normalizeText(this.getPreparedByName());

    this.teachers.forEach((teacher: any) => {
      const teacherName = this.normalizeText(this.getTeacherName(teacher));
      const teacherEmail = this.normalizeText(teacher.email);

      const sameEmail = currentEmail && teacherEmail && currentEmail === teacherEmail;
      const sameName = currentName && teacherName && currentName === teacherName;
      const sameUserId =
        this.normalizeText(teacher.userId) === this.normalizeText(this.currentUser?.id);
      const sameTeacherId =
        this.normalizeText(teacher.id) === this.normalizeText(this.currentUser?.id);

      if (sameEmail || sameName || sameUserId || sameTeacherId) {
        add(teacher.id);
        add(teacher.userId);
        add(teacher.email);
        add(teacherName);
      }
    });

    return identifiers;
  }

  private getStudentsCoveredByFaculty(): any[] {
    return this.students.filter((student: any) => {
      if (student.status === 'inactive' || student.status === 'archived' || student.isArchived) {
        return false;
      }

      return this.teacherOfferings.some((offering: any) =>
        this.studentBelongsToOffering(student, offering),
      );
    });
  }

  private getOfferingStudentCount(offering: any): number {
    return this.students.filter((student: any) => {
      if (student.status === 'inactive' || student.status === 'archived' || student.isArchived) {
        return false;
      }

      return this.studentBelongsToOffering(student, offering);
    }).length;
  }

  private studentBelongsToOffering(student: any, offering: any): boolean {
    const studentValues = [student.sectionId, student.sectionName, student.section]
      .map((value) => this.normalizeText(value))
      .filter(Boolean);

    const offeringValues = [offering.sectionId, offering.sectionName, offering.section]
      .map((value) => this.normalizeText(value))
      .filter(Boolean);

    return studentValues.some((studentValue) =>
      offeringValues.some(
        (offeringValue) =>
          studentValue === offeringValue ||
          studentValue.endsWith(offeringValue) ||
          offeringValue.endsWith(studentValue),
      ),
    );
  }

  private findSessionByRecord(record: any): any | null {
    return this.sessions.find((item: any) => String(item.id) === String(record.sessionId)) || null;
  }

  private findOfferingBySession(session: any): any | null {
    if (!session) return null;

    const offeringId = session.classOfferingId || session.offeringId || '';

    return (
      this.teacherOfferings.find((offering: any) => String(offering.id) === String(offeringId)) ||
      null
    );
  }

  private findStudentByRecord(record: any): any | null {
    return (
      this.students.find((student: any) => this.recordBelongsToStudent(record, student)) || null
    );
  }

  private recordBelongsToStudent(record: any, student: any): boolean {
    const recordStudentId = this.normalizeText(record.studentId);
    const recordStudentNumber = this.normalizeText(record.studentNumber);

    const studentId = this.normalizeText(student.id);
    const studentUserId = this.normalizeText(student.userId);
    const studentNumber = this.normalizeText(student.studentNumber);

    return (
      (!!recordStudentId &&
        (recordStudentId === studentId ||
          recordStudentId === studentUserId ||
          recordStudentId === studentNumber)) ||
      (!!recordStudentNumber && recordStudentNumber === studentNumber)
    );
  }

  private countStatus(records: any[], status: AttendanceStatus): number {
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
    if (offering.teacherName) return offering.teacherName;
    if (offering.instructorName) return offering.instructorName;
    if (offering.facultyName) return offering.facultyName;

    const teacher = this.teachers.find(
      (item: any) =>
        String(item.id) ===
          String(offering.teacherId || offering.instructorId || offering.facultyId || '') ||
        String(item.userId) ===
          String(offering.teacherId || offering.instructorId || offering.facultyId || ''),
    );

    if (!teacher) return this.getPreparedByName() || 'Faculty';

    return this.getTeacherName(teacher);
  }

  private getTeacherName(teacher: any): string {
    return (
      `${teacher?.firstName || ''} ${teacher?.lastName || ''}`.trim() ||
      teacher?.fullName ||
      teacher?.name ||
      teacher?.email ||
      'Faculty'
    );
  }

  private getProgramLabelByOffering(offering: any): string {
    const section = this.findSectionForOffering(offering);
    const subject = this.findSubjectForOffering(offering);

    const inferredProgram = this.inferProgramFromAcademicClues(null, offering, section, subject);
    if (inferredProgram) return inferredProgram;

    const offeringProgram = this.getOfferingProgramRaw(offering);
    if (offeringProgram) return offeringProgram;

    const sectionProgram = this.getSectionProgramRaw(section);
    if (sectionProgram) return sectionProgram;

    const matchingStudents = this.students.filter((student: any) =>
      this.studentBelongsToOffering(student, offering),
    );

    const programCounts = new Map<string, number>();

    matchingStudents.forEach((student: any) => {
      const studentInferred = this.inferProgramFromAcademicClues(
        student,
        offering,
        section,
        subject,
      );
      const program = studentInferred || this.getStudentProgramRaw(student);

      if (program) {
        programCounts.set(program, (programCounts.get(program) || 0) + 1);
      }
    });

    let bestProgram = '';
    let bestCount = 0;

    programCounts.forEach((count, program) => {
      if (count > bestCount) {
        bestProgram = program;
        bestCount = count;
      }
    });

    return bestProgram || 'No program';
  }

  private getBestProgramLabel(student: any, offering: any): string {
    const studentSection = this.findSectionForStudent(student);
    const offeringSection = this.findSectionForOffering(offering);
    const subject = this.findSubjectForOffering(offering);

    const inferredProgram = this.inferProgramFromAcademicClues(
      student,
      offering,
      studentSection || offeringSection,
      subject,
    );

    if (inferredProgram) return inferredProgram;

    const studentProgram = this.getStudentProgramRaw(student);
    if (studentProgram) return studentProgram;

    const offeringProgram = this.getOfferingProgramRaw(offering);
    if (offeringProgram) return offeringProgram;

    const studentSectionProgram = this.getSectionProgramRaw(studentSection);
    if (studentSectionProgram) return studentSectionProgram;

    const offeringSectionProgram = this.getSectionProgramRaw(offeringSection);
    if (offeringSectionProgram) return offeringSectionProgram;

    return 'No program';
  }

  private getStudentProgramRaw(student: any): string {
    return String(
      student?.program ||
        student?.programName ||
        student?.course ||
        student?.courseName ||
        student?.academicProgram ||
        student?.department ||
        '',
    ).trim();
  }

  private getOfferingProgramRaw(offering: any): string {
    return String(
      offering?.program ||
        offering?.programName ||
        offering?.course ||
        offering?.courseName ||
        offering?.academicProgram ||
        offering?.department ||
        '',
    ).trim();
  }

  private getSectionProgramRaw(section: any): string {
    return String(
      section?.program ||
        section?.programName ||
        section?.course ||
        section?.courseName ||
        section?.academicProgram ||
        section?.department ||
        '',
    ).trim();
  }

  private findSubjectForOffering(offering: any): any | null {
    if (!offering) return null;

    const subjectId = this.normalizeText(offering.subjectId);
    const subjectCode = this.normalizeText(offering.subjectCode);
    const subjectName = this.normalizeText(offering.subjectName);

    return (
      this.subjectsData.find((subject: any) => {
        const values = [
          subject.id,
          subject.subjectId,
          subject.subjectCode,
          subject.subjectName,
          subject.code,
          subject.name,
        ]
          .map((value) => this.normalizeText(value))
          .filter(Boolean);

        return (
          (!!subjectId && values.includes(subjectId)) ||
          (!!subjectCode && values.includes(subjectCode)) ||
          (!!subjectName && values.includes(subjectName))
        );
      }) || null
    );
  }

  private findSectionForStudent(student: any): any | null {
    if (!student) return null;

    const studentValues = [student.sectionId, student.sectionName, student.section]
      .map((value) => this.normalizeText(value))
      .filter(Boolean);

    return (
      this.sectionsData.find((section: any) => {
        const sectionValues = [
          section.id,
          section.sectionId,
          section.sectionName,
          section.section,
          section.sectionCode,
          section.name,
          section.code,
        ]
          .map((value) => this.normalizeText(value))
          .filter(Boolean);

        return studentValues.some((studentValue) =>
          sectionValues.some(
            (sectionValue) =>
              studentValue === sectionValue ||
              studentValue.endsWith(sectionValue) ||
              sectionValue.endsWith(studentValue),
          ),
        );
      }) || null
    );
  }

  private findSectionForOffering(offering: any): any | null {
    if (!offering) return null;

    const offeringValues = [offering.sectionId, offering.sectionName, offering.section]
      .map((value) => this.normalizeText(value))
      .filter(Boolean);

    return (
      this.sectionsData.find((section: any) => {
        const sectionValues = [
          section.id,
          section.sectionId,
          section.sectionName,
          section.section,
          section.sectionCode,
          section.name,
          section.code,
        ]
          .map((value) => this.normalizeText(value))
          .filter(Boolean);

        return offeringValues.some((offeringValue) =>
          sectionValues.some(
            (sectionValue) =>
              offeringValue === sectionValue ||
              offeringValue.endsWith(sectionValue) ||
              sectionValue.endsWith(offeringValue),
          ),
        );
      }) || null
    );
  }

  private inferProgramFromAcademicClues(
    student: any,
    offering: any,
    section: any,
    subject: any,
  ): string {
    const clues = [
      offering?.subjectCode,
      offering?.subjectName,
      subject?.subjectCode,
      subject?.subjectName,
      subject?.code,
      subject?.name,
      offering?.sectionName,
      offering?.section,
      offering?.sectionCode,
      section?.sectionName,
      section?.section,
      section?.sectionCode,
      section?.name,
      section?.code,
      student?.sectionName,
      student?.section,
      student?.sectionId,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    const joined = clues.join(' ').toUpperCase();

    if (!joined) return '';

    if (
      /\bBSIT\b/.test(joined) ||
      /\bIT\s*[-]?\s*\d/.test(joined) ||
      /\bIT\s*[A-Z]\b/.test(joined) ||
      /\bIT\d{2,4}\b/.test(joined) ||
      /\bITE\d{2,4}\b/.test(joined) ||
      /\bINFORMATION\s+TECHNOLOGY\b/.test(joined)
    ) {
      return 'Information Technology';
    }

    if (
      /\bBSTCM\b/.test(joined) ||
      /\bTCM\s*[-]?\s*\d/.test(joined) ||
      /\bTCM\d{2,4}\b/.test(joined) ||
      /\bTECHNOLOGY\s+COMMUNICATION\s+MANAGEMENT\b/.test(joined)
    ) {
      return 'Technology Communication Management';
    }

    if (
      /\bBSEMT\b/.test(joined) ||
      /\bEMT\s*[-]?\s*\d/.test(joined) ||
      /\bEMT\d{2,4}\b/.test(joined) ||
      /\bELECTRO[-\s]?MECHANICAL\s+TECHNOLOGY\b/.test(joined)
    ) {
      return 'Electro-Mechanical Technology';
    }

    return '';
  }

  private inferProgramFromSection(sectionValue: unknown): string {
    const value = String(sectionValue || '')
      .trim()
      .toUpperCase();

    if (!value) return '';

    if (
      value.includes('BSIT') ||
      /\bIT\s*[-]?\s*\d/.test(value) ||
      /\bIT\d{2,4}\b/.test(value) ||
      value.includes('INFORMATION TECHNOLOGY')
    ) {
      return 'Information Technology';
    }

    if (
      value.includes('TCM') ||
      value.includes('BSTCM') ||
      value.includes('TECHNOLOGY COMMUNICATION')
    ) {
      return 'Technology Communication Management';
    }

    if (
      value.includes('EMT') ||
      value.includes('BSEMT') ||
      value.includes('ELECTRO') ||
      value.includes('MECHANICAL')
    ) {
      return 'Electro-Mechanical Technology';
    }

    return '';
  }

  private getProgramLabelByStudent(student: any): string {
    const section = this.findSectionForStudent(student);

    const inferredProgram = this.inferProgramFromAcademicClues(student, null, section, null);
    if (inferredProgram) return inferredProgram;

    const sectionProgram = this.getSectionProgramRaw(section);
    if (sectionProgram) return sectionProgram;

    const studentProgram = this.getStudentProgramRaw(student);
    if (studentProgram) return studentProgram;

    const fallbackInferred = this.inferProgramFromSection(
      student?.sectionId || student?.sectionName || student?.section,
    );

    return fallbackInferred || 'No program';
  }

  private getSectionLabelByOffering(offering: any): string {
    if (offering.sectionName) return offering.sectionName;
    if (offering.section) return offering.section;

    const section = this.findSectionForOffering(offering);
    return this.getSectionLabel(section);
  }

  private getSectionLabelByStudent(student: any): string {
    const section = this.findSectionForStudent(student);

    return this.getSectionLabel(section) || student.sectionName || student.section || 'No section';
  }

  private getSectionLabel(section: any): string {
    if (!section) return 'No section';
    return section.sectionName || section.name || section.code || 'No section';
  }

  private getSubjectLabelByOffering(offering: any): string {
    if (offering.subjectCode || offering.subjectName) {
      return offering.subjectCode || offering.subjectName;
    }

    const subject = this.findSubjectForOffering(offering);
    return this.getSubjectLabel(subject);
  }

  private getSubjectLabel(subject: any): string {
    if (!subject) return 'No subject';
    return subject.subjectCode || subject.subjectName || subject.name || 'No subject';
  }

  private getPreparedByName(): string {
    return (
      `${this.currentUser?.firstName || ''} ${this.currentUser?.lastName || ''}`.trim() ||
      this.currentUser?.fullName ||
      this.currentUser?.name ||
      this.currentUser?.email ||
      'Faculty'
    );
  }

  private getDisplayRemarks(record: any): string {
    const remarks = String(record.remarks || '').trim();

    if (remarks) return remarks;

    const status = String(record.status || '').toLowerCase();
    const method = String(record.method || '').toLowerCase();

    if (status === 'present') {
      if (method === 'qr') return 'Submitted through QR scan.';
      if (method === 'code') return 'Submitted through session code.';
      if (method === 'teacher_assisted') return 'Recorded by teacher approval.';
      if (method === 'manual') return 'Manually marked present by faculty.';
      return 'Attendance submitted.';
    }

    if (status === 'late') {
      if (method === 'qr') return 'Submitted through QR scan after the late threshold.';
      if (method === 'code') return 'Submitted through session code after the late threshold.';
      if (method === 'teacher_assisted') return 'Approved by faculty after the late threshold.';
      if (method === 'manual') return 'Manually marked late by faculty.';
      return 'Submitted after the late threshold.';
    }

    if (status === 'absent') {
      return 'Auto-marked absent because no attendance was submitted before the session ended.';
    }

    if (status === 'excused') {
      return 'Marked as excused.';
    }

    return '—';
  }

  private openPrintableReport(autoPrint: boolean): void {
    const reportWindow = window.open('', '_blank', 'width=1200,height=900');

    if (!reportWindow) {
      Swal.fire({
        icon: 'warning',
        title: 'Pop-up blocked',
        text: 'Please allow pop-ups to export or print the report.',
        confirmButtonText: 'OK',
      });
      return;
    }

    const generatedDate = new Date().toLocaleString();
    const preparedBy = this.getPreparedByName();

    const detailRows = this.filteredDetailedRecords
      .map(
        (row) => `
          <tr>
            <td>${this.escapeHtml(row.monthLabel)}</td>
            <td>${this.escapeHtml(row.studentName)}</td>
            <td>${this.escapeHtml(row.studentNo)}</td>
            <td>${this.escapeHtml(row.program)}</td>
            <td>${this.escapeHtml(row.section)}</td>
            <td>${this.escapeHtml(row.subject)}</td>
            <td>${this.escapeHtml(this.getStatusLabel(row.status))}</td>
            <td>${this.escapeHtml(this.getMethodLabel(row.method))}</td>
            <td>${this.escapeHtml(this.formatDateTime(row.timeRecorded))}</td>
            <td>${this.escapeHtml(row.remarks || '—')}</td>
          </tr>
        `,
      )
      .join('');

    reportWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>SAMS Faculty Attendance Report</title>
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
              line-height: 1.7;
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
              .section { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="report-header">
            <div class="brand">
              <h1>SAMS</h1>
              <p>Student Attendance Monitoring System</p>
              <p>Faculty Attendance Monitoring Report</p>
            </div>
            <div class="report-title">
              <h2>Attendance Report</h2>
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
            <strong>Applied Filters:</strong><br>
            Year: ${this.escapeHtml(this.selectedYear || 'All Years')} |
            Month: ${this.escapeHtml(this.selectedMonthLabel)} |
            Program: ${this.escapeHtml(this.selectedProgram || 'All Programs')} |
            Subject: ${this.escapeHtml(this.selectedSubject || 'All Subjects')} |
            Section: ${this.escapeHtml(this.selectedSection || 'All Sections')} |
            Status: ${this.escapeHtml(this.selectedStatus ? this.getStatusLabel(this.selectedStatus) : 'All Status')}
          </div>

          <div class="section">
            <h3>Detailed Attendance Records</h3>
            ${
              detailRows
                ? `
                  <table>
                    <thead>
                      <tr>
                        <th>Month</th><th>Student</th><th>Student No.</th><th>Program</th>
                        <th>Section</th><th>Subject</th><th>Status</th><th>Method</th>
                        <th>Time</th><th>Remarks</th>
                      </tr>
                    </thead>
                    <tbody>${detailRows}</tbody>
                  </table>
                `
                : `<div class="empty">No detailed attendance records available.</div>`
            }
          </div>

          <div class="footer">
            <div><div class="signature-line">Prepared By</div></div>
            <div><div class="signature-line">Reviewed / Approved By</div></div>
          </div>

          ${autoPrint ? `<script>window.onload = function () { window.print(); };</script>` : ''}
        </body>
      </html>
    `);

    reportWindow.document.close();
  }

  private getMonthKey(value: unknown): string {
    const dateOnly = this.getDateOnly(value);

    if (!dateOnly) return '';

    return dateOnly.slice(0, 7);
  }

  private getMonthLabel(monthKey: string): string {
    if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
      return 'No Date';
    }

    const [year, month] = monthKey.split('-');
    const monthLabel = this.months.find((item) => item.value === month)?.label || month;

    return `${monthLabel} ${year}`;
  }

  private getDateOnly(value: unknown): string {
    const text = String(value || '');

    if (!text) return '';

    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      return text.slice(0, 10);
    }

    const date = new Date(text);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return this.toInputDate(date);
  }

  private toInputDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private normalizeSearch(value: unknown): string {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  private normalizeText(value: unknown): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private escapeHtml(value: unknown): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
