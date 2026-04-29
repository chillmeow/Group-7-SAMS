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
import emailjs from '@emailjs/browser';

import { db } from '../firebase.config';
import { Teacher } from '../models/teacher.model';
import { User } from '../models/user.model';

export interface GeneratedTeacherAccount {
  teacher: Teacher;
  user: User;
  username: string;
  email: string;
  defaultPassword: string;
}

export interface FacultyBulkImportResult {
  imported: number;
  skipped: number;
  accountsGenerated: number;
  errors: string[];
}

@Injectable({
  providedIn: 'root',
})
export class TeacherService {
  private readonly collectionName = 'teachers';
  private readonly usersCollectionName = 'users';

  private readonly emailJsServiceId = 'service_qzjxwhu';
  private readonly emailJsTemplateId = 'template_dspajez';
  private readonly emailJsPublicKey = 'UnALOIKXM83JTF5Pp';

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
    const payload = this.buildTeacherPayload(teacher);

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
    const payload = this.buildTeacherPayload(teacher);

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

  importTeachersFromExcel(file: File): Observable<FacultyBulkImportResult> {
    return from(this.processExcelImport(file));
  }

  generateTeacherPortalAccount(teacher: Teacher): Observable<GeneratedTeacherAccount> {
    if (!teacher.id) {
      return throwError(() => new Error('Teacher ID is required to generate an account.'));
    }

    if (!teacher.employeeNo?.trim()) {
      return throwError(() => new Error('Faculty ID is required to generate an account.'));
    }

    if (!teacher.email?.trim()) {
      return throwError(() => new Error('Faculty email is required to send portal credentials.'));
    }

    if (teacher.userId?.trim()) {
      return throwError(
        () => new Error('This faculty member already has a linked portal account.'),
      );
    }

    return from(this.createPortalAccountForTeacher(teacher));
  }

  generateFacultyId(facultyType: string, sequenceNumber: number): string {
    const prefix = this.getFacultyPrefix(facultyType);
    const year = new Date().getFullYear();
    const paddedNumber = String(sequenceNumber).padStart(4, '0');

    return `${prefix}-${year}-${paddedNumber}`;
  }

