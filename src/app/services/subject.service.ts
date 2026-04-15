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
import { Subject } from '../models/subject.model';

@Injectable({
  providedIn: 'root',
})
export class SubjectService {
  private readonly collectionName = 'subjects';

  getSubjects(): Observable<Subject[]> {
    const subjectsRef = collection(db, this.collectionName);
    const subjectsQuery = query(subjectsRef, orderBy('subjectCode'));

    return from(getDocs(subjectsQuery)).pipe(
      map((snapshot) =>
        snapshot.docs.map(
          (docSnap) =>
            ({
              id: docSnap.id,
              ...docSnap.data(),
              units: Number(docSnap.data()['units']) || 0,
            }) as Subject,
        ),
      ),
    );
  }

  addSubject(subject: Subject): Observable<Subject> {
    const subjectsRef = collection(db, this.collectionName);

    const payload = {
      subjectCode: subject.subjectCode.trim(),
      subjectName: subject.subjectName.trim(),
      units: Number(subject.units) || 0,
      status: (subject.status || 'active').trim().toLowerCase(),
    };

    return from(addDoc(subjectsRef, payload)).pipe(
      map((docRef) => ({
        id: docRef.id,
        ...payload,
      })),
    );
  }

  updateSubject(subject: Subject): Observable<Subject> {
    if (!subject.id) {
      throw new Error('Subject ID is required for update.');
    }

    const subjectRef = doc(db, this.collectionName, subject.id);

    const payload = {
      subjectCode: subject.subjectCode.trim(),
      subjectName: subject.subjectName.trim(),
      units: Number(subject.units) || 0,
      status: (subject.status || 'active').trim().toLowerCase(),
    };

    return from(updateDoc(subjectRef, payload)).pipe(
      map(() => ({
        id: subject.id,
        ...payload,
      })),
    );
  }

  deleteSubject(id: string): Observable<void> {
    const subjectRef = doc(db, this.collectionName, id);
    return from(deleteDoc(subjectRef));
  }
}
