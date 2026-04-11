import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import {
  ApiService,
  Attendance,
  Parent,
  Section,
  Session,
  Student,
  Teacher,
  ClassOffering,
} from '../../../services/api.service';
import { User, UserRole } from '../../../models/user.model';

interface DashboardCard {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
  colorClass: 'blue' | 'purple' | 'green' | 'yellow' | 'red';
  trend?: string;
}

interface ActionCard {
  title: string;
  subtitle: string;
  icon: string;
  buttonLabel: string;
  route: string;
  colorClass: 'blue' | 'purple' | 'green' | 'yellow';
}

interface ModuleCard {
  code: string;
  title: string;
  section: string;
  schedule: string;
  room: string;
  buttonLabel: string;
  borderColor: string;
}

interface ScheduleItem {
  title: string;
  schedule: string;
  room: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly apiService = inject(ApiService);

  currentUser: User | null = null;
  currentRole: UserRole | null = null;

  welcomeTitle = '';
  welcomeSubtitle = '';
  heroButtonText = '';

  cards: DashboardCard[] = [];
  attendanceCards: DashboardCard[] = [];
  quickActions: ActionCard[] = [];

  subjectSectionTitle = '';
  subjectCards: ModuleCard[] = [];

  scheduleTitle = '';
  schedules: ScheduleItem[] = [];

  recentTitle = '';
  recentItems: string[] = [];

  alertTitle = 'System Alerts';
  alertItems: string[] = [];

