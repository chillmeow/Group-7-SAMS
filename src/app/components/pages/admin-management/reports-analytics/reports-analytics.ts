import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, from, of } from 'rxjs';
import { catchError, take } from 'rxjs/operators';
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore';

import { db } from '../../../../firebase.config';
import { AttendanceService } from '../../../../services/attendance.service';
import { StudentService } from '../../../../services/student.service';
import { TeacherService } from '../../../../services/teacher.service';
import { ParentService } from '../../../../services/parent.service';
import { SectionService } from '../../../../services/section.service';
import { AlertService } from '../../../../services/alert.service';

import { AttendanceRecord, AttendanceStatus } from '../../../../models/attendance-record.model';
import { AttendanceSession } from '../../../../models/attendance-session.model';
import { Student } from '../../../../models/student.model';
import { Teacher } from '../../../../models/teacher.model';
import { Parent } from '../../../../models/parent.model';
import { Section } from '../../../../models/section.model';

type ReportRange = 'today' | 'week' | 'month' | 'year' | 'custom';
type GeneratedReportView = 'active' | 'archived';
type GeneratedReportStatus = 'active' | 'archived';
type CleanupMode = 'olderThanYears' | 'customRange';
type CleanupScope = 'attendanceOnly' | 'sessionsOnly' | 'attendanceAndSessions';
type SummaryTone = 'blue' | 'green' | 'orange' | 'red' | 'purple';

interface ReportSummaryCard {
  label: string;
  value: string | number;
  icon: string;
  tone: SummaryTone;
}

interface StatusMetric {
  status: AttendanceStatus;
  label: string;
  count: number;
  rate: number;
  tone: SummaryTone;
}

interface TrendPoint {
  label: string;
  total: number;
  attended: number;
  rate: number;
}

interface SectionAnalytics {
  sectionKey: string;
  sectionName: string;
  program: string;
  yearLevel: string;
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  attendanceRate: number;
}

interface ProgramAnalytics {
  program: string;
  total: number;
  attended: number;
  attendanceRate: number;
}

interface MethodAnalytics {
  method: string;
  label: string;
  count: number;
  rate: number;
}

interface RiskStudent {
  studentId: string;
  studentNumber: string;
  studentName: string;
  program: string;
  section: string;
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  attendanceRate: number;
  riskLevel: 'High' | 'Moderate' | 'Low';
}

interface CleanupPreview {
  attendanceRecords: AttendanceRecord[];
  sessions: AttendanceSession[];
  earliestDate: string;
  latestDate: string;
}

interface GeneratedAdminReport {
  id?: string;
  title: string;
  reportType: ReportRange;
  reportTypeLabel: string;
  dateRangeLabel: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  generatedBy: string;
  status: GeneratedReportStatus;
  isArchived?: boolean;
  archivedAt?: string;
  totalRecords: number;
  totalSessions: number;
  attendanceRate: number;
  absenceRate: number;
  lateRate: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  activeStudents: number;
  activeTeachers: number;
  activeParents: number;
  activeSections: number;
  sectionBreakdown: SectionAnalytics[];
  methodBreakdown: MethodAnalytics[];
  riskStudents: Array<{
    studentNumber: string;
    studentName: string;
    program: string;
    section: string;
    absent: number;
    late: number;
    attendanceRate: number;
    riskLevel: 'High' | 'Moderate' | 'Low';
  }>;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface GeneratedReportGroup {
  label: string;
  reports: GeneratedAdminReport[];
}

@Component({
  selector: 'app-reports-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports-analytics.html',
  styleUrl: './reports-analytics.scss',
})
export class ReportsAnalytics implements OnInit {
  private readonly attendanceService = inject(AttendanceService);
  private readonly studentService = inject(StudentService);
  private readonly teacherService = inject(TeacherService);
  private readonly parentService = inject(ParentService);
  private readonly sectionService = inject(SectionService);
  private readonly alert = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly generatedReportsCollectionName = 'adminGeneratedReports';

  isLoading = false;
  isExporting = false;
  isReportSaving = false;
  processingGeneratedReportId = '';

  // Kept for compatibility with the current old HTML until you paste the new HTML next.
  isCleanupPreviewing = false;
  isCleaning = false;
  cleanupMode: CleanupMode = 'olderThanYears';
  cleanupScope: CleanupScope = 'attendanceAndSessions';
  cleanupOlderThanYears = 3;
  cleanupCustomStartDate = '';
  cleanupCustomEndDate = '';
  cleanupConfirmed = false;
  cleanupPreview: CleanupPreview | null = null;

  records: AttendanceRecord[] = [];
  sessions: AttendanceSession[] = [];
  students: Student[] = [];
  teachers: Teacher[] = [];
  parents: Parent[] = [];
  sections: Section[] = [];
  generatedReports: GeneratedAdminReport[] = [];

  filteredRecords: AttendanceRecord[] = [];
  filteredSessions: AttendanceSession[] = [];

  range: ReportRange = 'month';
  selectedDate = this.toInputDate(new Date());
  selectedMonth = this.toInputMonth(new Date());
  selectedYear = new Date().getFullYear();
  customStartDate = this.toInputDate(this.addDays(new Date(), -30));
  customEndDate = this.toInputDate(new Date());

  reportRecordView: GeneratedReportView = 'active';
  reportRecordSearch = '';

  readonly currentYear = new Date().getFullYear();
  readonly yearOptions = this.buildYearOptions();

  ngOnInit(): void {
    this.loadReports();
  }

  get reportTitle(): string {
    return 'Reports & Analytics';
  }

  get reportSubtitle(): string {
    return `Institutional attendance monitoring for ${this.dateRangeLabel}`;
  }

