import { Routes } from '@angular/router';

import { Login } from './components/auth/login/login';
import { Student } from './components/dashboard/student/student';
import { Instructor } from './components/dashboard/instructor/instructor';
import { Parent } from './components/dashboard/parent/parent';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  { path: 'login', component: Login },
  { path: 'student', component: Student },
  { path: 'instructor', component: Instructor },
  { path: 'parent', component: Parent },
];
