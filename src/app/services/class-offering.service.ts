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
  where,
} from 'firebase/firestore';
import { from, map, Observable, throwError } from 'rxjs';

import { db } from '../firebase.config';
import { ClassOffering, ClassSchedule } from '../models/class-offering.model';

@Injectable({
  providedIn: 'root',
})
export class ClassOfferingService {
  private readonly collectionName = 'classOfferings';

  getClassOfferings(): Observable<ClassOffering[]> {
    const offeringsRef = collection(db, this.collectionName);
    const offeringsQuery = query(offeringsRef, orderBy('offeringCode'));

    return from(getDocs(offeringsQuery)).pipe(
      map((snapshot) =>
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            id: docSnap.id,
            offeringCode: data['offeringCode'] || '',
            subjectId: data['subjectId'] || '',
            subjectCode: data['subjectCode'] || '',
            subjectName: data['subjectName'] || '',
            sectionId: data['sectionId'] || '',
            sectionName: data['sectionName'] || '',
            teacherId: data['teacherId'] || '',
            teacherName: data['teacherName'] || '',
            schoolYear: data['schoolYear'] || '',
            semester: data['semester'] || '',
            schedules: Array.isArray(data['schedules']) ? data['schedules'] : [],
            status: data['status'] || 'active',
            createdAt: data['createdAt'] || '',
            updatedAt: data['updatedAt'] || '',
          } as ClassOffering;
        }),
      ),
    );
  }

  addClassOffering(offering: ClassOffering): Observable<ClassOffering> {
    return from(this.addClassOfferingSafely(offering));
  }

  updateClassOffering(offering: ClassOffering): Observable<ClassOffering> {
    if (!offering.id) {
      return throwError(() => new Error('Class offering ID is required for update.'));
    }

    return from(this.updateClassOfferingSafely(offering));
  }

  deleteClassOffering(id: string): Observable<void> {
    const offeringRef = doc(db, this.collectionName, id);
    return from(deleteDoc(offeringRef));
  }

  private async addClassOfferingSafely(offering: ClassOffering): Promise<ClassOffering> {
    const payload = this.buildOfferingPayload(offering, true);
    const existingOffering = await this.findOfferingByCode(payload.offeringCode);

    if (existingOffering) {
      throw new Error(
        'This class offering already exists for the selected subject, section, school year, and semester.',
      );
    }

    const offeringsRef = collection(db, this.collectionName);
    const docRef = await addDoc(offeringsRef, payload);

    return {
      id: docRef.id,
      ...payload,
    };
  }

  private async updateClassOfferingSafely(offering: ClassOffering): Promise<ClassOffering> {
    if (!offering.id) {
      throw new Error('Class offering ID is required for update.');
    }

    const payload = this.buildOfferingPayload(offering, false);
    const existingOffering = await this.findOfferingByCode(payload.offeringCode);

    if (existingOffering && existingOffering.id !== offering.id) {
      throw new Error(
        'This class offering already exists for the selected subject, section, school year, and semester.',
      );
    }

    const offeringRef = doc(db, this.collectionName, offering.id);
    await updateDoc(offeringRef, payload);

    return {
      id: offering.id,
      ...payload,
    };
  }

  private async findOfferingByCode(offeringCode: string): Promise<ClassOffering | null> {
    const offeringsRef = collection(db, this.collectionName);
    const offeringQuery = query(offeringsRef, where('offeringCode', '==', offeringCode));

    const snapshot = await getDocs(offeringQuery);

    if (snapshot.empty) {
      return null;
    }

    const docSnap = snapshot.docs[0];

    return {
      id: docSnap.id,
      ...(docSnap.data() as Omit<ClassOffering, 'id'>),
    };
  }

  private buildOfferingPayload(offering: ClassOffering, isNew: boolean): Omit<ClassOffering, 'id'> {
    const now = new Date().toISOString();

    const subjectCode = offering.subjectCode.trim().toUpperCase();
    const sectionName = offering.sectionName.trim().toUpperCase();
    const schoolYear = offering.schoolYear.trim();
    const semester = offering.semester.trim();

    const offeringCode = this.generateOfferingCode(subjectCode, sectionName, schoolYear, semester);

    return {
      offeringCode,

      subjectId: offering.subjectId || '',
      subjectCode,
      subjectName: offering.subjectName.trim(),

      sectionId: offering.sectionId || '',
      sectionName,

      teacherId: offering.teacherId || '',
      teacherName: offering.teacherName.trim(),

      schoolYear,
      semester,

      schedules: this.cleanSchedules(offering.schedules || []),

      status: (offering.status || 'active').trim().toLowerCase(),
      createdAt: isNew ? now : offering.createdAt || now,
      updatedAt: now,
    };
  }

  private cleanSchedules(schedules: ClassSchedule[]): ClassSchedule[] {
    return schedules.map((schedule) => ({
      type: schedule.type,
      day: schedule.day.trim(),
      startTime: schedule.startTime.trim(),
      endTime: schedule.endTime.trim(),
      room: schedule.room.trim(),
    }));
  }

  private generateOfferingCode(
    subjectCode: string,
    sectionName: string,
    schoolYear: string,
    semester: string,
  ): string {
    const cleanSchoolYear = schoolYear.replace(/\s+/g, '');
    const cleanSemester = semester.replace(/\s+/g, '').toUpperCase();

    return `${subjectCode}-${sectionName}-${cleanSchoolYear}-${cleanSemester}`;
  }
}