  get activeDateRange(): { start: Date; end: Date } {
    const now = new Date();

    if (this.range === 'today') {
      const selected = this.parseInputDate(this.selectedDate) || now;
      return { start: this.startOfDay(selected), end: this.endOfDay(selected) };
    }

    if (this.range === 'week') {
      const selected = this.parseInputDate(this.selectedDate) || now;
      return { start: this.startOfWeek(selected), end: this.endOfWeek(selected) };
    }

    if (this.range === 'month') {
      const selected = this.parseInputMonth(this.selectedMonth) || now;
      return {
        start: new Date(selected.getFullYear(), selected.getMonth(), 1, 0, 0, 0, 0),
        end: new Date(selected.getFullYear(), selected.getMonth() + 1, 0, 23, 59, 59, 999),
      };
    }

    if (this.range === 'year') {
      return {
        start: new Date(Number(this.selectedYear), 0, 1, 0, 0, 0, 0),
        end: new Date(Number(this.selectedYear), 11, 31, 23, 59, 59, 999),
      };
    }

    const start = this.parseInputDate(this.customStartDate) || this.addDays(now, -30);
    const end = this.parseInputDate(this.customEndDate) || now;
    return { start: this.startOfDay(start), end: this.endOfDay(end) };
  }

  get dateRangeLabel(): string {
    const { start, end } = this.activeDateRange;

    if (this.range === 'today') {
      return this.formatDate(start);
    }

    if (this.range === 'week') {
      return `${this.formatDate(start)} - ${this.formatDate(end)}`;
    }

    if (this.range === 'month') {
      return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }

    if (this.range === 'year') {
      return String(start.getFullYear());
    }

    return `${this.formatDate(start)} - ${this.formatDate(end)}`;
  }

  get totalRecords(): number {
    return this.filteredRecords.length;
  }

  get totalSessions(): number {
    return this.filteredSessions.length;
  }

  get presentCount(): number {
    return this.countByStatus('present');
  }

  get lateCount(): number {
    return this.countByStatus('late');
  }

  get absentCount(): number {
    return this.countByStatus('absent');
  }

  get excusedCount(): number {
    return this.countByStatus('excused');
  }

  get attendedCount(): number {
    return this.presentCount + this.lateCount + this.excusedCount;
  }

  get attendanceRate(): number {
    return this.totalRecords ? Math.round((this.attendedCount / this.totalRecords) * 100) : 0;
  }

  get absenceRate(): number {
    return this.totalRecords ? Math.round((this.absentCount / this.totalRecords) * 100) : 0;
  }

  get lateRate(): number {
    return this.totalRecords ? Math.round((this.lateCount / this.totalRecords) * 100) : 0;
  }

  get activeStudents(): number {
    return this.students.filter((student) => !this.isInactiveOrArchived(student)).length;
  }

  get activeTeachers(): number {
    return this.teachers.filter((teacher) => !this.isInactiveOrArchived(teacher)).length;
  }

  get activeParents(): number {
    return this.parents.filter((parent) => !this.isInactiveOrArchived(parent)).length;
  }

  get activeSections(): number {
    return this.sections.filter((section) => !this.isInactiveOrArchived(section)).length;
  }

  get activeGeneratedReports(): GeneratedAdminReport[] {
    return this.generatedReports.filter((report) => !this.isArchivedGeneratedReport(report));
  }

  get archivedGeneratedReports(): GeneratedAdminReport[] {
    return this.generatedReports.filter((report) => this.isArchivedGeneratedReport(report));
  }

  get activeGeneratedReportsCount(): number {
    return this.activeGeneratedReports.length;
  }

  get archivedGeneratedReportsCount(): number {
    return this.archivedGeneratedReports.length;
  }

  get canGenerateReportRecord(): boolean {
    return (
      !this.isLoading && !this.isReportSaving && (this.totalRecords > 0 || this.totalSessions > 0)
    );
  }

  get summaryCards(): ReportSummaryCard[] {
    return [
      {
        label: 'Attendance Rate',
        value: `${this.attendanceRate}%`,
        icon: 'pi pi-chart-line',
        tone: this.attendanceRate >= 90 ? 'green' : this.attendanceRate >= 75 ? 'orange' : 'red',
      },
      {
        label: 'Attendance Records',
        value: this.totalRecords,
        icon: 'pi pi-database',
        tone: 'blue',
      },
      {
        label: 'Class Sessions',
        value: this.totalSessions,
        icon: 'pi pi-calendar',
        tone: 'purple',
      },
      {
        label: 'Saved Reports',
        value: this.activeGeneratedReportsCount,
        icon: 'pi pi-folder-open',
        tone: 'green',
      },
    ];
  }

  get statusMetrics(): StatusMetric[] {
    return [
      {
        status: 'present',
        label: 'Present',
        count: this.presentCount,
        rate: this.getRate(this.presentCount, this.totalRecords),
        tone: 'green',
      },
      {
        status: 'late',
        label: 'Late',
        count: this.lateCount,
        rate: this.getRate(this.lateCount, this.totalRecords),
        tone: 'orange',
      },
      {
        status: 'absent',
        label: 'Absent',
        count: this.absentCount,
        rate: this.getRate(this.absentCount, this.totalRecords),
        tone: 'red',
      },
      {
        status: 'excused',
        label: 'Excused',
        count: this.excusedCount,
        rate: this.getRate(this.excusedCount, this.totalRecords),
        tone: 'blue',
      },
    ];
  }

