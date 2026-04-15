import { Injectable } from '@angular/core';
import { addDoc, collection, deleteDoc, doc, getDocs, query, updateDoc } from 'firebase/firestore';
import { from, map, Observable } from 'rxjs';

import { db } from '../firebase.config';
import { ClassOffering } from '../models/class-offering.model';

@Injectable({
  providedIn: 'root',
})
export class ClassOfferingService {
  private readonly collectionName = 'classOfferings';

  getClassOfferings(): Observable<ClassOffering[]> {
    const offeringsRef = collection(db, this.collectionName);
    const offeringsQuery = query(offeringsRef);

    return from(getDocs(offeringsQuery)).pipe(
      map((snapshot) =>
        snapshot.docs.map(
          (docSnap) =>
            ({
              id: docSnap.id,
              ...docSnap.data(),
            }) as ClassOffering,
        ),
      ),
    );
  }

  addClassOffering(offering: ClassOffering): Observable<ClassOffering> {
    const offeringsRef = collection(db, this.collectionName);

    const payload = {
      subjectId: offering.subjectId.trim(),
      teacherId: offering.teacherId.trim(),
      sectionId: offering.sectionId.trim(),
      room: offering.room.trim(),
      schedule: offering.schedule.trim(),
    };

    return from(addDoc(offeringsRef, payload)).pipe(
      map((docRef) => ({
        id: docRef.id,
        ...payload,
      })),
    );
  }

  updateClassOffering(offering: ClassOffering): Observable<ClassOffering> {
    if (!offering.id) {
      throw new Error('Class offering ID is required for update.');
    }

    const offeringRef = doc(db, this.collectionName, offering.id);

    const payload = {
      subjectId: offering.subjectId.trim(),
      teacherId: offering.teacherId.trim(),
      sectionId: offering.sectionId.trim(),
      room: offering.room.trim(),
      schedule: offering.schedule.trim(),
    };

    return from(updateDoc(offeringRef, payload)).pipe(
      map(() => ({
        id: offering.id,
        ...payload,
      })),
    );
  }

  deleteClassOffering(id: string): Observable<void> {
    const offeringRef = doc(db, this.collectionName, id);
    return from(deleteDoc(offeringRef));
  }
}
