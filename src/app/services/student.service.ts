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
import { Student } from '../models/student.model';

@Injectable({
  providedIn: 'root',
})
export class StudentService {
  private readonly collectionName = 'students';

  getStudents(): Observable<Student[]> {
    const studentsRef = collection(db, this.collectionName);
    const studentsQuery = query(studentsRef, orderBy('studentNumber'));

    return from(getDocs(studentsQuery)).pipe(
      map((snapshot) =>
        snapshot.docs.map(
          (docSnap) =>
            ({
              id: docSnap.id,
              ...docSnap.data(),
            }) as Student,
        ),
      ),
    );
  }

  addStudent(student: Student): Observable<Student> {
    const studentsRef = collection(db, this.collectionName);

    const payload = {
      userId: student.userId?.trim() ?? '',
      studentNumber: student.studentNumber.trim(),
      firstName: student.firstName.trim(),
      lastName: student.lastName.trim(),
      email: student.email.trim().toLowerCase(),
      sectionId: student.sectionId.trim(),
      yearLevel: student.yearLevel.trim(),
      status: student.status?.trim() || 'active',
    };

    return from(addDoc(studentsRef, payload)).pipe(
      map((docRef) => ({
        id: docRef.id,
        ...payload,
      })),
    );
  }

  updateStudent(student: Student): Observable<Student> {
    if (!student.id) {
      throw new Error('Student ID is required for update.');
    }

    const studentRef = doc(db, this.collectionName, student.id);

    const payload = {
      userId: student.userId?.trim() ?? '',
      studentNumber: student.studentNumber.trim(),
      firstName: student.firstName.trim(),
      lastName: student.lastName.trim(),
      email: student.email.trim().toLowerCase(),
      sectionId: student.sectionId.trim(),
      yearLevel: student.yearLevel.trim(),
      status: student.status?.trim() || 'active',
    };

    return from(updateDoc(studentRef, payload)).pipe(
      map(() => ({
        id: student.id,
        ...payload,
      })),
    );
  }

  deleteStudent(id: string): Observable<void> {
    const studentRef = doc(db, this.collectionName, id);
    return from(deleteDoc(studentRef));
  }
}
