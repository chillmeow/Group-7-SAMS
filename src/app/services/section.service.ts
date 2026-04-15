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
import { Section } from '../models/section.model';

@Injectable({
  providedIn: 'root',
})
export class SectionService {
  private readonly collectionName = 'sections';

  getSections(): Observable<Section[]> {
    const sectionsRef = collection(db, this.collectionName);
    const sectionsQuery = query(sectionsRef, orderBy('sectionName'));

    return from(getDocs(sectionsQuery)).pipe(
      map((snapshot) =>
        snapshot.docs.map(
          (docSnap) =>
            ({
              id: docSnap.id,
              ...docSnap.data(),
              capacity: Number(docSnap.data()['capacity']) || 0,
              students: Number(docSnap.data()['students']) || 0,
            }) as Section,
        ),
      ),
    );
  }

  addSection(section: Section): Observable<Section> {
    const sectionsRef = collection(db, this.collectionName);

    const payload = {
      sectionName: section.sectionName.trim(),
      yearLevel: section.yearLevel.trim(),
      adviser: section.adviser.trim(),
      capacity: Number(section.capacity) || 0,
      students: Number(section.students) || 0,
      status: (section.status || 'active').trim().toLowerCase(),
    };

    return from(addDoc(sectionsRef, payload)).pipe(
      map((docRef) => ({
        id: docRef.id,
        ...payload,
      })),
    );
  }

  updateSection(section: Section): Observable<Section> {
    if (!section.id) {
      throw new Error('Section ID is required for update.');
    }

    const sectionRef = doc(db, this.collectionName, section.id);

    const payload = {
      sectionName: section.sectionName.trim(),
      yearLevel: section.yearLevel.trim(),
      adviser: section.adviser.trim(),
      capacity: Number(section.capacity) || 0,
      students: Number(section.students) || 0,
      status: (section.status || 'active').trim().toLowerCase(),
    };

    return from(updateDoc(sectionRef, payload)).pipe(
      map(() => ({
        id: section.id,
        ...payload,
      })),
    );
  }

  deleteSection(id: string): Observable<void> {
    const sectionRef = doc(db, this.collectionName, id);
    return from(deleteDoc(sectionRef));
  }
}
