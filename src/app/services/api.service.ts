import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { User } from '../models/user.model';

export interface Student {
  id: string | number;
  userId?: string | number;
  studentNumber?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  email?: string;
  sectionId?: string | number;
  yearLevel?: string;
  status?: string;
}

export interface Teacher {
  id: string | number;
  userId?: string | number;
  employeeId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  department?: string;
  status?: string;
}

export interface Parent {
  id: string | number;
  userId?: string | number;
  studentId?: string | number;
  relationship?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  status?: string;
}

export interface Subject {
  id: string | number;
  subjectCode: string;
  subjectName: string;
  units: number;
}

export interface Section {
  id: string | number;
  sectionName: string;
  yearLevel: string;
  adviser: string;
  capacity: number;
  students: number;
  status: string;
}

export interface ClassOffering {
  id: string | number;
  subjectId: string | number;
  teacherId: string | number;
  sectionId: string | number;
  room: string;
  schedule: string;
}

export interface Session {
  id: string | number;
  offeringId: string | number;
  date: string;
  qrCode?: string;
  status: string;
}

export interface Attendance {
  id: string | number;
  sessionId: string | number;
  studentId: string | number;
  status: string;
  time?: string;
}

export interface Notification {
  id: string | number;
  userId: string | number;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
  link?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:3000';

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.baseUrl}/users`);
  }

  getUserById(id: string | number): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/users/${id}`);
  }

  createUser(payload: Partial<User>): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/users`, payload);
  }

  updateUser(id: string | number, payload: Partial<User>): Observable<User> {
    return this.http.patch<User>(`${this.baseUrl}/users/${id}`, payload);
  }

  deleteUser(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/users/${id}`);
  }

  getStudents(): Observable<Student[]> {
    return this.http.get<Student[]>(`${this.baseUrl}/students`);
  }

  getStudentById(id: string | number): Observable<Student> {
    return this.http.get<Student>(`${this.baseUrl}/students/${id}`);
  }

  createStudent(payload: Partial<Student>): Observable<Student> {
    return this.http.post<Student>(`${this.baseUrl}/students`, payload);
  }

  updateStudent(id: string | number, payload: Partial<Student>): Observable<Student> {
    return this.http.patch<Student>(`${this.baseUrl}/students/${id}`, payload);
  }

  deleteStudent(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/students/${id}`);
  }

  getTeachers(): Observable<Teacher[]> {
    return this.http.get<Teacher[]>(`${this.baseUrl}/teachers`);
  }

  getTeacherById(id: string | number): Observable<Teacher> {
    return this.http.get<Teacher>(`${this.baseUrl}/teachers/${id}`);
  }

  createTeacher(payload: Partial<Teacher>): Observable<Teacher> {
    return this.http.post<Teacher>(`${this.baseUrl}/teachers`, payload);
  }

  updateTeacher(id: string | number, payload: Partial<Teacher>): Observable<Teacher> {
    return this.http.patch<Teacher>(`${this.baseUrl}/teachers/${id}`, payload);
  }

  deleteTeacher(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/teachers/${id}`);
  }

  getParents(): Observable<Parent[]> {
    return this.http.get<Parent[]>(`${this.baseUrl}/parents`);
  }

  getParentById(id: string | number): Observable<Parent> {
    return this.http.get<Parent>(`${this.baseUrl}/parents/${id}`);
  }

  createParent(payload: Partial<Parent>): Observable<Parent> {
    return this.http.post<Parent>(`${this.baseUrl}/parents`, payload);
  }

  updateParent(id: string | number, payload: Partial<Parent>): Observable<Parent> {
    return this.http.patch<Parent>(`${this.baseUrl}/parents/${id}`, payload);
  }

  deleteParent(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/parents/${id}`);
  }

  getSubjects(): Observable<Subject[]> {
    return this.http.get<Subject[]>(`${this.baseUrl}/subjects`);
  }

  getSubjectById(id: string | number): Observable<Subject> {
    return this.http.get<Subject>(`${this.baseUrl}/subjects/${id}`);
  }

  createSubject(payload: Partial<Subject>): Observable<Subject> {
    return this.http.post<Subject>(`${this.baseUrl}/subjects`, payload);
  }

  updateSubject(id: string | number, payload: Partial<Subject>): Observable<Subject> {
    return this.http.patch<Subject>(`${this.baseUrl}/subjects/${id}`, payload);
  }

  deleteSubject(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/subjects/${id}`);
  }

  getSections(): Observable<Section[]> {
    return this.http.get<Section[]>(`${this.baseUrl}/sections`);
  }

  getSectionById(id: string | number): Observable<Section> {
    return this.http.get<Section>(`${this.baseUrl}/sections/${id}`);
  }

  createSection(payload: Partial<Section>): Observable<Section> {
    return this.http.post<Section>(`${this.baseUrl}/sections`, payload);
  }

  updateSection(id: string | number, payload: Partial<Section>): Observable<Section> {
    return this.http.patch<Section>(`${this.baseUrl}/sections/${id}`, payload);
  }

  deleteSection(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/sections/${id}`);
  }

  getClassOfferings(): Observable<ClassOffering[]> {
    return this.http.get<ClassOffering[]>(`${this.baseUrl}/classOfferings`);
  }

  getClassOfferingById(id: string | number): Observable<ClassOffering> {
    return this.http.get<ClassOffering>(`${this.baseUrl}/classOfferings/${id}`);
  }

  createClassOffering(payload: Partial<ClassOffering>): Observable<ClassOffering> {
    return this.http.post<ClassOffering>(`${this.baseUrl}/classOfferings`, payload);
  }

  updateClassOffering(
    id: string | number,
    payload: Partial<ClassOffering>,
  ): Observable<ClassOffering> {
    return this.http.patch<ClassOffering>(`${this.baseUrl}/classOfferings/${id}`, payload);
  }

  deleteClassOffering(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/classOfferings/${id}`);
  }

  getSessions(): Observable<Session[]> {
    return this.http.get<Session[]>(`${this.baseUrl}/sessions`);
  }

  getSessionById(id: string | number): Observable<Session> {
    return this.http.get<Session>(`${this.baseUrl}/sessions/${id}`);
  }

  createSession(payload: Partial<Session>): Observable<Session> {
    return this.http.post<Session>(`${this.baseUrl}/sessions`, payload);
  }

  updateSession(id: string | number, payload: Partial<Session>): Observable<Session> {
    return this.http.patch<Session>(`${this.baseUrl}/sessions/${id}`, payload);
  }

  deleteSession(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/sessions/${id}`);
  }

  getAttendance(): Observable<Attendance[]> {
    return this.http.get<Attendance[]>(`${this.baseUrl}/attendance`);
  }

  getAttendanceById(id: string | number): Observable<Attendance> {
    return this.http.get<Attendance>(`${this.baseUrl}/attendance/${id}`);
  }

  createAttendance(payload: Partial<Attendance>): Observable<Attendance> {
    return this.http.post<Attendance>(`${this.baseUrl}/attendance`, payload);
  }

  updateAttendance(id: string | number, payload: Partial<Attendance>): Observable<Attendance> {
    return this.http.patch<Attendance>(`${this.baseUrl}/attendance/${id}`, payload);
  }

  deleteAttendance(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/attendance/${id}`);
  }

  getNotifications(): Observable<Notification[]> {
    return this.http.get<Notification[]>(
      `${this.baseUrl}/notifications?_sort=createdAt&_order=desc`,
    );
  }

  getNotificationsByUser(userId: string | number): Observable<Notification[]> {
    return this.http.get<Notification[]>(
      `${this.baseUrl}/notifications?userId=${userId}&_sort=createdAt&_order=desc`,
    );
  }

  getNotificationById(id: string | number): Observable<Notification> {
    return this.http.get<Notification>(`${this.baseUrl}/notifications/${id}`);
  }

  createNotification(payload: Partial<Notification>): Observable<Notification> {
    return this.http.post<Notification>(`${this.baseUrl}/notifications`, payload);
  }

  updateNotification(
    id: string | number,
    payload: Partial<Notification>,
  ): Observable<Notification> {
    return this.http.patch<Notification>(`${this.baseUrl}/notifications/${id}`, payload);
  }

  markNotificationAsRead(id: string | number): Observable<Notification> {
    return this.http.patch<Notification>(`${this.baseUrl}/notifications/${id}`, {
      read: true,
    });
  }

  deleteNotification(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/notifications/${id}`);
  }
}
