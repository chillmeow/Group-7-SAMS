import { Routes } from '@angular/router';
import { Login } from './components/auth/login/login';
import { Layout } from './components/home/layout/layout';
import { DashboardComponent } from './components/home/dashboard/dashboard';
import { SubjectsComponent } from './components/pages/subjects/subjects';
import { TeacherSubjectsComponent } from './components/pages/teacher-subjects/teacher-subjects';
import { StudentSubjectsComponent } from './components/pages/student-subjects/student-subjects';
import { AdminAttendance } from './components/pages/admin-attendance/admin-attendance';
import { AttendanceComponent } from './components/pages/attendance/attendance';
import { ReportsComponent } from './components/pages/reports/reports';
import { Notifications } from './components/features/notifications/notifications';
import { Messages } from './components/pages/messages/messages';
import { StudentAttendanceComponent } from './components/pages/student-attendance/student-attendance';
import { ParentAttendanceComponent } from './components/pages/parent-attendance/parent-attendance';
import { ClassOfferingsComponent } from './components/pages/class-offerings/class-offerings';
import { ProfileComponent } from './components/features/profile/profile';
import { SettingsComponent } from './components/features/settings/settings';
import { FaqsComponent } from './components/features/faqs/faqs';
import { ManageUsers } from './components/pages/admin-management/manage-users/manage-users';
import { ManageStudents } from './components/pages/admin-management/manage-students/manage-students';
import { ManageInstructors } from './components/pages/admin-management/manage-instructors/manage-instructors';
import { ManageParents } from './components/pages/admin-management/manage-parents/manage-parents';
import { ManageSections } from './components/pages/admin-management/manage-sections/manage-sections';
import { ReportsAnalytics } from './components/pages/admin-management/reports-analytics/reports-analytics';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: Login,
  },

  {
    path: '',
    component: Layout,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        component: DashboardComponent,
      },

      {
        path: 'dashboard',
        component: DashboardComponent,
      },

      {
        path: 'profile',
        component: ProfileComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'teacher', 'student', 'parent'] },
      },

      {
        path: 'settings',
        component: SettingsComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'teacher', 'student', 'parent'] },
      },

      {
        path: 'faqs',
        component: FaqsComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'teacher', 'student', 'parent'] },
      },

      {
        path: 'admin-management/manage-users',
        component: ManageUsers,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },

      {
        path: 'admin-management/manage-students',
        component: ManageStudents,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },

      {
        path: 'admin-management/manage-instructors',
        component: ManageInstructors,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },

      {
        path: 'admin-management/manage-parents',
        component: ManageParents,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },

      {
        path: 'admin-management/manage-sections',
        component: ManageSections,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },

      {
        path: 'admin-management/reports-analytics',
        component: ReportsAnalytics,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },

      {
        path: 'student-attendance',
        component: StudentAttendanceComponent,
        canActivate: [roleGuard],
        data: { roles: ['student'] },
      },

      {
        path: 'parent-attendance',
        component: ParentAttendanceComponent,
        canActivate: [roleGuard],
        data: { roles: ['parent'] },
      },

      {
        path: 'subjects',
        component: SubjectsComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },

      {
        path: 'teacher-subjects',
        component: TeacherSubjectsComponent,
        canActivate: [roleGuard],
        data: { roles: ['teacher'] },
      },

      {
        path: 'student-subjects',
        component: StudentSubjectsComponent,
        canActivate: [roleGuard],
        data: { roles: ['student'] },
      },

      {
        path: 'offerings',
        component: ClassOfferingsComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'teacher'] },
      },

      {
        path: 'admin-attendance',
        component: AdminAttendance,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },

      {
        path: 'attendance',
        component: AttendanceComponent,
        canActivate: [roleGuard],
        data: { roles: ['teacher'] },
      },

      {
        path: 'reports',
        component: ReportsComponent,
        canActivate: [roleGuard],
        data: { roles: ['teacher'] },
      },

      {
        path: 'notifications',
        component: Notifications,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'teacher', 'student', 'parent'] },
      },

      {
        path: 'messages',
        component: Messages,
        canActivate: [roleGuard],
        data: { roles: ['teacher', 'student'] },
      },

      {
        path: '**',
        component: DashboardComponent,
      },
    ],
  },

  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
