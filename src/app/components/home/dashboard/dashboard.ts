import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  Inject,
  NgZone,
  OnInit,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';

import { AuthService } from '../../../services/auth.service';
import { ApiService } from '../../../services/api.service';
import { User, UserRole } from '../../../models/user.model';

interface DashboardStat {
  label: string;
  value: string;
  subtitle: string;
  icon: string;
  tone: 'blue' | 'green' | 'orange' | 'purple';
}

interface DashboardCard {
  title: string;
  purpose: string;
  date: string;
  status: string;
  route: string;
  tone: 'warning' | 'success' | 'danger' | 'info';
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly apiService = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  currentUser: User | null = null;
  currentRole: UserRole | null = null;

  isLoading = false;
  errorMessage = '';

  displayName = 'User';
  roleLabel = 'Portal';

  stats: DashboardStat[] = [];
  cards: DashboardCard[] = [];

  private students: any[] = [];
  private teachers: any[] = [];
  private parents: any[] = [];
  private sections: any[] = [];
  private subjects: any[] = [];
  private attendance: any[] = [];
  private sessions: any[] = [];
  private offerings: any[] = [];

  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.currentRole = this.authService.getUserRole();
    this.displayName = this.currentUser?.firstName || 'User';
    this.roleLabel = this.getRoleLabel(this.currentRole);

    if (!isPlatformBrowser(this.platformId)) return;