  get institutionalCards(): ReportSummaryCard[] {
    return [
      { label: 'Students', value: this.activeStudents, icon: 'pi pi-users', tone: 'blue' },
      { label: 'Faculty', value: this.activeTeachers, icon: 'pi pi-briefcase', tone: 'purple' },
      { label: 'Parents', value: this.activeParents, icon: 'pi pi-user-plus', tone: 'green' },
      { label: 'Sections', value: this.activeSections, icon: 'pi pi-sitemap', tone: 'orange' },
    ];
  }

  get trendPoints(): TrendPoint[] {
    const groups = new Map<string, AttendanceRecord[]>();

    this.filteredRecords.forEach((record) => {
      const date = this.getRecordDate(record);
      const key = this.getTrendGroupKey(date);
      const existing = groups.get(key) || [];
      existing.push(record);
      groups.set(key, existing);
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, records]) => {
        const total = records.length;
        const attended = records.filter((record) => this.isAttendedStatus(record.status)).length;
        return {
          label: this.getTrendLabel(key),
          total,
          attended,
          rate: total ? Math.round((attended / total) * 100) : 0,
        };
      });
  }

  get trendChartPoints(): string {
    const points = this.trendPoints;

    if (points.length === 0) {
      return '';
    }

    if (points.length === 1) {
      const y = this.getLineY(points[0].rate);
      return `0,${y} 100,${y}`;
    }

    const maxIndex = points.length - 1;
    return points
      .map((point, index) => {
        const x = (index / maxIndex) * 100;
        const y = this.getLineY(point.rate);
        return `${x},${y}`;
      })
      .join(' ');
  }

  get trendAreaPoints(): string {
    return this.trendChartPoints ? `0,100 ${this.trendChartPoints} 100,100` : '';
  }

