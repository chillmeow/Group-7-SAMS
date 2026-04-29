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
import { Section } from '../models/section.model';

@Injectable({
  providedIn: 'root',
})
export class SectionService {
  private readonly collectionName = 'sections';

  getSections(): Observable<Section[]> {
    const sectionsRef = collection(db, this.collectionName);
    const sectionsQuery = query(sectionsRef, orderBy('sectionCode'));

    return from(getDocs(sectionsQuery)).pipe(
      map((snapshot) =>
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data();

          return {
            id: docSnap.id,
            sectionCode: data['sectionCode'] || '',
            sectionName: data['sectionName'] || '',
            program: data['program'] || '',
            yearLevel: data['yearLevel'] || '',
            semester: data['semester'] || '',
            adviserId: data['adviserId'] || '',
            adviserName: data['adviserName'] || '',
            schoolYear: data['schoolYear'] || '',
            capacity: Number(data['capacity'] || 0),
            status: data['status'] || 'active',
            createdAt: data['createdAt'] || '',
            updatedAt: data['updatedAt'] || '',
          } as Section;
        }),
      ),
    );
  }

  addSection(section: Section): Observable<Section> {
    return from(this.addSectionSafely(section));
  }

  updateSection(section: Section): Observable<Section> {
    if (!section.id) {
      return throwError(() => new Error('Section ID is required for update.'));
    }

    return from(this.updateSectionSafely(section));
  }

  deleteSection(id: string): Observable<void> {
    const sectionRef = doc(db, this.collectionName, id);
    return from(deleteDoc(sectionRef));
  }

  private async addSectionSafely(section: Section): Promise<Section> {
    const payload = this.buildSectionPayload(section, true);
    const existingSection = await this.findSectionByCode(payload.sectionCode);

    if (existingSection) {
      throw new Error(`${this.getReadableSection(payload)} already exists.`);
    }

    const sectionsRef = collection(db, this.collectionName);
    const docRef = await addDoc(sectionsRef, payload);

    return {
      id: docRef.id,
      ...payload,
    };
  }

  private async updateSectionSafely(section: Section): Promise<Section> {
    if (!section.id) {
      throw new Error('Section ID is required for update.');
    }

    const payload = this.buildSectionPayload(section, false);
    const existingSection = await this.findSectionByCode(payload.sectionCode);

    if (existingSection && existingSection.id !== section.id) {
      throw new Error(`${this.getReadableSection(payload)} already exists.`);
    }

    const sectionRef = doc(db, this.collectionName, section.id);
    await updateDoc(sectionRef, payload);

    return {
      id: section.id,
      ...payload,
    };
  }

  private async findSectionByCode(sectionCode: string): Promise<Section | null> {
    const sectionsRef = collection(db, this.collectionName);
    const sectionQuery = query(sectionsRef, where('sectionCode', '==', sectionCode));

    const snapshot = await getDocs(sectionQuery);

    if (snapshot.empty) {
      return null;
    }

    const docSnap = snapshot.docs[0];

    return {
      id: docSnap.id,
      ...(docSnap.data() as Omit<Section, 'id'>),
    };
  }

  private buildSectionPayload(section: Section, isNew: boolean): Omit<Section, 'id'> {
    const now = new Date().toISOString();

    const program = section.program.trim();
    const yearLevel = section.yearLevel.trim();
    const semester = section.semester.trim();
    const sectionName = section.sectionName.trim().toUpperCase();
    const schoolYear = section.schoolYear.trim();
    const capacity = Number(section.capacity || 0);

    const sectionCode = this.generateSectionCode(
      program,
      yearLevel,
      sectionName,
      schoolYear,
      semester,
    );

    return {
      sectionCode,
      sectionName,
      program,
      yearLevel,
      semester,
      adviserId: section.adviserId || '',
      adviserName: section.adviserName || '',
      schoolYear,
      capacity,
      status: (section.status || 'active').trim().toLowerCase(),
      createdAt: isNew ? now : section.createdAt || now,
      updatedAt: now,
    };
  }

  private generateSectionCode(
    program: string,
    yearLevel: string,
    sectionName: string,
    schoolYear: string,
    semester: string,
  ): string {
    const programCode = this.getProgramCode(program);
    const yearCode = this.getYearCode(yearLevel);
    const semesterCode = this.getSemesterCode(semester);
    const cleanSection = sectionName.replace(/\s+/g, '').toUpperCase();
    const cleanSchoolYear = schoolYear.replace(/\s+/g, '');

    return `${programCode}-${yearCode}${cleanSection}-${cleanSchoolYear}-${semesterCode}`;
  }

  private getProgramCode(program: string): string {
    const normalized = program.trim().toLowerCase();

    if (normalized.includes('information technology')) return 'IT';
    if (normalized.includes('technology communication management')) return 'TCM';
    if (normalized.includes('electro-mechanical technology')) return 'EMT';

    return program
      .split(/\s+/)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase();
  }

  private getYearCode(yearLevel: string): string {
    if (yearLevel.includes('1')) return '1';
    if (yearLevel.includes('2')) return '2';
    if (yearLevel.includes('3')) return '3';
    if (yearLevel.includes('4')) return '4';

    return yearLevel.replace(/\D/g, '') || '0';
  }

  private getSemesterCode(semester: string): string {
    const normalized = semester.trim().toLowerCase();

    if (normalized.includes('1')) return '1ST';
    if (normalized.includes('2')) return '2ND';
    if (normalized.includes('summer')) return 'SUMMER';

    return semester.replace(/\s+/g, '').toUpperCase();
  }

  private getReadableSection(section: Omit<Section, 'id'>): string {
    return `${section.program} ${section.yearLevel} - Block ${section.sectionName}, ${section.schoolYear}, ${section.semester}`;
  }
}
