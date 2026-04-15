import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';

import { db } from '../firebase.config';
import { Teacher } from '../models/teacher.model';

@Injectable({
  providedIn: 'root',
})
export class TeacherService {
  private readonly collectionName = 'teachers';

  getTeachers(): Observable<Teacher[]> {
    const teachersRef = collection(db, this.collectionName);
    const teachersQuery = query(teachersRef, orderBy('employeeNo'));

    return from(getDocs(teachersQuery)).pipe(
      map((snapshot) =>
        snapshot.docs.map(
          (docSnap) =>
            ({
              id: docSnap.id,
              ...docSnap.data(),
            }) as Teacher,
        ),
      ),
    );
  }

  addTeacher(teacher: Teacher): Observable<Teacher> {
    const teachersRef = collection(db, this.collectionName);

    const payload = {
      employeeNo: teacher.employeeNo.trim(),
      userId: teacher.userId?.trim() ?? '',
      firstName: teacher.firstName.trim(),
      lastName: teacher.lastName.trim(),
      department: teacher.department.trim(),
      email: teacher.email.trim().toLowerCase(),
      status: teacher.status?.trim() || 'active',
    };

    return from(addDoc(teachersRef, payload)).pipe(
      map((docRef) => ({
        id: docRef.id,
        ...payload,
      })),
    );
  }

  updateTeacher(teacher: Teacher): Observable<Teacher> {
    if (!teacher.id) {
      throw new Error('Teacher ID is required for update.');
    }

    const teacherRef = doc(db, this.collectionName, teacher.id);

    const payload = {
      employeeNo: teacher.employeeNo.trim(),
      userId: teacher.userId?.trim() ?? '',
      firstName: teacher.firstName.trim(),
      lastName: teacher.lastName.trim(),
      department: teacher.department.trim(),
      email: teacher.email.trim().toLowerCase(),
      status: teacher.status?.trim() || 'active',
    };

    return from(updateDoc(teacherRef, payload)).pipe(
      map(() => ({
        id: teacher.id,
        ...payload,
      })),
    );
  }

  deleteTeacher(id: string): Observable<void> {
    const teacherRef = doc(db, this.collectionName, id);
    return from(deleteDoc(teacherRef));
  }
}