  isLoading = false;

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.currentRole = this.authService.getUserRole();
    this.loadDashboardByRole();
  }

  private loadDashboardByRole(): void {
    switch (this.currentRole) {
      case 'admin':
        this.loadAdminDashboard();
        break;
      case 'teacher':
        this.loadTeacherDashboard();
        break;
      case 'student':
        this.loadStudentDashboard();
        break;
      case 'parent':
        this.loadParentDashboard();
        break;
      default:
        this.loadFallbackDashboard();
        break;
    }
  }

  private loadAdminDashboard(): void {
    this.isLoading = true;

    this.welcomeTitle = `Welcome back, ${this.currentUser?.firstName || 'Admin'}!`;
    this.welcomeSubtitle =
      'Monitor attendance operations, manage academic records, and respond to priority issues.';
    this.heroButtonText = 'Open Reports';

    this.quickActions = [
      {
        title: 'Add Student',
        subtitle: 'Register a new student record',
        icon: 'pi pi-user-plus',
        buttonLabel: 'Go to Students',
        route: '/students',
        colorClass: 'blue',
      },
      {
        title: 'Add Teacher',
        subtitle: 'Create or update faculty records',
        icon: 'pi pi-briefcase',
        buttonLabel: 'Go to Teachers',
        route: '/teachers',
        colorClass: 'purple',
      },
      {
        title: 'Manage Sections',
        subtitle: 'Maintain year level and section setup',
        icon: 'pi pi-sitemap',
        buttonLabel: 'Go to Sections',
        route: '/sections',
        colorClass: 'green',
      },
      {
        title: 'Open Attendance',
        subtitle: 'Review active sessions and submissions',
        icon: 'pi pi-calendar',
        buttonLabel: 'Go to Attendance',
        route: '/attendance',
        colorClass: 'yellow',
      },
    ];

    this.subjectSectionTitle = 'Management Modules';
    this.scheduleTitle = "Today's Priority Tasks";
    this.recentTitle = 'Recent Activities';

    forkJoin({
      students: this.apiService.getStudents(),
      teachers: this.apiService.getTeachers(),
      parents: this.apiService.getParents(),
      sections: this.apiService.getSections(),
      attendance: this.apiService.getAttendance(),
      sessions: this.apiService.getSessions(),
      offerings: this.apiService.getClassOfferings(),
    }).subscribe({
      next: ({ students, teachers, parents, sections, attendance, sessions, offerings }) => {
        const today = this.getTodayString();
        const todaySessions = sessions.filter((session) => session.date === today);
        const activeSessions = sessions.filter(
          (session) => session.status?.toLowerCase() === 'active',
        );
        const todayAttendance = attendance.filter((record) =>
          todaySessions.some((session) => String(session.id) === String(record.sessionId)),
        );

        const lateToday = todayAttendance.filter(
          (record) => record.status?.toLowerCase() === 'late',
        ).length;

        const absentToday = todayAttendance.filter(
          (record) => record.status?.toLowerCase() === 'absent',
        ).length;

        const pendingRecords = activeSessions.length;

        this.cards = [
          {
            title: 'Total Students',
            value: `${students.length}`,
            subtitle: 'Registered student records',
            icon: 'pi pi-users',
            colorClass: 'blue',
          },
          {
            title: 'Total Teachers',
            value: `${teachers.length}`,
            subtitle: 'Faculty records',
            icon: 'pi pi-briefcase',
            colorClass: 'purple',
          },
          {
            title: 'Total Parents',
            value: `${parents.length}`,
            subtitle: 'Linked parent accounts',
            icon: 'pi pi-user-plus',
            colorClass: 'green',
          },
          {
            title: 'Active Sections',
            value: `${sections.filter((section) => section.status?.toLowerCase() === 'active').length}`,
            subtitle: 'Current academic sections',
            icon: 'pi pi-sitemap',
            colorClass: 'yellow',
          },
          {
            title: 'Pending Reviews',
            value: `${pendingRecords}`,
            subtitle: 'Open attendance sessions',
            icon: 'pi pi-exclamation-circle',
            colorClass: 'red',
          },
        ];

        this.attendanceCards = [
          {
            title: 'Sessions Today',
            value: `${todaySessions.length}`,
            subtitle: 'Attendance sessions scheduled today',
            icon: 'pi pi-calendar',
            colorClass: 'blue',
          },
          {
            title: 'Attendance Logs',
            value: `${todayAttendance.length}`,
            subtitle: 'Recorded attendance entries today',
            icon: 'pi pi-check-square',
            colorClass: 'purple',
          },
          {
            title: 'Late Today',
            value: `${lateToday}`,
            subtitle: 'Students marked late today',
            icon: 'pi pi-clock',
            colorClass: 'yellow',
          },
          {
            title: 'Absent Today',
            value: `${absentToday}`,
            subtitle: 'Students marked absent today',
            icon: 'pi pi-times-circle',
            colorClass: 'red',
          },
        ];

        this.subjectCards = [
          {
            code: 'STU',
            title: 'Student Management',
            section: `${students.length} student records`,
            schedule: 'Create, update, and organize student information',
            room: 'Admin Module',
            buttonLabel: 'Open Module',
            borderColor: '#3b82f6',
          },
          {
            code: 'TCH',
            title: 'Teacher Management',
            section: `${teachers.length} teacher records`,
            schedule: 'Maintain faculty accounts and assignments',
            room: 'Admin Module',
            buttonLabel: 'Open Module',
            borderColor: '#8b5cf6',
          },
          {
            code: 'SEC',
            title: 'Sections',
            section: `${sections.length} configured sections`,
            schedule: 'Manage section capacity, adviser, and year level',
            room: 'Academic Module',
            buttonLabel: 'View Sections',
            borderColor: '#10b981',
          },
          {
            code: 'CLS',
            title: 'Class Offerings',
            section: `${offerings.length} active offerings`,
            schedule: 'Assign subjects, teachers, sections, and schedules',
            room: 'Academic Module',
            buttonLabel: 'View Offerings',
            borderColor: '#f59e0b',
          },
        ];

        this.schedules = [
          {
            title: `${activeSessions.length} active session(s) to monitor`,
            schedule: 'Live tracking',
            room: 'Attendance Module',
          },
          {
            title: `${pendingRecords} session(s) still open`,
            schedule: 'Needs review',
            room: 'Admin Review',
          },
          {
            title: `${todayAttendance.length} attendance record(s) submitted today`,
            schedule: 'Daily monitoring',
            room: 'Dashboard Overview',
          },
        ];

        this.recentItems = [
          `${students.length} total student record(s) currently stored`,
          `${teachers.length} teacher record(s) available in the system`,
          `${offerings.length} class offering(s) currently configured`,
          `${todayAttendance.length} attendance record(s) logged today`,
        ];

        this.alertItems = [];
        if (students.length === 0) {
          this.alertItems.push(
            'No student records found. Add students to begin attendance monitoring.',
          );
        }
        if (teachers.length === 0) {
          this.alertItems.push('No teacher records found. Assign teachers for class offerings.');
        }
        if (offerings.length === 0) {
          this.alertItems.push(
            'No class offerings available. Configure offerings before opening sessions.',
          );
        }
        if (todaySessions.length === 0) {
          this.alertItems.push('No attendance sessions scheduled for today.');
        }
        if (activeSessions.length > 0) {
          this.alertItems.push(
            `${activeSessions.length} attendance session(s) remain active and may need closing.`,
          );
        }

        this.isLoading = false;
      },
      error: () => {
        this.cards = [];
        this.attendanceCards = [];
        this.subjectCards = [];
        this.schedules = [];
        this.recentItems = ['Unable to load dashboard data from JSON Server.'];
        this.alertItems = ['Check if JSON Server is running on http://localhost:3000.'];
        this.isLoading = false;
      },
    });
  }

  private loadTeacherDashboard(): void {
    this.welcomeTitle = `Welcome back, ${this.currentUser?.firstName || 'Teacher'}!`;
    this.welcomeSubtitle = 'View your classes, monitor attendance, and manage daily sessions.';
    this.heroButtonText = 'View Attendance';

    this.cards = [
      {
        title: 'Total Subjects',
        value: '6',
        subtitle: 'Handled this term',
        icon: 'pi pi-book',
        colorClass: 'blue',
      },
      {
        title: 'Sections',
        value: '6',
        subtitle: 'Assigned sections',
        icon: 'pi pi-sitemap',
        colorClass: 'purple',
      },
      {
        title: 'Total Students',
        value: '180',
        subtitle: 'Across all classes',
        icon: 'pi pi-users',
        colorClass: 'green',
      },
      {
        title: 'Classes Today',
        value: '4',
        subtitle: 'Scheduled today',
        icon: 'pi pi-calendar',
        colorClass: 'yellow',
      },
      {
        title: 'Pending',
        value: '3',
        subtitle: 'Attendance to check',
        icon: 'pi pi-exclamation-circle',
        colorClass: 'red',
      },
    ];

    this.attendanceCards = [];
    this.quickActions = [];
    this.subjectSectionTitle = 'My Subjects';
    this.subjectCards = [
      {
        code: 'CS201',
        title: 'Data Structures & Algorithms',
        section: 'Section A',
        schedule: 'MWF 9:00-10:30 AM',
        room: 'Room 201',
        buttonLabel: 'Open Attendance',
        borderColor: '#3b82f6',
      },
      {
        code: 'IT301',
        title: 'Web Development',
        section: 'Section C',
        schedule: 'TTh 9:00-10:30 AM',
        room: 'Lab 201',
        buttonLabel: 'Open Attendance',
        borderColor: '#f59e0b',
      },
    ];

    this.scheduleTitle = "Today's Schedule";
    this.schedules = [
      {
        title: 'Data Structures & Algorithms',
        schedule: 'MWF 9:00-10:30 AM',
        room: 'Room 201',
      },
      {
        title: 'Web Development',
        schedule: 'TTh 9:00-10:30 AM',
        room: 'Lab 201',
      },
      {
        title: 'System Analysis & Design',
        schedule: 'TTh 1:00-2:30 PM',
        room: 'Room 305',
      },
    ];

    this.recentTitle = 'Recent Attendance Sessions';
    this.recentItems = [
      'Web Development attendance opened',
      'Section A marked complete',
      '2 late students recorded this morning',
    ];

    this.alertItems = [];
  }

  private loadStudentDashboard(): void {
    this.welcomeTitle = `Welcome back, ${this.currentUser?.firstName || 'Student'}!`;
    this.welcomeSubtitle = 'Track your attendance and stay updated with your classes.';
    this.heroButtonText = 'View My Subjects';

    this.cards = [
      {
        title: 'Subjects',
        value: '7',
        subtitle: 'Enrolled this term',
        icon: 'pi pi-book',
        colorClass: 'blue',
      },
      {
        title: 'Attendance Rate',
        value: '96%',
        subtitle: 'Overall attendance',
        icon: 'pi pi-chart-line',
        colorClass: 'purple',
      },
      {
        title: 'Present Today',
        value: '3',
        subtitle: 'Recorded sessions',
        icon: 'pi pi-check-circle',
        colorClass: 'green',
      },
      {
        title: 'Classes Today',
        value: '4',
        subtitle: 'Scheduled today',
        icon: 'pi pi-calendar',
        colorClass: 'yellow',
      },
      {
        title: 'Late',
        value: '1',
        subtitle: 'This month',
        icon: 'pi pi-clock',
        colorClass: 'red',
      },
    ];

    this.attendanceCards = [];
    this.quickActions = [];
    this.subjectSectionTitle = 'My Subjects';
    this.subjectCards = [
      {
        code: 'IT301',
        title: 'Web Development',
        section: 'BSIT 3-A',
        schedule: 'TTh 9:00-10:30 AM',
        room: 'Lab 201',
        buttonLabel: 'View Details',
        borderColor: '#3b82f6',
      },
      {
        code: 'SIA101',
        title: 'System Integration & Architecture',
        section: 'BSIT 3-A',
        schedule: 'MWF 1:00-2:30 PM',
        room: 'Room 305',
        buttonLabel: 'View Details',
        borderColor: '#16a34a',
      },
    ];

    this.scheduleTitle = "Today's Schedule";
    this.schedules = [
      {
        title: 'Web Development',
        schedule: '9:00-10:30 AM',
        room: 'Lab 201',
      },
      {
        title: 'System Integration & Architecture',
        schedule: '1:00-2:30 PM',
        room: 'Room 305',
      },
    ];

    this.recentTitle = 'Recent Attendance';
    this.recentItems = [
      'Marked present in Web Development',
      'Marked present in Data Structures',
      '1 late record this month',
    ];

    this.alertItems = [];
  }

  private loadParentDashboard(): void {
    this.welcomeTitle = `Welcome back, ${this.currentUser?.firstName || 'Parent'}!`;
    this.welcomeSubtitle = 'Monitor your child’s attendance and class participation.';
    this.heroButtonText = 'View Child Records';

    this.cards = [
      {
        title: 'Linked Child',
        value: '1',
        subtitle: 'Student account linked',
        icon: 'pi pi-user',
        colorClass: 'blue',
      },
      {
        title: 'Attendance Rate',
        value: '94%',
        subtitle: 'Child attendance rate',
        icon: 'pi pi-chart-line',
        colorClass: 'purple',
      },
      {
        title: 'Present',
        value: '18',
        subtitle: 'This month',
        icon: 'pi pi-check-circle',
        colorClass: 'green',
      },
      {
        title: 'Absences',
        value: '2',
        subtitle: 'This month',
        icon: 'pi pi-calendar-times',
        colorClass: 'yellow',
      },
      {
        title: 'Late',
        value: '1',
        subtitle: 'This month',
        icon: 'pi pi-clock',
        colorClass: 'red',
      },
    ];

    this.attendanceCards = [];
    this.quickActions = [];
    this.subjectSectionTitle = "Child's Subjects";
    this.subjectCards = [
      {
        code: 'IT301',
        title: 'Web Development',
        section: 'BSIT 3-A',
        schedule: 'TTh 9:00-10:30 AM',
        room: 'Lab 201',
        buttonLabel: 'View Attendance',
        borderColor: '#3b82f6',
      },
      {
        code: 'SIA101',
        title: 'System Integration & Architecture',
        section: 'BSIT 3-A',
        schedule: 'MWF 1:00-2:30 PM',
        room: 'Room 305',
        buttonLabel: 'View Attendance',
        borderColor: '#f59e0b',
      },
    ];

    this.scheduleTitle = "Child's Schedule";
    this.schedules = [
      {
        title: 'Web Development',
        schedule: '9:00-10:30 AM',
        room: 'Lab 201',
      },
      {
        title: 'System Integration & Architecture',
        schedule: '1:00-2:30 PM',
        room: 'Room 305',
      },
    ];

    this.recentTitle = 'Recent Attendance Updates';
    this.recentItems = [
      'Present in Web Development',
      'Present in System Integration',
      '1 late record this month',
    ];

    this.alertItems = [];
  }

  private loadFallbackDashboard(): void {
    this.welcomeTitle = 'Welcome to SAMS!';
    this.welcomeSubtitle = 'Student Attendance Monitoring System';
    this.heroButtonText = 'Explore';
    this.cards = [];
    this.attendanceCards = [];
    this.quickActions = [];
    this.subjectCards = [];
    this.schedules = [];
    this.recentItems = [];
    this.alertItems = [];
  }

  private getTodayString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