  private async processExcelImport(file: File): Promise<FacultyBulkImportResult> {
    const rows = await this.readExcelFile(file);

    const result: FacultyBulkImportResult = {
      imported: 0,
      skipped: 0,
      accountsGenerated: 0,
      errors: [],
    };

    if (rows.length === 0) {
      result.errors.push('Excel file has no valid rows.');
      return result;
    }

    const existingTeachers = await this.getAllTeachersOnce();
    const localCounters = new Map<string, number>();

    for (const row of rows) {
      try {
        const facultyType =
          this.getCellValue(row, [
            'facultyType',
            'Faculty Type',
            'FacultyType',
            'Designation',
            'designation',
            'Position',
            'position',
          ]) || 'instructor';

        const firstName = this.getCellValue(row, [
          'firstName',
          'First Name',
          'Firstname',
          'firstname',
        ]);

        const lastName = this.getCellValue(row, ['lastName', 'Last Name', 'Lastname', 'lastname']);

        const department = this.getCellValue(row, ['department', 'Department', 'Dept', 'dept']);

        const email = this.getCellValue(row, [
          'email',
          'Email',
          'Email Address',
          'emailAddress',
          'Faculty Email',
        ]).toLowerCase();

        const status =
          this.getCellValue(row, ['status', 'Status', 'Attendance Status', 'attendanceStatus']) ||
          'active';

        if (!firstName || !lastName || !department || !email || !facultyType) {
          result.skipped++;
          result.errors.push(
            `Skipped row: missing required data for ${firstName || lastName || 'unknown faculty'}.`,
          );
          continue;
        }

        const existingEmail = await this.findTeacherByEmail(email);

        if (existingEmail) {
          result.skipped++;
          result.errors.push(`Skipped ${email}: faculty email already exists.`);
          continue;
        }

        const normalizedType = this.normalizeFacultyType(facultyType);
        const currentLocalCount = localCounters.get(normalizedType) || 0;
        const baseCount = existingTeachers.filter(
          (teacher) => this.normalizeFacultyType(teacher.facultyType) === normalizedType,
        ).length;

        const employeeNo = this.generateFacultyId(facultyType, baseCount + currentLocalCount + 1);
        localCounters.set(normalizedType, currentLocalCount + 1);

        const teacherPayload: Omit<Teacher, 'id'> = {
          employeeNo,
          userId: '',
          firstName,
          lastName,
          department,
          email,
          facultyType,
          status: status.toLowerCase(),
        };

        await addDoc(collection(db, this.collectionName), teacherPayload);

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

  private async createPortalAccountForTeacher(teacher: Teacher): Promise<GeneratedTeacherAccount> {
    if (!teacher.id) {
      throw new Error('Teacher ID is required to create a portal account.');
    }

    const username = teacher.employeeNo.trim();
    const email = teacher.email.trim().toLowerCase();
    const defaultPassword = this.generateRandomPassword();

    const usersRef = collection(db, this.usersCollectionName);
    const usernameQuery = query(usersRef, where('username', '==', username));
    const existingUserSnapshot = await getDocs(usernameQuery);

    if (!existingUserSnapshot.empty) {
      throw new Error(`A portal account already exists for faculty ID ${username}.`);
    }

    const userPayload: Omit<User, 'id'> = {
      email,
      username,
      firstName: teacher.firstName.trim(),
      lastName: teacher.lastName.trim(),
      role: 'teacher',
      status: 'active',
      defaultPassword,
      mustChangePassword: true,
      accountType: 'institutional-demo',
      createdAt: new Date().toISOString(),
    };

    const userRef = await addDoc(usersRef, userPayload);

    await updateDoc(doc(db, this.collectionName, teacher.id), {
      userId: userRef.id,
      email,
    });

    const updatedTeacher: Teacher = {
      ...teacher,
      userId: userRef.id,
      email,
    };

    await this.sendFacultyAccountEmail({
      facultyName: `${teacher.firstName.trim()} ${teacher.lastName.trim()}`,
      toEmail: email,
      username,
      temporaryPassword: defaultPassword,
    });

    return {
      teacher: updatedTeacher,
      user: {
        id: userRef.id,
        ...userPayload,
      },
      username,
      email,
      defaultPassword,
    };
  }

  private async sendFacultyAccountEmail(data: {
    facultyName: string;
    toEmail: string;
    username: string;
    temporaryPassword: string;
  }): Promise<void> {
    await emailjs.send(
      this.emailJsServiceId,
      this.emailJsTemplateId,
      {
        to_email: data.toEmail,
        faculty_name: data.facultyName,
        username: data.username,
        temporary_password: data.temporaryPassword,
      },
      this.emailJsPublicKey,
    );
  }

  private generateRandomPassword(): string {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijkmnopqrstuvwxyz';
    const numbers = '23456789';
    const symbols = '@#$%';

    const allCharacters = uppercase + lowercase + numbers + symbols;

    let password = 'Sams@';

    for (let i = 0; i < 8; i++) {
      const randomIndex = Math.floor(Math.random() * allCharacters.length);
      password += allCharacters[randomIndex];
    }

    return password;
  }

  private async getAllTeachersOnce(): Promise<Teacher[]> {
    const teachersRef = collection(db, this.collectionName);
    const snapshot = await getDocs(teachersRef);

    return snapshot.docs.map(
      (docSnap) =>
        ({
          id: docSnap.id,
          ...docSnap.data(),
        }) as Teacher,
    );
  }

  private async findTeacherByEmail(email: string): Promise<Teacher | null> {
    const teachersRef = collection(db, this.collectionName);
    const teacherQuery = query(teachersRef, where('email', '==', email));
    const snapshot = await getDocs(teacherQuery);

    if (snapshot.empty) {
      return null;
    }

    const docSnap = snapshot.docs[0];

    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as Teacher;
  }

  private buildTeacherPayload(teacher: Teacher): Omit<Teacher, 'id'> {
    const employeeNo = teacher.employeeNo?.trim() || '';
    const facultyType = teacher.facultyType?.trim() || 'instructor';

    return {
      employeeNo,
      userId: teacher.userId?.trim() ?? '',
      firstName: teacher.firstName.trim(),
      lastName: teacher.lastName.trim(),
      department: teacher.department.trim(),
      email: teacher.email.trim().toLowerCase(),
      facultyType,
      status: teacher.status?.trim() || 'active',
    };
  }

  private getFacultyPrefix(facultyType: string): string {
    const normalized = this.normalizeFacultyType(facultyType);

    if (normalized === 'professor') return 'P';
    if (normalized === 'assistant professor') return 'AP';
    if (normalized === 'associate professor') return 'ASP';
    if (normalized === 'instructor') return 'I';

    return 'FAC';
  }

  private normalizeFacultyType(type: string | undefined): string {
    return (type || '').trim().toLowerCase();
  }
}
