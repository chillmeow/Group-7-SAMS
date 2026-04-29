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
import * as XLSX from 'xlsx';

import { db } from '../firebase.config';
import { Subject } from '../models/subject.model';

export interface SubjectBulkImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

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
              subjectCode: docSnap.data()['subjectCode'] || '',
              subjectName: docSnap.data()['subjectName'] || '',
              program: docSnap.data()['program'] || '',
              yearLevel: docSnap.data()['yearLevel'] || '',
              semester: docSnap.data()['semester'] || '',
              units: Number(docSnap.data()['units']) || 0,
              lectureHours: Number(docSnap.data()['lectureHours']) || 0,
              labHours: Number(docSnap.data()['labHours']) || 0,
              status: docSnap.data()['status'] || 'active',
              createdAt: docSnap.data()['createdAt'] || '',
              updatedAt: docSnap.data()['updatedAt'] || '',
            }) as Subject,
        ),
      ),
    );
  }

  addSubject(subject: Subject): Observable<Subject> {
    return from(this.addSubjectSafely(subject));
  }

  updateSubject(subject: Subject): Observable<Subject> {
    if (!subject.id) {
      return throwError(() => new Error('Subject ID is required for update.'));
    }

    return from(this.updateSubjectSafely(subject));
  }

  deleteSubject(id: string): Observable<void> {
    const subjectRef = doc(db, this.collectionName, id);
    return from(deleteDoc(subjectRef));
  }

  importSubjectsFromExcel(file: File): Observable<SubjectBulkImportResult> {
    return from(this.processExcelImport(file));
  }

  private async addSubjectSafely(subject: Subject): Promise<Subject> {
    const payload = this.buildSubjectPayload(subject, true);

    const existingSubject = await this.findSubjectByCode(payload.subjectCode);

    if (existingSubject) {
      throw new Error(`Subject code ${payload.subjectCode} already exists.`);
    }

    const subjectsRef = collection(db, this.collectionName);
    const docRef = await addDoc(subjectsRef, payload);

    return {
      id: docRef.id,
      ...payload,
    };
  }

  private async updateSubjectSafely(subject: Subject): Promise<Subject> {
    if (!subject.id) {
      throw new Error('Subject ID is required for update.');
    }

    const payload = this.buildSubjectPayload(subject, false);
    const existingSubject = await this.findSubjectByCode(payload.subjectCode);

    if (existingSubject && existingSubject.id !== subject.id) {
      throw new Error(`Subject code ${payload.subjectCode} already exists.`);
    }

    const subjectRef = doc(db, this.collectionName, subject.id);
    await updateDoc(subjectRef, payload);

    return {
      id: subject.id,
      ...payload,
    };
  }

  private async processExcelImport(file: File): Promise<SubjectBulkImportResult> {
    const rows = await this.readExcelFile(file);

    const result: SubjectBulkImportResult = {
      imported: 0,
      skipped: 0,
      errors: [],
    };

    if (rows.length === 0) {
      result.errors.push('Excel file has no valid rows.');
      return result;
    }

    for (const row of rows) {
      try {
        const subjectCode = this.getCellValue(row, [
          'subjectCode',
          'Subject Code',
          'SubjectCode',
          'Code',
          'code',
        ]);

        const subjectName = this.getCellValue(row, [
          'subjectName',
          'Subject Name',
          'SubjectName',
          'Title',
          'title',
          'Course Title',
        ]);

        const program = this.getCellValue(row, [
          'program',
          'Program',
          'Department',
          'department',
          'Course',
          'course',
        ]);

        const yearLevel = this.getCellValue(row, [
          'yearLevel',
          'Year Level',
          'YearLevel',
          'Year',
          'year',
        ]);

        const semester = this.getCellValue(row, ['semester', 'Semester', 'Term', 'term']);

        const units = Number(this.getCellValue(row, ['units', 'Units', 'Unit', 'unit']) || 0);

        const lectureHours = Number(
          this.getCellValue(row, [
            'lectureHours',
            'Lecture Hours',
            'LectureHours',
            'Lec Hours',
            'lecHours',
          ]) || 0,
        );

        const labHours = Number(
          this.getCellValue(row, [
            'labHours',
            'Lab Hours',
            'Laboratory Hours',
            'LaboratoryHours',
            'lab',
          ]) || 0,
        );

        const status = this.getCellValue(row, ['status', 'Status']) || 'active';

        if (!subjectCode || !subjectName || !program || !yearLevel || !semester || units <= 0) {
          result.skipped++;
          result.errors.push(
            `Skipped row: missing required data for ${subjectCode || subjectName || 'unknown subject'}.`,
          );
          continue;
        }

        const existingSubject = await this.findSubjectByCode(subjectCode);

        if (existingSubject) {
          result.skipped++;
          result.errors.push(`Skipped ${subjectCode}: subject code already exists.`);
          continue;
        }

        const payload = this.buildSubjectPayload(
          {
            subjectCode,
            subjectName,
            program,
            yearLevel,
            semester,
            units,
            lectureHours,
            labHours,
            status,
          },
          true,
        );

        await addDoc(collection(db, this.collectionName), payload);
        result.imported++;
      } catch (error) {
        result.skipped++;
        result.errors.push(error instanceof Error ? error.message : 'Unknown import error.');
      }
    }

    return result;
  }

  private readExcelFile(file: File): Promise<Record<string, unknown>[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];

          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
            defval: '',
          });

          resolve(rows);
        } catch {
          reject(new Error('Unable to read Excel file.'));
        }
      };

      reader.onerror = () => reject(new Error('Unable to read Excel file.'));
      reader.readAsArrayBuffer(file);
    });
  }

  private getCellValue(row: Record<string, unknown>, possibleKeys: string[]): string {
    for (const key of possibleKeys) {
      const value = row[key];

      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return String(value).trim();
      }
    }

    return '';
  }

  private async findSubjectByCode(subjectCode: string): Promise<Subject | null> {
    const subjectsRef = collection(db, this.collectionName);
    const subjectQuery = query(
      subjectsRef,
      where('subjectCode', '==', subjectCode.trim().toUpperCase()),
    );

    const snapshot = await getDocs(subjectQuery);

    if (snapshot.empty) {
      return null;
    }

    const docSnap = snapshot.docs[0];

    return {
      id: docSnap.id,
      ...(docSnap.data() as Omit<Subject, 'id'>),
    };
  }

  private buildSubjectPayload(subject: Subject, isNew: boolean): Omit<Subject, 'id'> {
    const now = new Date().toISOString();

    return {
      subjectCode: subject.subjectCode.trim().toUpperCase(),
      subjectName: subject.subjectName.trim(),
      program: subject.program.trim(),
      yearLevel: subject.yearLevel.trim(),
      semester: subject.semester.trim(),
      units: Number(subject.units) || 0,
      lectureHours: Number(subject.lectureHours) || 0,
      labHours: Number(subject.labHours) || 0,
      status: (subject.status || 'active').trim().toLowerCase(),
      createdAt: isNew ? now : subject.createdAt || now,
      updatedAt: now,
    };
  }
}
