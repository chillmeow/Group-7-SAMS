import { Routes } from '@angular/router';
import { Login } from './components/auth/login/login';
import { Layout } from './components/home/layout/layout';
import { DashboardComponent } from './components/home/dashboard/dashboard';
import { SubjectsComponent } from './components/pages/subjects/subjects';
import { AttendanceComponent } from './components/pages/attendance/attendance';
import { ReportsComponent } from './components/pages/reports/reports';
import { Notifications } from './components/pages/notifications/notifications';
import { Messages } from './components/pages/messages/messages';
import { StudentsComponent } from './components/pages/students/students';
import { TeachersComponent } from './components/pages/teachers/teachers';
import { ParentsComponent } from './components/pages/parents/parents';
import { SectionsComponent } from './components/pages/sections/sections';
import { ClassOfferingsComponent } from './components/pages/class-offerings/class-offerings';
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
      { path: 'dashboard', component: DashboardComponent },

      {
        path: 'students',
        component: StudentsComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },
      {
        path: 'teachers',
        component: TeachersComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },
      {
        path: 'parents',
        component: ParentsComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },
      {
        path: 'subjects',
        component: SubjectsComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'teacher', 'student'] },
      },
      {
        path: 'sections',
        component: SectionsComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
      },
      {
        path: 'offerings',
        component: ClassOfferingsComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'teacher'] },
      },
      {
        path: 'attendance',
        component: AttendanceComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'teacher', 'student', 'parent'] },
      },
      {
        path: 'reports',
        component: ReportsComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin', 'teacher', 'parent'] },
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
        data: { roles: ['admin', 'teacher'] },
      },

      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