    this.loadDashboard();
  }

  loadDashboard(): void {
    this.zone.run(() => {
      this.isLoading = true;
      this.errorMessage = '';
      this.cdr.detectChanges();
    });

    forkJoin({
      students: this.apiService.getStudents().pipe(take(1)),
      teachers: this.apiService.getTeachers().pipe(take(1)),
      parents: this.apiService.getParents().pipe(take(1)),
      sections: this.apiService.getSections().pipe(take(1)),
      subjects: this.apiService.getSubjects().pipe(take(1)),
      attendance: this.apiService.getAttendance().pipe(take(1)),
      sessions: this.apiService.getSessions().pipe(take(1)),
      offerings: this.apiService.getClassOfferings().pipe(take(1)),
    }).subscribe({
      next: ({
        students,
        teachers,
        parents,
        sections,
        subjects,
        attendance,
        sessions,
        offerings,
      }) => {
        this.zone.run(() => {
          this.students = students || [];
          this.teachers = teachers || [];
          this.parents = parents || [];
          this.sections = sections || [];
          this.subjects = subjects || [];
          this.attendance = attendance || [];
          this.sessions = sessions || [];
          this.offerings = offerings || [];

          this.buildDashboard();

          this.isLoading = false;
          this.cdr.detectChanges();
        });
      },
      error: (error) => {
        this.zone.run(() => {
          console.error('DASHBOARD LOAD ERROR:', error);
          this.errorMessage = 'Unable to load dashboard data. Please refresh the page.';
          this.isLoading = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  trackByStat(index: number, stat: DashboardStat): string {
    return `${stat.label}-${index}`;
  }

  trackByCard(index: number, card: DashboardCard): string {
    return `${card.title}-${index}`;
  }

  private buildDashboard(): void {
    if (this.currentRole === 'admin') {
      this.buildAdminDashboard();
      return;
    }

    if (this.currentRole === 'teacher') {
      this.buildTeacherDashboard();
      return;
    }

    if (this.currentRole === 'student') {
      this.buildStudentDashboard();
      return;
    }

    if (this.currentRole === 'parent') {
      this.buildParentDashboard();
      return;
    }

    this.stats = [];
    this.cards = [];
  }

  private buildAdminDashboard(): void {
    const today = this.getTodayString();

    const todaySessions = this.sessions.filter((session) => session.date === today);

    const todayAttendance = this.attendance.filter((record) =>
      todaySessions.some((session) => String(session.id) === String(record.sessionId)),
    );

    const activeSessions = this.sessions.filter(
      (session) => String(session.status || '').toLowerCase() === 'active',
    );

    const lateToday = todayAttendance.filter(
      (record) => String(record.status || '').toLowerCase() === 'late',
    ).length;

    const absentToday = todayAttendance.filter(
      (record) => String(record.status || '').toLowerCase() === 'absent',
    ).length;

    this.stats = [
      {
        label: 'Total Students',
        value: `${this.students.length}`,
        subtitle: 'Registered students',
        icon: 'pi pi-users',
        tone: 'blue',
      },
      {
        label: 'Total Teachers',
        value: `${this.teachers.length}`,
        subtitle: 'Faculty members',
        icon: 'pi pi-briefcase',
        tone: 'green',
      },
      {
        label: 'Total Parents',
        value: `${this.parents.length}`,
        subtitle: 'Parent accounts',
        icon: 'pi pi-user-plus',
        tone: 'orange',
      },
      {
        label: 'Attendance Today',
        value: `${todayAttendance.length}`,
        subtitle: 'Records logged today',
        icon: 'pi pi-calendar',
        tone: 'purple',
      },
    ];

    this.cards = [
      {
        title: 'Students',
        purpose: `${this.students.length} student record(s) registered`,
        date: this.formatToday(),
        status: 'OPEN',
        route: '/students',
        tone: 'info',
      },
      {
        title: 'Teachers',
        purpose: `${this.teachers.length} faculty record(s) registered`,
        date: this.formatToday(),
        status: 'OPEN',
        route: '/teachers',
        tone: 'info',
      },
      {
        title: 'Parents',
        purpose: `${this.parents.length} parent account(s) registered`,
        date: this.formatToday(),
        status: 'OPEN',
        route: '/parents',
        tone: 'info',
      },
      {
        title: 'Subjects',
        purpose: `${this.subjects.length} subject record(s) configured`,
        date: this.formatToday(),
        status: this.subjects.length > 0 ? 'READY' : 'SETUP',
        route: '/subjects',
        tone: this.subjects.length > 0 ? 'info' : 'warning',
      },
      {
        title: 'Sections',
        purpose: `${this.sections.length} section(s) configured`,
        date: this.formatToday(),
        status: this.sections.length > 0 ? 'READY' : 'SETUP',
        route: '/sections',
        tone: this.sections.length > 0 ? 'info' : 'warning',
      },
      {
        title: 'Class Offerings',
        purpose: `${this.offerings.length} class offering(s) configured`,
        date: this.formatToday(),
        status: this.offerings.length > 0 ? 'READY' : 'SETUP',
        route: '/offerings',
        tone: this.offerings.length > 0 ? 'info' : 'warning',
      },
      {
        title: 'Attendance Monitoring',
        purpose: `${activeSessions.length} active session(s) currently open`,
        date: this.formatToday(),
        status: activeSessions.length > 0 ? 'PENDING' : 'STABLE',
        route: '/admin-attendance',
        tone: activeSessions.length > 0 ? 'warning' : 'success',
      },
      {
        title: 'Reports',
        purpose: `${todayAttendance.length} attendance record(s) logged today`,
        date: this.formatToday(),
        status: 'READY',
        route: '/reports',
        tone: 'info',
      },
      {
        title: 'Late Records',
        purpose: `${lateToday} student(s) marked late today`,
        date: this.formatToday(),
        status: lateToday > 0 ? 'PENDING' : 'CLEAR',
        route: '/reports',
        tone: lateToday > 0 ? 'warning' : 'success',
      },
      {
        title: 'Absence Records',
        purpose: `${absentToday} student(s) marked absent today`,
        date: this.formatToday(),
        status: absentToday > 0 ? 'PENDING' : 'CLEAR',
        route: '/reports',
        tone: absentToday > 0 ? 'danger' : 'success',
      },
    ];
  }

  private buildTeacherDashboard(): void {
    const teacherId = this.findCurrentTeacherId();

    const handledOfferings = this.offerings.filter(
      (offering) =>
        String(offering.teacherId || '') === teacherId &&
        String(offering.status || '').toLowerCase() !== 'inactive' &&
        String(offering.status || '').toLowerCase() !== 'archived',
    );

    const handledOfferingIds = handledOfferings.map((offering) => String(offering.id));

    const handledSessions = this.sessions.filter((session) =>
      handledOfferingIds.includes(String(session.classOfferingId)),
    );

    const activeSessions = handledSessions.filter(
      (session) => String(session.status || '').toLowerCase() === 'active',
    );

    const handledSessionIds = handledSessions.map((session) => String(session.id));

    const handledAttendance = this.attendance.filter((record) =>
      handledSessionIds.includes(String(record.sessionId)),
    );

    const today = this.getTodayString();

    const todaySessions = handledSessions.filter((session) => session.date === today);
    const todaySessionIds = todaySessions.map((session) => String(session.id));

    const todayAttendance = handledAttendance.filter((record) =>
      todaySessionIds.includes(String(record.sessionId)),
    );

    this.stats = [
      {
        label: 'Handled Classes',
        value: `${handledOfferings.length}`,
        subtitle: 'Assigned classes',
        icon: 'pi pi-book',
        tone: 'blue',
      },
      {
        label: 'Active Sessions',
        value: `${activeSessions.length}`,
        subtitle: 'Currently open',
        icon: 'pi pi-qrcode',
        tone: 'green',
      },
      {
        label: 'Records Today',
        value: `${todayAttendance.length}`,
        subtitle: 'Logged today',
        icon: 'pi pi-calendar',
        tone: 'orange',
      },
      {
        label: 'Total Records',
        value: `${handledAttendance.length}`,
        subtitle: 'Attendance records',
        icon: 'pi pi-list-check',
        tone: 'purple',
      },
    ];

    this.cards = [
      {
        title: 'Attendance Workspace',
        purpose: 'Create QR sessions, mark attendance, approve requests, and import Excel sheets',
        date: this.formatToday(),
        status: 'OPEN',
        route: '/attendance',
        tone: 'info',
      },
      {
        title: 'Active Sessions',
        purpose: `${activeSessions.length} active attendance session(s)`,
        date: this.formatToday(),
        status: activeSessions.length > 0 ? 'PENDING' : 'CLEAR',
        route: '/attendance',
        tone: activeSessions.length > 0 ? 'warning' : 'success',
      },
      {
        title: 'My Subjects',
        purpose: 'View your assigned subjects and covered sections',
        date: this.formatToday(),
        status: 'OPEN',
        route: '/teacher-subjects',
        tone: 'info',
      },
      {
        title: 'Reports',
        purpose: 'Review class attendance summaries and monitoring records',
        date: this.formatToday(),
        status: 'READY',
        route: '/reports',
        tone: 'info',
      },
      {
        title: 'Messages',
        purpose: 'Check messages, updates, and communication',
        date: this.formatToday(),
        status: 'OPEN',
        route: '/messages',
        tone: 'info',
      },
    ];
  }

  private buildStudentDashboard(): void {
    const student = this.findCurrentStudent();

    const studentRecords = student
      ? this.attendance.filter((record) => String(record.studentId) === String(student.id))
      : [];

    const present = this.countStatus(studentRecords, 'present');
    const late = this.countStatus(studentRecords, 'late');
    const absent = this.countStatus(studentRecords, 'absent');
    const excused = this.countStatus(studentRecords, 'excused');

    const total = present + late + absent + excused;
    const attendanceRate = total ? Math.round(((present + late + excused) / total) * 100) : 0;

    this.stats = [
      {
        label: 'Attendance Rate',
        value: `${attendanceRate}%`,
        subtitle: 'Current performance',
        icon: 'pi pi-chart-line',
        tone: 'blue',
      },
      {
        label: 'Present',
        value: `${present}`,
        subtitle: 'Present records',
        icon: 'pi pi-check-circle',
        tone: 'green',
      },
      {
        label: 'Late',
        value: `${late}`,
        subtitle: 'Late records',
        icon: 'pi pi-clock',
        tone: 'orange',
      },
      {
        label: 'Absent',
        value: `${absent}`,
        subtitle: 'Absent records',
        icon: 'pi pi-times-circle',
        tone: 'purple',
      },
    ];

    this.cards = [
      {
        title: 'My Attendance',
        purpose: 'Scan QR, enter session code, and view attendance history',
        date: this.formatToday(),
        status: 'OPEN',
        route: '/student-attendance',
        tone: 'info',
      },
      {
        title: 'My Subjects',
        purpose: 'View your enrolled subjects and class information',
        date: this.formatToday(),
        status: 'OPEN',
        route: '/student-subjects',
        tone: 'info',
      },
      {
        title: 'Attendance Rate',
        purpose: `${attendanceRate}% current attendance rate`,
        date: this.formatToday(),
        status: attendanceRate >= 80 ? 'GOOD' : attendanceRate >= 60 ? 'WATCH' : 'WARNING',
        route: '/student-attendance',
        tone: attendanceRate >= 80 ? 'success' : attendanceRate >= 60 ? 'warning' : 'danger',
      },
      {
        title: 'Late Records',
        purpose: `${late} late record(s) found`,
        date: this.formatToday(),
        status: late > 0 ? 'PENDING' : 'CLEAR',
        route: '/student-attendance',
        tone: late > 0 ? 'warning' : 'success',
      },
      {
        title: 'Absence Records',
        purpose: `${absent} absence record(s) found`,
        date: this.formatToday(),
        status: absent > 0 ? 'PENDING' : 'CLEAR',
        route: '/student-attendance',
        tone: absent > 0 ? 'danger' : 'success',
      },
      {
        title: 'Reports',
        purpose: 'Review your attendance summary',
        date: this.formatToday(),
        status: 'READY',
        route: '/reports',
        tone: 'info',
      },
    ];
  }

  private buildParentDashboard(): void {
    const parent = this.findCurrentParent();
    const linkedStudents = this.getLinkedStudentsForParent(parent);
    const linkedStudentIds = linkedStudents.map((student) => String(student.id));

    const childAttendance = this.attendance.filter((record) =>
      linkedStudentIds.includes(String(record.studentId)),
    );

    const present = this.countStatus(childAttendance, 'present');
    const late = this.countStatus(childAttendance, 'late');
    const absent = this.countStatus(childAttendance, 'absent');
    const excused = this.countStatus(childAttendance, 'excused');

    const total = present + late + absent + excused;
    const attendanceRate = total ? Math.round(((present + late + excused) / total) * 100) : 0;

    this.stats = [
      {
        label: 'Linked Children',
        value: `${linkedStudents.length}`,
        subtitle: 'Connected students',
        icon: 'pi pi-users',
        tone: 'blue',
      },
      {
        label: 'Attendance Rate',
        value: `${attendanceRate}%`,
        subtitle: 'Child attendance rate',
        icon: 'pi pi-chart-line',
        tone: 'green',
      },
      {
        label: 'Late Records',
        value: `${late}`,
        subtitle: 'Late records',
        icon: 'pi pi-clock',
        tone: 'orange',
      },
      {
        label: 'Absences',
        value: `${absent}`,
        subtitle: 'Absent records',
        icon: 'pi pi-exclamation-circle',
        tone: 'purple',
      },
    ];

    this.cards = [
      {
        title: 'Child Attendance',
        purpose: 'Monitor child attendance history and latest status',
        date: this.formatToday(),
        status: 'OPEN',
        route: '/parent-attendance',
        tone: 'info',
      },
      {
        title: 'Linked Children',
        purpose: `${linkedStudents.length} student record(s) linked to your account`,
        date: this.formatToday(),
        status: linkedStudents.length > 0 ? 'ACTIVE' : 'SETUP',
        route: '/parent-attendance',
        tone: linkedStudents.length > 0 ? 'success' : 'warning',
      },
      {
        title: 'Attendance Rate',
        purpose: `${attendanceRate}% combined child attendance rate`,
        date: this.formatToday(),
        status: attendanceRate >= 80 ? 'GOOD' : attendanceRate >= 60 ? 'WATCH' : 'WARNING',
        route: '/parent-attendance',
        tone: attendanceRate >= 80 ? 'success' : attendanceRate >= 60 ? 'warning' : 'danger',
      },
      {
        title: 'Late Records',
        purpose: `${late} late record(s) found`,
        date: this.formatToday(),
        status: late > 0 ? 'PENDING' : 'CLEAR',
        route: '/parent-attendance',
        tone: late > 0 ? 'warning' : 'success',
      },
      {
        title: 'Absence Records',
        purpose: `${absent} absence record(s) found`,
        date: this.formatToday(),
        status: absent > 0 ? 'PENDING' : 'CLEAR',
        route: '/parent-attendance',
        tone: absent > 0 ? 'danger' : 'success',
      },
    ];
  }

  private findCurrentTeacherId(): string {
    const currentUserId = String(this.currentUser?.id || '').trim();
    const currentEmail = String(this.currentUser?.email || '')
      .toLowerCase()
      .trim();

    const teacher =
      this.teachers.find((item) => String(item.userId || '').trim() === currentUserId) ||
      this.teachers.find(
        (item) =>
          String(item.email || '')
            .toLowerCase()
            .trim() === currentEmail,
      );

    return String(teacher?.id || '').trim();
  }

  private findCurrentStudent(): any | null {
    const currentUserId = String(this.currentUser?.id || '').trim();
    const currentEmail = String(this.currentUser?.email || '')
      .toLowerCase()
      .trim();

    return (
      this.students.find((item) => String(item.userId || '').trim() === currentUserId) ||
      this.students.find(
        (item) =>
          String(item.email || '')
            .toLowerCase()
            .trim() === currentEmail,
      ) ||
      null
    );
  }

  private findCurrentParent(): any | null {
    const currentUserId = String(this.currentUser?.id || '').trim();
    const currentEmail = String(this.currentUser?.email || '')
      .toLowerCase()
      .trim();

    return (
      this.parents.find((item) => String(item.userId || '').trim() === currentUserId) ||
      this.parents.find(
        (item) =>
          String(item.email || '')
            .toLowerCase()
            .trim() === currentEmail,
      ) ||
      null
    );
  }

  private getLinkedStudentsForParent(parent: any | null): any[] {
    if (!parent) return [];

    const parentId = String(parent.id || '').trim();

    const parentStudentIds = Array.isArray(parent.studentIds)
      ? parent.studentIds.map((id: any) => String(id).trim()).filter(Boolean)
      : [];

    const legacyStudentId = String(parent.studentId || '').trim();

    if (legacyStudentId && !parentStudentIds.includes(legacyStudentId)) {
      parentStudentIds.push(legacyStudentId);
    }

    return this.students.filter((student) => {
      const studentId = String(student.id || '').trim();
      const studentParentId = String(student.parentId || '').trim();

      return parentStudentIds.includes(studentId) || (!!parentId && studentParentId === parentId);
    });
  }

  private countStatus(records: any[], status: string): number {
    return records.filter(
      (record) => String(record.status || '').toLowerCase() === status.toLowerCase(),
    ).length;
  }

  private getRoleLabel(role: UserRole | null): string {
    if (role === 'admin') return 'Admin';
    if (role === 'teacher') return 'Teacher';
    if (role === 'student') return 'Student';
    if (role === 'parent') return 'Parent';

    return 'SAMS';
  }

  private getTodayString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private formatToday(): string {
    return new Date().toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}