  get sectionAnalytics(): SectionAnalytics[] {
    const map = new Map<string, SectionAnalytics>();

    this.filteredRecords.forEach((record) => {
      const student = this.findStudent(record.studentId);
      const section = this.findSectionForStudent(student);
      const sectionName = this.getStudentSectionLabel(student, section);
      const program = this.getStudentProgramLabel(student, section);
      const yearLevel = student?.yearLevel || section?.yearLevel || 'No year level';
      const key = this.normalizeKey(section?.id || student?.sectionId || sectionName);

      if (!map.has(key)) {
        map.set(key, {
          sectionKey: key,
          sectionName,
          program,
          yearLevel,
          total: 0,
          present: 0,
          late: 0,
          absent: 0,
          excused: 0,
          attendanceRate: 0,
        });
      }

      const item = map.get(key)!;
      item.total++;

      if (record.status === 'present') item.present++;
      if (record.status === 'late') item.late++;
      if (record.status === 'absent') item.absent++;
      if (record.status === 'excused') item.excused++;
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        attendanceRate: item.total
          ? Math.round(((item.present + item.late + item.excused) / item.total) * 100)
          : 0,
      }))
      .sort((a, b) => b.attendanceRate - a.attendanceRate || b.total - a.total);
  }

  get programAnalytics(): ProgramAnalytics[] {
    const map = new Map<string, ProgramAnalytics>();

    this.filteredRecords.forEach((record) => {
      const student = this.findStudent(record.studentId);
      const section = this.findSectionForStudent(student);
      const program = this.getStudentProgramLabel(student, section);

      if (!map.has(program)) {
        map.set(program, { program, total: 0, attended: 0, attendanceRate: 0 });
      }

      const item = map.get(program)!;
      item.total++;

      if (this.isAttendedStatus(record.status)) {
        item.attended++;
      }
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        attendanceRate: item.total ? Math.round((item.attended / item.total) * 100) : 0,
      }))
      .sort((a, b) => b.attendanceRate - a.attendanceRate);
  }

  get methodAnalytics(): MethodAnalytics[] {
    const map = new Map<string, number>();

    this.filteredRecords.forEach((record) => {
      const key = record.method || 'manual';
      map.set(key, (map.get(key) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([method, count]) => ({
        method,
        label: this.getMethodLabel(method),
        count,
        rate: this.getRate(count, this.totalRecords),
      }))
      .sort((a, b) => b.count - a.count);
  }

  get riskStudents(): RiskStudent[] {
    const map = new Map<string, RiskStudent>();

    this.filteredRecords.forEach((record) => {
      const student = this.findStudent(record.studentId);

      if (!student) {
        return;
      }

      const section = this.findSectionForStudent(student);
      const key = student.id || record.studentId;

      if (!map.has(key)) {
        map.set(key, {
          studentId: key,
          studentNumber: student.studentNumber || 'No student no.',
          studentName: this.getStudentFullName(student),
          program: this.getStudentProgramLabel(student, section),
          section: this.getStudentSectionLabel(student, section),
          total: 0,
          present: 0,
          late: 0,
          absent: 0,
          excused: 0,
          attendanceRate: 0,
          riskLevel: 'Low',
        });
      }

      const item = map.get(key)!;
      item.total++;

      if (record.status === 'present') item.present++;
      if (record.status === 'late') item.late++;
      if (record.status === 'absent') item.absent++;
      if (record.status === 'excused') item.excused++;
    });

    return Array.from(map.values())
      .map((item) => {
        const attendanceRate = item.total
          ? Math.round(((item.present + item.late + item.excused) / item.total) * 100)
          : 0;
        return {
          ...item,
          attendanceRate,
          riskLevel: this.getRiskLevel(attendanceRate, item.absent),
        };
      })
      .filter((item) => item.absent > 0 || item.late > 0 || item.attendanceRate < 90)
      .sort((a, b) => a.attendanceRate - b.attendanceRate || b.absent - a.absent || b.late - a.late)
      .slice(0, 10);
  }

  get topSections(): SectionAnalytics[] {
    return this.sectionAnalytics.slice(0, 6);
  }

  get lowSections(): SectionAnalytics[] {
    return [...this.sectionAnalytics]
      .sort((a, b) => a.attendanceRate - b.attendanceRate || b.absent - a.absent)
      .slice(0, 6);
  }

  get recentRecords(): AttendanceRecord[] {
    return [...this.filteredRecords]
      .sort((a, b) => this.getRecordDate(b).getTime() - this.getRecordDate(a).getTime())
      .slice(0, 8);
  }

  get visibleGeneratedReports(): GeneratedAdminReport[] {
    const source =
      this.reportRecordView === 'archived'
        ? this.archivedGeneratedReports
        : this.activeGeneratedReports;
    const keyword = this.reportRecordSearch.trim().toLowerCase();

    if (!keyword) {
      return source;
    }

    return source.filter((report) =>
      [
        report.title,
        report.reportTypeLabel,
        report.dateRangeLabel,
        report.status,
        report.generatedBy,
        report.notes,
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    );
  }

  get generatedReportGroups(): GeneratedReportGroup[] {
    const groups = new Map<string, GeneratedAdminReport[]>();

    this.visibleGeneratedReports.forEach((report) => {
      const label = this.getGeneratedReportGroupLabel(report);
      const existing = groups.get(label) || [];
      existing.push(report);
      groups.set(label, existing);
    });

    return Array.from(groups.entries()).map(([label, reports]) => ({
      label,
      reports: reports.sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || '')),
    }));
  }

  get cleanupPreviewCount(): number {
    if (!this.cleanupPreview) return 0;
    if (this.cleanupScope === 'attendanceOnly') return this.cleanupPreview.attendanceRecords.length;
    if (this.cleanupScope === 'sessionsOnly') return this.cleanupPreview.sessions.length;
    return this.cleanupPreview.attendanceRecords.length + this.cleanupPreview.sessions.length;
  }

  get canRunCleanup(): boolean {
    return Boolean(this.cleanupPreview && this.cleanupPreviewCount > 0 && this.cleanupConfirmed);
  }

  loadReports(): void {
    this.isLoading = true;

    forkJoin({
      records: this.attendanceService.getRecords().pipe(
        take(1),
        catchError(() => of([] as AttendanceRecord[])),
      ),
      sessions: this.attendanceService.getSessions().pipe(
        take(1),
        catchError(() => of([] as AttendanceSession[])),
      ),
      students: this.studentService.getStudents().pipe(
        take(1),
        catchError(() => of([] as Student[])),
      ),
      teachers: this.teacherService.getTeachers().pipe(
        take(1),
        catchError(() => of([] as Teacher[])),
      ),
      parents: this.parentService.getParents().pipe(
        take(1),
        catchError(() => of([] as Parent[])),
      ),
      sections: this.sectionService.getSections().pipe(
        take(1),
        catchError(() => of([] as Section[])),
      ),
      generatedReports: from(this.fetchGeneratedReports()).pipe(
        catchError(() => of([] as GeneratedAdminReport[])),
      ),
    }).subscribe({
      next: ({ records, sessions, students, teachers, parents, sections, generatedReports }) => {
        this.records = records.filter((record) => record.isValid !== false);
        this.sessions = sessions;
        this.students = students;
        this.teachers = teachers;
        this.parents = parents;
        this.sections = sections;
        this.generatedReports = generatedReports;
        this.applyReportFilters();
        this.cleanupPreview = null;
        this.cleanupConfirmed = false;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.records = [];
        this.sessions = [];
        this.students = [];
        this.teachers = [];
        this.parents = [];
        this.sections = [];
        this.generatedReports = [];
        this.filteredRecords = [];
        this.filteredSessions = [];
        this.isLoading = false;
        this.cdr.detectChanges();
        this.alert.warning(
          'Unable to load reports',
          'Reports and analytics data is currently unavailable. Please try again later.',
        );
      },
    });
  }

  refreshReports(): void {
    this.loadReports();
  }

  onRangeChange(): void {
    this.applyReportFilters();
    this.cleanupPreview = null;
    this.cleanupConfirmed = false;
  }

  applyReportFilters(): void {
    const { start, end } = this.activeDateRange;
    const startTime = start.getTime();
    const endTime = end.getTime();

    this.filteredRecords = this.records.filter((record) => {
      const time = this.getRecordDate(record).getTime();
      return time >= startTime && time <= endTime;
    });

    this.filteredSessions = this.sessions.filter((session) => {
      const time = this.getSessionDate(session).getTime();
      return time >= startTime && time <= endTime;
    });

    this.cdr.detectChanges();
  }

  setReportRecordView(view: GeneratedReportView): void {
    if (this.isReportSaving || this.processingGeneratedReportId) {
      return;
    }

    this.reportRecordView = view;
    this.reportRecordSearch = '';
  }

  generateReportRecord(): void {
    if (!this.canGenerateReportRecord) {
      this.alert.warning(
        'No report data to save',
        'There are no attendance records or sessions in the selected range to generate as a saved report.',
      );
      return;
    }

    this.alert
      .confirm(
        'Generate saved report?',
        `This will save the current ${this.getReportTypeLabel(this.range).toLowerCase()} report for ${this.dateRangeLabel}.`,
      )
      .then(async (confirmed) => {
        if (!confirmed) return;

        this.isReportSaving = true;
        this.cdr.detectChanges();

        try {
          const payload = this.buildGeneratedReportPayload();
          await addDoc(collection(db, this.generatedReportsCollectionName), payload);
          this.alert.success(
            'Report generated',
            `${payload.title} was saved under Generated Report Records.`,
          );
          await this.reloadGeneratedReportsOnly();
        } catch (error) {
          this.alert.warning(
            'Report generation failed',
            error instanceof Error ? error.message : 'Unable to save the generated report record.',
          );
        } finally {
          this.isReportSaving = false;
          this.cdr.detectChanges();
        }
      });
  }

  archiveGeneratedReport(report: GeneratedAdminReport): void {
    if (!report.id || this.processingGeneratedReportId) return;

    this.alert
      .confirm(
        'Archive generated report?',
        `${report.title} will be moved to the report archive. The original attendance records will not be deleted.`,
      )
      .then(async (confirmed) => {
        if (!confirmed || !report.id) return;

        this.processingGeneratedReportId = report.id;
        this.cdr.detectChanges();

        try {
          const now = new Date().toISOString();
          await updateDoc(doc(db, this.generatedReportsCollectionName, report.id), {
            status: 'archived',
            isArchived: true,
            archivedAt: now,
            updatedAt: now,
          });
          this.alert.success('Report archived', `${report.title} was moved to Archive.`);
          await this.reloadGeneratedReportsOnly();
        } catch (error) {
          this.alert.warning(
            'Unable to archive report',
            error instanceof Error ? error.message : 'Please try again.',
          );
        } finally {
          this.processingGeneratedReportId = '';
          this.cdr.detectChanges();
        }
      });
  }

  restoreGeneratedReport(report: GeneratedAdminReport): void {
    if (!report.id || this.processingGeneratedReportId) return;

    this.alert
      .confirm('Restore generated report?', `${report.title} will return to Active Reports.`)
      .then(async (confirmed) => {
        if (!confirmed || !report.id) return;

        this.processingGeneratedReportId = report.id;
        this.cdr.detectChanges();

        try {
          const now = new Date().toISOString();
          await updateDoc(doc(db, this.generatedReportsCollectionName, report.id), {
            status: 'active',
            isArchived: false,
            archivedAt: '',
            updatedAt: now,
          });
          this.alert.success('Report restored', `${report.title} was restored to Active Reports.`);
          await this.reloadGeneratedReportsOnly();
        } catch (error) {
          this.alert.warning(
            'Unable to restore report',
            error instanceof Error ? error.message : 'Please try again.',
          );
        } finally {
          this.processingGeneratedReportId = '';
          this.cdr.detectChanges();
        }
      });
  }

  deleteGeneratedReportPermanently(report: GeneratedAdminReport): void {
    if (!report.id || this.processingGeneratedReportId) return;

    if (!this.isArchivedGeneratedReport(report)) {
      this.alert.warning(
        'Archive first',
        'Generated reports must be archived before they can be permanently deleted.',
      );
      return;
    }

    this.alert
      .confirm(
        'Delete generated report permanently?',
        `${report.title} will be permanently deleted from generated report records. This does not delete attendance records.`,
      )
      .then(async (confirmed) => {
        if (!confirmed || !report.id) return;

        this.processingGeneratedReportId = report.id;
        this.cdr.detectChanges();

        try {
          await deleteDoc(doc(db, this.generatedReportsCollectionName, report.id));
          this.alert.success('Report deleted', `${report.title} was permanently deleted.`);
          await this.reloadGeneratedReportsOnly();
        } catch (error) {
          this.alert.warning(
            'Unable to delete report',
            error instanceof Error ? error.message : 'Please try again.',
          );
        } finally {
          this.processingGeneratedReportId = '';
          this.cdr.detectChanges();
        }
      });
  }

  exportCsv(): void {
    if (!this.filteredRecords.length) {
      this.alert.warning('No records to export', 'There are no attendance records in this range.');
      return;
    }

    this.isExporting = true;

    const rows = this.filteredRecords.map((record) => {
      const student = this.findStudent(record.studentId);
      const section = this.findSectionForStudent(student);
      const session = this.findSession(record.sessionId);

      return {
        Date: this.formatDate(this.getRecordDate(record)),
        Time: this.formatTime(this.getRecordDate(record)),
        StudentNumber: student?.studentNumber || record.studentId,
        StudentName: student ? this.getStudentFullName(student) : 'Unknown Student',
        Program: this.getStudentProgramLabel(student, section),
        Section: this.getStudentSectionLabel(student, section),
        Status: this.getStatusLabel(record.status),
        Method: this.getMethodLabel(record.method),
        SessionCode: session?.sessionCode || '',
        Remarks: record.remarks || '',
      };
    });

    const csv = this.convertToCsv(rows);
    const fileName = `SAMS_Admin_Report_${this.dateRangeLabel.replace(/[^a-z0-9]/gi, '_')}.csv`;

    this.downloadTextFile(fileName, csv, 'text/csv;charset=utf-8;');
    this.isExporting = false;
    this.alert.success('Report exported', 'The attendance report CSV file was generated.');
  }

  exportGeneratedReport(report: GeneratedAdminReport): void {
    const rows = [
      {
        Title: report.title,
        Type: report.reportTypeLabel,
        Range: report.dateRangeLabel,
        GeneratedAt: this.formatDateTime(new Date(report.generatedAt)),
        AttendanceRate: `${report.attendanceRate}%`,
        AbsenceRate: `${report.absenceRate}%`,
        LateRate: `${report.lateRate}%`,
        TotalRecords: report.totalRecords,
        TotalSessions: report.totalSessions,
        Present: report.presentCount,
        Late: report.lateCount,
        Absent: report.absentCount,
        Excused: report.excusedCount,
        ActiveStudents: report.activeStudents,
        ActiveFaculty: report.activeTeachers,
        ActiveParents: report.activeParents,
        ActiveSections: report.activeSections,
      },
    ];

    const csv = this.convertToCsv(rows);
    const fileName = `${report.title.replace(/[^a-z0-9]/gi, '_')}.csv`;
    this.downloadTextFile(fileName, csv, 'text/csv;charset=utf-8;');
    this.alert.success('Saved report exported', 'The generated report snapshot was exported.');
  }

  printReport(): void {
    window.print();
  }

  previewCleanup(): void {
    this.alert.info(
      'Use Generated Report Records',
      'For safety, old reports should be archived as generated report records instead of deleting raw attendance data during defense preparation.',
    );
  }

  executeCleanup(): void {
    this.alert.warning(
      'Raw data cleanup disabled',
      'To avoid accidental loss of attendance history, raw attendance cleanup is disabled in this safer reports version.',
    );
  }

  getStatusLabel(status: string | undefined): string {
    const normalized = this.normalizeText(status);
    if (normalized === 'present') return 'Present';
    if (normalized === 'late') return 'Late';
    if (normalized === 'absent') return 'Absent';
    if (normalized === 'excused') return 'Excused';
    return 'Unknown';
  }

  getStatusClass(status: string | undefined): string {
    const normalized = this.normalizeText(status);
    if (normalized === 'present') return 'present';
    if (normalized === 'late') return 'late';
    if (normalized === 'absent') return 'absent';
    if (normalized === 'excused') return 'excused';
    return 'neutral';
  }

  getMethodLabel(method: string | undefined): string {
    const normalized = this.normalizeText(method);
    if (normalized === 'qr') return 'QR Scan';
    if (normalized === 'code') return 'Session Code';
    if (normalized === 'manual') return 'Manual';
    if (normalized === 'teacher_assisted') return 'Teacher Assisted';
    if (normalized === 'imported_excel') return 'Excel Import';
    if (normalized === 'imported_image') return 'Image Import';
    return 'Other';
  }

  getRecordStudentName(record: AttendanceRecord): string {
    const student = this.findStudent(record.studentId);
    return student ? this.getStudentFullName(student) : 'Unknown Student';
  }

  getRecordStudentNumber(record: AttendanceRecord): string {
    const student = this.findStudent(record.studentId);
    return student?.studentNumber || record.studentId;
  }

  getRecordSection(record: AttendanceRecord): string {
    const student = this.findStudent(record.studentId);
    const section = this.findSectionForStudent(student);
    return this.getStudentSectionLabel(student, section);
  }

  getRecordDateLabel(record: AttendanceRecord): string {
    return this.formatDate(this.getRecordDate(record));
  }

  getRecordTimeLabel(record: AttendanceRecord): string {
    return this.formatTime(this.getRecordDate(record));
  }

  getBarWidth(value: number): string {
    return `${Math.max(0, Math.min(100, value))}%`;
  }

  getChartHeight(value: number): string {
    const safeValue = Math.max(0, Math.min(100, value));
    return `${Math.max(8, safeValue)}%`;
  }

  getProgramCode(program: string): string {
    const normalized = this.normalizeText(program);
    if (normalized.includes('information technology')) return 'IT';
    if (normalized.includes('technology communication management')) return 'TCM';
    if (normalized.includes('electro-mechanical technology')) return 'EMT';

    return program
      .split(/\s+/)
      .map((word) => word.charAt(0))
      .join('')
      .slice(0, 4)
      .toUpperCase();
  }

  getGeneratedReportStatusClass(report: GeneratedAdminReport): string {
    return this.isArchivedGeneratedReport(report) ? 'archived' : 'active';
  }

  getGeneratedReportDateLabel(report: GeneratedAdminReport): string {
    return this.formatDateTime(new Date(report.generatedAt || ''));
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByRecord(index: number, record: AttendanceRecord): string | number {
    return record.id || `${record.sessionId}-${record.studentId}-${index}`;
  }

  trackBySection(index: number, section: SectionAnalytics): string {
    return section.sectionKey || `${section.sectionName}-${index}`;
  }

  trackByProgram(index: number, program: ProgramAnalytics): string {
    return program.program || String(index);
  }

  trackByRiskStudent(index: number, student: RiskStudent): string {
    return student.studentId || String(index);
  }

  trackByTrend(index: number, point: TrendPoint): string {
    return `${point.label}-${index}`;
  }

  trackByGeneratedReport(index: number, report: GeneratedAdminReport): string {
    return report.id || `${report.title}-${index}`;
  }

  trackByGeneratedReportGroup(index: number, group: GeneratedReportGroup): string {
    return group.label || String(index);
  }

  private async fetchGeneratedReports(): Promise<GeneratedAdminReport[]> {
    const snapshot = await getDocs(collection(db, this.generatedReportsCollectionName));
    return snapshot.docs
      .map((docSnap) => this.mapGeneratedReport(docSnap.id, docSnap.data()))
      .sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || ''));
  }

  private async reloadGeneratedReportsOnly(): Promise<void> {
    this.generatedReports = await this.fetchGeneratedReports();
    this.cdr.detectChanges();
  }

  private buildGeneratedReportPayload(): Omit<GeneratedAdminReport, 'id'> {
    const now = new Date().toISOString();
    const { start, end } = this.activeDateRange;
    const reportTypeLabel = this.getReportTypeLabel(this.range);

    return {
      title: `${reportTypeLabel} Report - ${this.dateRangeLabel}`,
      reportType: this.range,
      reportTypeLabel,
      dateRangeLabel: this.dateRangeLabel,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      generatedAt: now,
      generatedBy: 'Admin',
      status: 'active',
      isArchived: false,
      archivedAt: '',
      totalRecords: this.totalRecords,
      totalSessions: this.totalSessions,
      attendanceRate: this.attendanceRate,
      absenceRate: this.absenceRate,
      lateRate: this.lateRate,
      presentCount: this.presentCount,
      lateCount: this.lateCount,
      absentCount: this.absentCount,
      excusedCount: this.excusedCount,
      activeStudents: this.activeStudents,
      activeTeachers: this.activeTeachers,
      activeParents: this.activeParents,
      activeSections: this.activeSections,
      sectionBreakdown: this.sectionAnalytics.slice(0, 20),
      methodBreakdown: this.methodAnalytics,
      riskStudents: this.riskStudents.slice(0, 20).map((student) => ({
        studentNumber: student.studentNumber,
        studentName: student.studentName,
        program: student.program,
        section: student.section,
        absent: student.absent,
        late: student.late,
        attendanceRate: student.attendanceRate,
        riskLevel: student.riskLevel,
      })),
      notes:
        'Generated by the Admin Reports & Analytics module. This is a report snapshot and does not replace the original attendance records.',
      createdAt: now,
      updatedAt: now,
    };
  }

  private mapGeneratedReport(id: string, data: any): GeneratedAdminReport {
    const status: GeneratedReportStatus =
      data?.isArchived === true || data?.status === 'archived' ? 'archived' : 'active';

    return {
      id,
      title: String(data?.title || 'Generated Report'),
      reportType: (data?.reportType || 'custom') as ReportRange,
      reportTypeLabel: String(data?.reportTypeLabel || this.getReportTypeLabel(data?.reportType)),
      dateRangeLabel: String(data?.dateRangeLabel || 'No date range'),
      startDate: String(data?.startDate || ''),
      endDate: String(data?.endDate || ''),
      generatedAt: String(data?.generatedAt || data?.createdAt || ''),
      generatedBy: String(data?.generatedBy || 'Admin'),
      status,
      isArchived: status === 'archived',
      archivedAt: String(data?.archivedAt || ''),
      totalRecords: Number(data?.totalRecords || 0),
      totalSessions: Number(data?.totalSessions || 0),
      attendanceRate: Number(data?.attendanceRate || 0),
      absenceRate: Number(data?.absenceRate || 0),
      lateRate: Number(data?.lateRate || 0),
      presentCount: Number(data?.presentCount || 0),
      lateCount: Number(data?.lateCount || 0),
      absentCount: Number(data?.absentCount || 0),
      excusedCount: Number(data?.excusedCount || 0),
      activeStudents: Number(data?.activeStudents || 0),
      activeTeachers: Number(data?.activeTeachers || 0),
      activeParents: Number(data?.activeParents || 0),
      activeSections: Number(data?.activeSections || 0),
      sectionBreakdown: Array.isArray(data?.sectionBreakdown) ? data.sectionBreakdown : [],
      methodBreakdown: Array.isArray(data?.methodBreakdown) ? data.methodBreakdown : [],
      riskStudents: Array.isArray(data?.riskStudents) ? data.riskStudents : [],
      notes: String(data?.notes || ''),
      createdAt: String(data?.createdAt || ''),
      updatedAt: String(data?.updatedAt || ''),
    };
  }

  private isArchivedGeneratedReport(report: GeneratedAdminReport): boolean {
    return report.isArchived === true || report.status === 'archived';
  }

  private getReportTypeLabel(type: ReportRange | string | undefined): string {
    if (type === 'today') return 'Daily';
    if (type === 'week') return 'Weekly';
    if (type === 'month') return 'Monthly';
    if (type === 'year') return 'Yearly';
    return 'Custom';
  }

  private getGeneratedReportGroupLabel(report: GeneratedAdminReport): string {
    const start = new Date(report.startDate || report.generatedAt || '');

    if (Number.isNaN(start.getTime())) {
      return 'Unsorted Reports';
    }

    if (report.reportType === 'year') {
      return `Year ${start.getFullYear()}`;
    }

    return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  private countByStatus(status: AttendanceStatus): number {
    return this.filteredRecords.filter((record) => record.status === status).length;
  }

  private getRate(value: number, total: number): number {
    return total ? Math.round((value / total) * 100) : 0;
  }

  private isAttendedStatus(status: AttendanceStatus): boolean {
    return status === 'present' || status === 'late' || status === 'excused';
  }

  private getRecordDate(record: AttendanceRecord): Date {
    const date = new Date(record.timeRecorded || '');

    if (!Number.isNaN(date.getTime())) {
      return date;
    }

    const session = this.findSession(record.sessionId);
    return this.getSessionDate(session);
  }

  private getSessionDate(session: AttendanceSession | undefined): Date {
    if (!session) {
      return new Date(0);
    }

    const startTime = new Date(session.startTime || '');
    if (!Number.isNaN(startTime.getTime())) return startTime;

    const date = new Date(session.date || '');
    if (!Number.isNaN(date.getTime())) return date;

    const createdAt = new Date(session.createdAt || '');
    if (!Number.isNaN(createdAt.getTime())) return createdAt;

    return new Date(0);
  }

  private getTrendGroupKey(date: Date): string {
    if (this.range === 'year') {
      return `${date.getFullYear()}-${this.pad(date.getMonth() + 1)}`;
    }

    return this.toInputDate(date);
  }

  private getTrendLabel(key: string): string {
    if (this.range === 'year') {
      const [year, month] = key.split('-').map(Number);
      return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short' });
    }

    const date = this.parseInputDate(key);
    return date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : key;
  }

  private getLineY(rate: number): number {
    return 100 - Math.max(0, Math.min(100, rate));
  }

  private findStudent(studentId: string): Student | undefined {
    const normalized = this.normalizeKey(studentId);
    return this.students.find(
      (student) =>
        this.normalizeKey(student.id) === normalized ||
        this.normalizeKey(student.studentNumber) === normalized,
    );
  }

  private findSession(sessionId: string): AttendanceSession | undefined {
    const normalized = this.normalizeKey(sessionId);
    return this.sessions.find((session) => this.normalizeKey(session.id) === normalized);
  }

  private findSectionForStudent(student: Student | undefined): Section | undefined {
    if (!student) return undefined;

    const studentSection = this.normalizeKey(student.sectionId);
    const studentSectionName = this.normalizeKey((student as any).sectionName);
    const studentSectionCode = this.normalizeKey((student as any).section);

    return this.sections.find((section) => {
      const sectionId = this.normalizeKey(section.id);
      const sectionCode = this.normalizeKey(section.sectionCode);
      const sectionName = this.normalizeKey(section.sectionName);
      const displayName = this.normalizeKey(this.getSectionDisplayName(section));

      return (
        sectionId === studentSection ||
        sectionCode === studentSection ||
        sectionName === studentSection ||
        displayName === studentSection ||
        sectionName === studentSectionName ||
        sectionCode === studentSectionCode ||
        displayName.endsWith(studentSection)
      );
    });
  }

  private getStudentFullName(student: Student): string {
    return `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unnamed Student';
  }

  private getStudentProgramLabel(
    student: Student | undefined,
    section: Section | undefined,
  ): string {
    const legacyStudent = student as
      | (Student & {
          programName?: string;
          course?: string;
          courseName?: string;
          academicProgram?: string;
          department?: string;
        })
      | undefined;

    return (
      student?.program ||
      legacyStudent?.programName ||
      legacyStudent?.course ||
      legacyStudent?.courseName ||
      legacyStudent?.academicProgram ||
      legacyStudent?.department ||
      section?.program ||
      this.inferProgramFromSection(student?.sectionId || section?.sectionName || '') ||
      'No program'
    );
  }

  private getStudentSectionLabel(
    student: Student | undefined,
    section: Section | undefined,
  ): string {
    return section ? this.getSectionDisplayName(section) : student?.sectionId || 'No section';
  }

  private getSectionDisplayName(section: Section): string {
    const programCode = this.getProgramCode(section.program || '');
    const yearCode = this.getYearNumber(section.yearLevel);
    const sectionName = section.sectionName || '';

    if (!programCode && !yearCode && !sectionName) {
      return section.sectionCode || 'Unnamed Section';
    }

    return `${programCode}${yearCode}-${sectionName}`.replace(/^-|-$/g, '');
  }

  private getYearNumber(yearLevel: string | undefined): string {
    const value = String(yearLevel || '');
    if (value.includes('1')) return '1';
    if (value.includes('2')) return '2';
    if (value.includes('3')) return '3';
    if (value.includes('4')) return '4';
    return '';
  }

  private inferProgramFromSection(sectionValue: string): string {
    const section = String(sectionValue || '').toUpperCase();
    if (section.includes('BSIT') || section.includes('IT-') || section.startsWith('IT')) {
      return 'Information Technology';
    }
    if (section.includes('TCM') || section.includes('BSTCM')) {
      return 'Technology Communication Management';
    }
    if (section.includes('EMT') || section.includes('BSEMT')) {
      return 'Electro-Mechanical Technology';
    }
    return '';
  }

  private getRiskLevel(rate: number, absences: number): 'High' | 'Moderate' | 'Low' {
    if (rate < 75 || absences >= 5) return 'High';
    if (rate < 90 || absences >= 2) return 'Moderate';
    return 'Low';
  }

  private isInactiveOrArchived(value: { status?: string; isArchived?: boolean }): boolean {
    const status = this.normalizeText(value.status);
    return value.isArchived === true || status === 'inactive' || status === 'archived';
  }

  private convertToCsv(rows: Record<string, string | number>[]): string {
    if (!rows.length) return '';

    const headers = Object.keys(rows[0]);
    const escapeCell = (value: string | number): string => {
      const text = String(value ?? '').replace(/"/g, '""');
      return `"${text}"`;
    };

    const body = rows.map((row) => headers.map((header) => escapeCell(row[header])).join(','));
    return [headers.join(','), ...body].join('\n');
  }

  private downloadTextFile(fileName: string, content: string, type: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  private formatDateTime(date: Date): string {
    if (Number.isNaN(date.getTime())) {
      return 'Not available';
    }

    return `${this.formatDate(date)} ${this.formatTime(date)}`;
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  private endOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  }

  private startOfWeek(date: Date): Date {
    const copy = this.startOfDay(date);
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    return copy;
  }

  private endOfWeek(date: Date): Date {
    const start = this.startOfWeek(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return this.endOfDay(end);
  }

  private addDays(date: Date, days: number): Date {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  private toInputDate(date: Date): string {
    return `${date.getFullYear()}-${this.pad(date.getMonth() + 1)}-${this.pad(date.getDate())}`;
  }

  private toInputMonth(date: Date): string {
    return `${date.getFullYear()}-${this.pad(date.getMonth() + 1)}`;
  }

  private parseInputDate(value: string): Date | null {
    if (!value) return null;

    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;

    return new Date(year, month - 1, day);
  }

  private parseInputMonth(value: string): Date | null {
    if (!value) return null;

    const [year, month] = value.split('-').map(Number);
    if (!year || !month) return null;

    return new Date(year, month - 1, 1);
  }

  private pad(value: number): string {
    return String(value).padStart(2, '0');
  }

  private buildYearOptions(): number[] {
    const current = new Date().getFullYear();
    const years: number[] = [];

    for (let year = current + 1; year >= current - 8; year--) {
      years.push(year);
    }

    return years;
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLowerCase();
  }

  private normalizeKey(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }
}
