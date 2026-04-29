import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Observable, from, map, switchMap, throwError } from 'rxjs';

import { db } from '../firebase.config';
import { User } from '../models/user.model';

export interface Student {
  id: string | number;
  userId?: string | number;
  parentId?: string | number;
  studentNumber?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  email?: string;
  sectionId?: string | number;
  yearLevel?: string;
  status?: string;

  parentFirstName?: string;
  parentLastName?: string;
  parentEmail?: string;
  parentContactNumber?: string;
  parentRelationship?: string;
}

export interface Teacher {
  id: string | number;
  userId?: string | number;
  employeeId?: string;
  employeeNo?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  department?: string;
  facultyType?: string;
  status?: string;
}

export interface Parent {
  id: string | number;
  userId?: string | number;
  studentId?: string | number;
  studentIds?: Array<string | number>;
  relationship?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  contactNumber?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Subject {
  id: string | number;
  subjectCode?: string;
  subjectName?: string;
  program?: string;
  yearLevel?: string;
  semester?: string;
  units?: number;
  lectureHours?: number;
  labHours?: number;
  status?: string;
}

export interface Section {
  id: string | number;
  sectionName?: string;
  yearLevel?: string;
  adviser?: string;
  adviserId?: string | number;
  program?: string;
  capacity?: number;
  students?: number;
  status?: string;
}

export interface ClassOffering {
  id: string | number;
  subjectId?: string | number;
  teacherId?: string | number;
  sectionId?: string | number;
  room?: string;
  schedule?: string;
  subjectCode?: string;
  subjectName?: string;
  offeringCode?: string;
  status?: string;
}

export interface Session {
  id: string | number;
  offeringId?: string | number;
  classOfferingId?: string | number;
  instructorId?: string | number;
  date: string;
  startTime?: string;
  endTime?: string;
  sessionCode?: string;
  qrToken?: string;
  qrCode?: string;
  status: string;
  lateThresholdMinutes?: number;
  createdAt?: string;
}

export interface Attendance {
  id: string | number;
  sessionId: string | number;
  studentId: string | number;
  status: string;
  method?: string;
  time?: string;
  timeRecorded?: string;
  timestamp?: string;
  lateTime?: string;
  recordedBy?: string;
  isValid?: boolean;
  remarks?: string;
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
  getUsers(): Observable<User[]> {
    const ref = collection(db, 'users');

    return from(getDocs(ref)).pipe(
      map((snapshot) =>
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<User, 'id'>),
        })),
      ),
    );
  }

  getUserById(id: string | number): Observable<User> {
    const ref = doc(db, 'users', String(id));

    return from(getDoc(ref)).pipe(
      switchMap((docSnap) => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('user-not-found'));
        }

        return from([
          {
            id: docSnap.id,
            ...(docSnap.data() as Omit<User, 'id'>),
          },
        ]);
      }),
    );
  }

  createUser(payload: Partial<User>): Observable<User> {
    const ref = collection(db, 'users');
    const cleanPayload = this.removeId(payload);

    return from(addDoc(ref, cleanPayload)).pipe(
      map((newDoc) => ({
        id: newDoc.id,
        ...(cleanPayload as Omit<User, 'id'>),
      })),
    );
  }

  updateUser(id: string | number, payload: Partial<User>): Observable<User> {
    const ref = doc(db, 'users', String(id));
    const cleanPayload = this.removeId(payload);

    return from(updateDoc(ref, cleanPayload as Record<string, unknown>)).pipe(
      switchMap(() => this.getUserById(id)),
    );
  }

  deleteUser(id: string | number): Observable<void> {
    return from(deleteDoc(doc(db, 'users', String(id)))).pipe(map(() => void 0));
  }

  getStudents(): Observable<Student[]> {
    const ref = collection(db, 'students');

    return from(getDocs(ref)).pipe(
      map((snapshot) =>
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Student, 'id'>),
        })),
      ),
    );
  }

  getStudentById(id: string | number): Observable<Student> {
    const ref = doc(db, 'students', String(id));

    return from(getDoc(ref)).pipe(
      switchMap((docSnap) => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('student-not-found'));
        }

        return from([
          {
            id: docSnap.id,
            ...(docSnap.data() as Omit<Student, 'id'>),
          },
        ]);
      }),
    );
  }

  createStudent(payload: Partial<Student>): Observable<Student> {
    const ref = collection(db, 'students');
    const cleanPayload = this.removeId(payload);

    return from(addDoc(ref, cleanPayload)).pipe(
      map((newDoc) => ({
        id: newDoc.id,
        ...(cleanPayload as Omit<Student, 'id'>),
      })),
    );
  }

  updateStudent(id: string | number, payload: Partial<Student>): Observable<Student> {
    const ref = doc(db, 'students', String(id));
    const cleanPayload = this.removeId(payload);

    return from(updateDoc(ref, cleanPayload as Record<string, unknown>)).pipe(
      switchMap(() => this.getStudentById(id)),
    );
  }

  deleteStudent(id: string | number): Observable<void> {
    return from(deleteDoc(doc(db, 'students', String(id)))).pipe(map(() => void 0));
  }

  getTeachers(): Observable<Teacher[]> {
    const ref = collection(db, 'teachers');

    return from(getDocs(ref)).pipe(
      map((snapshot) =>
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Teacher, 'id'>),
        })),
      ),
    );
  }

  getTeacherById(id: string | number): Observable<Teacher> {
    const ref = doc(db, 'teachers', String(id));

    return from(getDoc(ref)).pipe(
      switchMap((docSnap) => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('teacher-not-found'));
        }

        return from([
          {
            id: docSnap.id,
            ...(docSnap.data() as Omit<Teacher, 'id'>),
          },
        ]);
      }),
    );
  }

  createTeacher(payload: Partial<Teacher>): Observable<Teacher> {
    const ref = collection(db, 'teachers');
    const cleanPayload = this.removeId(payload);

    return from(addDoc(ref, cleanPayload)).pipe(
      map((newDoc) => ({
        id: newDoc.id,
        ...(cleanPayload as Omit<Teacher, 'id'>),
      })),
    );
  }

  updateTeacher(id: string | number, payload: Partial<Teacher>): Observable<Teacher> {
    const ref = doc(db, 'teachers', String(id));
    const cleanPayload = this.removeId(payload);

    return from(updateDoc(ref, cleanPayload as Record<string, unknown>)).pipe(
      switchMap(() => this.getTeacherById(id)),
    );
  }

  deleteTeacher(id: string | number): Observable<void> {
    return from(deleteDoc(doc(db, 'teachers', String(id)))).pipe(map(() => void 0));
  }

  getParents(): Observable<Parent[]> {
    const ref = collection(db, 'parents');

    return from(getDocs(ref)).pipe(
      map((snapshot) =>
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Parent, 'id'>),
        })),
      ),
    );
  }

  getParentById(id: string | number): Observable<Parent> {
    const ref = doc(db, 'parents', String(id));

    return from(getDoc(ref)).pipe(
      switchMap((docSnap) => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('parent-not-found'));
        }

        return from([
          {
            id: docSnap.id,
            ...(docSnap.data() as Omit<Parent, 'id'>),
          },
        ]);
      }),
    );
  }

  createParent(payload: Partial<Parent>): Observable<Parent> {
    const ref = collection(db, 'parents');
    const cleanPayload = this.removeId(payload);

    return from(addDoc(ref, cleanPayload)).pipe(
      map((newDoc) => ({
        id: newDoc.id,
        ...(cleanPayload as Omit<Parent, 'id'>),
      })),
    );
  }

  updateParent(id: string | number, payload: Partial<Parent>): Observable<Parent> {
    const ref = doc(db, 'parents', String(id));
    const cleanPayload = this.removeId(payload);

    return from(updateDoc(ref, cleanPayload as Record<string, unknown>)).pipe(
      switchMap(() => this.getParentById(id)),
    );
  }

  deleteParent(id: string | number): Observable<void> {
    return from(deleteDoc(doc(db, 'parents', String(id)))).pipe(map(() => void 0));
  }

  getSubjects(): Observable<Subject[]> {
    const ref = collection(db, 'subjects');

    return from(getDocs(ref)).pipe(
      map((snapshot) =>
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Subject, 'id'>),
        })),
      ),
    );
  }

  getSubjectById(id: string | number): Observable<Subject> {
    const ref = doc(db, 'subjects', String(id));

    return from(getDoc(ref)).pipe(
      switchMap((docSnap) => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('subject-not-found'));
        }

        return from([
          {
            id: docSnap.id,
            ...(docSnap.data() as Omit<Subject, 'id'>),
          },
        ]);
      }),
    );
  }

  createSubject(payload: Partial<Subject>): Observable<Subject> {
    const ref = collection(db, 'subjects');
    const cleanPayload = this.removeId(payload);

    return from(addDoc(ref, cleanPayload)).pipe(
      map((newDoc) => ({
        id: newDoc.id,
        ...(cleanPayload as Omit<Subject, 'id'>),
      })),
    );
  }

  updateSubject(id: string | number, payload: Partial<Subject>): Observable<Subject> {
    const ref = doc(db, 'subjects', String(id));
    const cleanPayload = this.removeId(payload);

    return from(updateDoc(ref, cleanPayload as Record<string, unknown>)).pipe(
      switchMap(() => this.getSubjectById(id)),
    );
  }

  deleteSubject(id: string | number): Observable<void> {
    return from(deleteDoc(doc(db, 'subjects', String(id)))).pipe(map(() => void 0));
  }

  getSections(): Observable<Section[]> {
    const ref = collection(db, 'sections');

    return from(getDocs(ref)).pipe(
      map((snapshot) =>
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Section, 'id'>),
        })),
      ),
    );
  }

  getSectionById(id: string | number): Observable<Section> {
    const ref = doc(db, 'sections', String(id));

    return from(getDoc(ref)).pipe(
      switchMap((docSnap) => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('section-not-found'));
        }

        return from([
          {
            id: docSnap.id,
            ...(docSnap.data() as Omit<Section, 'id'>),
          },
        ]);
      }),
    );
  }

  createSection(payload: Partial<Section>): Observable<Section> {
    const ref = collection(db, 'sections');
    const cleanPayload = this.removeId(payload);

    return from(addDoc(ref, cleanPayload)).pipe(
      map((newDoc) => ({
        id: newDoc.id,
        ...(cleanPayload as Omit<Section, 'id'>),
      })),
    );
  }

  updateSection(id: string | number, payload: Partial<Section>): Observable<Section> {
    const ref = doc(db, 'sections', String(id));
    const cleanPayload = this.removeId(payload);

    return from(updateDoc(ref, cleanPayload as Record<string, unknown>)).pipe(
      switchMap(() => this.getSectionById(id)),
    );
  }

  deleteSection(id: string | number): Observable<void> {
    return from(deleteDoc(doc(db, 'sections', String(id)))).pipe(map(() => void 0));
  }

  getClassOfferings(): Observable<ClassOffering[]> {
    const ref = collection(db, 'classOfferings');

    return from(getDocs(ref)).pipe(
      map((snapshot) =>
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<ClassOffering, 'id'>),
        })),
      ),
    );
  }

  getClassOfferingById(id: string | number): Observable<ClassOffering> {
    const ref = doc(db, 'classOfferings', String(id));

    return from(getDoc(ref)).pipe(
      switchMap((docSnap) => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('class-offering-not-found'));
        }

        return from([
          {
            id: docSnap.id,
            ...(docSnap.data() as Omit<ClassOffering, 'id'>),
          },
        ]);
      }),
    );
  }

  createClassOffering(payload: Partial<ClassOffering>): Observable<ClassOffering> {
    const ref = collection(db, 'classOfferings');
    const cleanPayload = this.removeId(payload);

    return from(addDoc(ref, cleanPayload)).pipe(
      map((newDoc) => ({
        id: newDoc.id,
        ...(cleanPayload as Omit<ClassOffering, 'id'>),
      })),
    );
  }

  updateClassOffering(
    id: string | number,
    payload: Partial<ClassOffering>,
  ): Observable<ClassOffering> {
    const ref = doc(db, 'classOfferings', String(id));
    const cleanPayload = this.removeId(payload);

    return from(updateDoc(ref, cleanPayload as Record<string, unknown>)).pipe(
      switchMap(() => this.getClassOfferingById(id)),
    );
  }

  deleteClassOffering(id: string | number): Observable<void> {
    return from(deleteDoc(doc(db, 'classOfferings', String(id)))).pipe(map(() => void 0));
  }

  getSessions(): Observable<Session[]> {
    const ref = collection(db, 'sessions');

    return from(getDocs(ref)).pipe(
      map((snapshot) =>
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Session, 'id'>),
        })),
      ),
    );
  }

  getSessionById(id: string | number): Observable<Session> {
    const ref = doc(db, 'sessions', String(id));

    return from(getDoc(ref)).pipe(
      switchMap((docSnap) => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('session-not-found'));
        }

        return from([
          {
            id: docSnap.id,
            ...(docSnap.data() as Omit<Session, 'id'>),
          },
        ]);
      }),
    );
  }

  createSession(payload: Partial<Session>): Observable<Session> {
    const ref = collection(db, 'sessions');
    const cleanPayload = this.removeId(payload);

    return from(addDoc(ref, cleanPayload)).pipe(
      map((newDoc) => ({
        id: newDoc.id,
        ...(cleanPayload as Omit<Session, 'id'>),
      })),
    );
  }

  updateSession(id: string | number, payload: Partial<Session>): Observable<Session> {
    const ref = doc(db, 'sessions', String(id));
    const cleanPayload = this.removeId(payload);

    return from(updateDoc(ref, cleanPayload as Record<string, unknown>)).pipe(
      switchMap(() => this.getSessionById(id)),
    );
  }

  deleteSession(id: string | number): Observable<void> {
    return from(deleteDoc(doc(db, 'sessions', String(id)))).pipe(map(() => void 0));
  }

  getAttendance(): Observable<Attendance[]> {
    const ref = collection(db, 'attendance');

    return from(getDocs(ref)).pipe(
      map((snapshot) =>
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Attendance, 'id'>),
        })),
      ),
    );
  }

  getAttendanceById(id: string | number): Observable<Attendance> {
    const ref = doc(db, 'attendance', String(id));

    return from(getDoc(ref)).pipe(
      switchMap((docSnap) => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('attendance-not-found'));
        }

        return from([
          {
            id: docSnap.id,
            ...(docSnap.data() as Omit<Attendance, 'id'>),
          },
        ]);
      }),
    );
  }

  createAttendance(payload: Partial<Attendance>): Observable<Attendance> {
    const ref = collection(db, 'attendance');
    const cleanPayload = this.removeId(payload);

    return from(addDoc(ref, cleanPayload)).pipe(
      map((newDoc) => ({
        id: newDoc.id,
        ...(cleanPayload as Omit<Attendance, 'id'>),
      })),
    );
  }

  updateAttendance(id: string | number, payload: Partial<Attendance>): Observable<Attendance> {
    const ref = doc(db, 'attendance', String(id));
    const cleanPayload = this.removeId(payload);

    return from(updateDoc(ref, cleanPayload as Record<string, unknown>)).pipe(
      switchMap(() => this.getAttendanceById(id)),
    );
  }

  deleteAttendance(id: string | number): Observable<void> {
    return from(deleteDoc(doc(db, 'attendance', String(id)))).pipe(map(() => void 0));
  }

  getNotifications(): Observable<Notification[]> {
    const ref = collection(db, 'notifications');

    return from(getDocs(ref)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<Notification, 'id'>),
          }))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
      ),
    );
  }

  getNotificationsByUser(userId: string | number): Observable<Notification[]> {
    const ref = collection(db, 'notifications');
    const q = query(ref, where('userId', '==', userId));

    return from(getDocs(q)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<Notification, 'id'>),
          }))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
      ),
    );
  }

  getNotificationById(id: string | number): Observable<Notification> {
    const ref = doc(db, 'notifications', String(id));

    return from(getDoc(ref)).pipe(
      switchMap((docSnap) => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('notification-not-found'));
        }

        return from([
          {
            id: docSnap.id,
            ...(docSnap.data() as Omit<Notification, 'id'>),
          },
        ]);
      }),
    );
  }

  createNotification(payload: Partial<Notification>): Observable<Notification> {
    const ref = collection(db, 'notifications');
    const cleanPayload = this.removeId({
      read: false,
      type: 'info',
      createdAt: new Date().toISOString(),
      ...payload,
    });

    return from(addDoc(ref, cleanPayload)).pipe(
      map((newDoc) => ({
        id: newDoc.id,
        ...(cleanPayload as Omit<Notification, 'id'>),
      })),
    );
  }

  updateNotification(
    id: string | number,
    payload: Partial<Notification>,
  ): Observable<Notification> {
    const ref = doc(db, 'notifications', String(id));
    const cleanPayload = this.removeId(payload);

    return from(updateDoc(ref, cleanPayload as Record<string, unknown>)).pipe(
      switchMap(() => this.getNotificationById(id)),
    );
  }

  markNotificationAsRead(id: string | number): Observable<Notification> {
    return this.updateNotification(id, { read: true });
  }

  deleteNotification(id: string | number): Observable<void> {
    return from(deleteDoc(doc(db, 'notifications', String(id)))).pipe(map(() => void 0));
  }

  private removeId<T>(payload: T): T {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }

    const clone = { ...(payload as Record<string, unknown>) };
    delete clone['id'];
    return clone as T;
  }
}
