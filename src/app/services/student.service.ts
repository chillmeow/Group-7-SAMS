import { Injectable, inject } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import { Student } from '../models/student.model';
import { User } from '../models/user.model';
import { Parent } from '../models/parent.model';
import { ParentService } from './parent.service';

export interface GeneratedStudentAccount {
  student: Student;
  user: User;
  username: string;
  email: string;
  defaultPassword: string;
}

export interface BulkImportResult {
  imported: number;
  skipped: number;
  accountsGenerated: number;
  errors: string[];
}

@Injectable({
  providedIn: 'root',
})
export class StudentService {
  private readonly parentService = inject(ParentService);

  private readonly collectionName = 'students';
  private readonly usersCollectionName = 'users';
  private readonly parentsCollectionName = 'parents';

  private readonly emailJsServiceId = 'service_qzjxwhu';
  private readonly emailJsTemplateId = 'template_92weais';
  private readonly emailJsPublicKey = 'UnALOIKXM83JTF5Pp';

  private readonly parentEmailJsServiceId = 'service_39eo5ff';
  private readonly parentEmailJsTemplateId = 'template_c6kswcp';
  private readonly parentEmailJsPublicKey = 'wFj-vj8BquyGeXNAs';

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
    return from(this.addStudentWithParent(student));
  }

  updateStudent(student: Student): Observable<Student> {
    if (!student.id) {
      throw new Error('Student ID is required for update.');
    }

    const studentRef = doc(db, this.collectionName, student.id);
    const payload = this.buildStudentPayload(student);

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

  generateStudentPortalAccount(student: Student): Observable<GeneratedStudentAccount> {
    if (!student.id) {
      return throwError(() => new Error('Student ID is required to generate an account.'));
    }

    if (!student.studentNumber?.trim()) {
      return throwError(() => new Error('Student number is required to generate an account.'));
    }

    return from(this.createPortalAccountsForStudentAndParent(student));
  }

  importStudentsFromExcel(file: File): Observable<BulkImportResult> {
    return from(this.processExcelImport(file));
  }

  private async addStudentWithParent(student: Student): Promise<Student> {
    const studentsRef = collection(db, this.collectionName);
    const payload = this.buildStudentPayload(student);

    const existingStudent = await this.findStudentByStudentNumber(payload.studentNumber);

    if (existingStudent) {
      throw new Error(`Student number ${payload.studentNumber} already exists.`);
    }

    const studentRef = await addDoc(studentsRef, payload);

    let createdStudent: Student = {
      id: studentRef.id,
      ...payload,
    };

    if (this.hasCompleteParentDetails(createdStudent)) {
      const parent = await this.parentService.createOrLinkParentForStudent({
        studentId: studentRef.id,
        parentFirstName: createdStudent.parentFirstName || '',
        parentLastName: createdStudent.parentLastName || '',
        parentEmail: createdStudent.parentEmail || '',
        parentContactNumber: createdStudent.parentContactNumber || '',
        parentRelationship: createdStudent.parentRelationship || '',
      });

      await updateDoc(doc(db, this.collectionName, studentRef.id), {
        parentId: parent.id || '',
      });

      createdStudent = {
        ...createdStudent,
        parentId: parent.id || '',
      };
    }

    return createdStudent;
  }

  private async createPortalAccountsForStudentAndParent(
    student: Student,
  ): Promise<GeneratedStudentAccount> {
    const latestStudent = await this.getLatestStudentRecord(student);

    if (!latestStudent.id) {
      throw new Error('Student ID is required to create portal accounts.');
    }

    if (!this.hasCompleteParentDetails(latestStudent)) {
      throw new Error(
        'Complete parent information is required before generating student and parent accounts.',
      );
    }

    const parent = await this.parentService.createOrLinkParentForStudent({
      studentId: latestStudent.id,
      parentFirstName: latestStudent.parentFirstName || '',
      parentLastName: latestStudent.parentLastName || '',
      parentEmail: latestStudent.parentEmail || '',
      parentContactNumber: latestStudent.parentContactNumber || '',
      parentRelationship: latestStudent.parentRelationship || '',
    });

    await updateDoc(doc(db, this.collectionName, latestStudent.id), {
      parentId: parent.id || '',
    });

    const updatedStudent: Student = {
      ...latestStudent,
      parentId: parent.id || '',
    };

    const studentAccount = await this.createStudentUserAccount(updatedStudent);
    await this.createParentUserAccount(parent, updatedStudent);

    return studentAccount;
  }

  private async createStudentUserAccount(student: Student): Promise<GeneratedStudentAccount> {
    if (!student.id) {
      throw new Error('Student ID is required to create a portal account.');
    }

    const username = student.studentNumber.trim();
    const email = student.email?.trim().toLowerCase();

    if (!email) {
      throw new Error('Student email is required to create a portal account.');
    }

    const defaultPassword = `Sams@${username}`;

    const usersRef = collection(db, this.usersCollectionName);
    const usernameQuery = query(usersRef, where('username', '==', username));
    const existingUserSnapshot = await getDocs(usernameQuery);

    let userId = student.userId?.trim() || '';
    let userPayload: Omit<User, 'id'>;
    let shouldSendStudentEmail = false;

    if (!existingUserSnapshot.empty) {
      const existingUserDoc = existingUserSnapshot.docs[0];

      userId = existingUserDoc.id;
      userPayload = existingUserDoc.data() as Omit<User, 'id'>;
    } else {
      userPayload = {
        email,
        username,
        firstName: student.firstName.trim(),
        lastName: student.lastName.trim(),
        role: 'student',
        status: 'active',
        defaultPassword,
        mustChangePassword: true,
        accountType: 'institutional-demo',
        createdAt: new Date().toISOString(),
      };

      const userRef = await addDoc(usersRef, userPayload);

      userId = userRef.id;
      shouldSendStudentEmail = true;
    }

    await updateDoc(doc(db, this.collectionName, student.id), {
      userId,
      email,
      parentId: student.parentId || '',
    });

    const updatedStudent: Student = {
      ...student,
      userId,
      email,
    };

    if (shouldSendStudentEmail) {
      await this.sendStudentAccountEmail({
        studentName: `${updatedStudent.firstName.trim()} ${updatedStudent.lastName.trim()}`,
        toEmail: email,
        username,
        temporaryPassword: defaultPassword,
      });
    }

    return {
      student: updatedStudent,
      user: {
        id: userId,
        ...userPayload,
      },
      username,
      email,
      defaultPassword,
    };
  }

  private async createParentUserAccount(parent: Parent, student: Student): Promise<void> {
    if (!parent.id) {
      throw new Error('Parent record is required before generating parent account.');
    }

    const parentEmail = parent.email?.trim().toLowerCase();

    if (!parentEmail) {
      throw new Error('Parent email is required to create parent portal account.');
    }

    const parentUsername = this.generateParentUsername(parent, student);
    const parentPassword = this.generateRandomPassword();

    const usersRef = collection(db, this.usersCollectionName);
    const usernameQuery = query(usersRef, where('username', '==', parentUsername));
    const existingUserSnapshot = await getDocs(usernameQuery);

    let parentUserId = parent.userId?.trim() || '';
    let passwordToSend = parentPassword;

    if (!existingUserSnapshot.empty) {
      const existingParentUserDoc = existingUserSnapshot.docs[0];
      const existingParentUser = existingParentUserDoc.data() as Omit<User, 'id'>;

      parentUserId = existingParentUserDoc.id;
      passwordToSend = existingParentUser.defaultPassword || parentPassword;
    } else {
      const parentUserPayload: Omit<User, 'id'> = {
        email: parentEmail,
        username: parentUsername,
        firstName: parent.firstName.trim(),
        lastName: parent.lastName.trim(),
        role: 'parent',
        status: 'active',
        defaultPassword: parentPassword,
        mustChangePassword: true,
        accountType: 'institutional-demo',
        createdAt: new Date().toISOString(),
      };

      const parentUserRef = await addDoc(usersRef, parentUserPayload);

      parentUserId = parentUserRef.id;
      passwordToSend = parentPassword;
    }

    await updateDoc(doc(db, this.parentsCollectionName, parent.id), {
      userId: parentUserId,
      updatedAt: new Date().toISOString(),
    });

    await this.sendParentAccountEmail({
      parentName: `${parent.firstName.trim()} ${parent.lastName.trim()}`,
      studentName: `${student.firstName.trim()} ${student.lastName.trim()}`,
      toEmail: parentEmail,
      username: parentUsername,
      temporaryPassword: passwordToSend,
    });
  }

  private async getLatestStudentRecord(student: Student): Promise<Student> {
    if (!student.id) {
      return student;
    }

    const studentRef = doc(db, this.collectionName, student.id);
    const studentSnapshot = await getDoc(studentRef);

    if (!studentSnapshot.exists()) {
      return student;
    }

    return {
      ...student,
      id: studentSnapshot.id,
      ...(studentSnapshot.data() as Omit<Student, 'id'>),
    };
  }

  private async processExcelImport(file: File): Promise<BulkImportResult> {
    const rows = await this.readExcelFile(file);

    const result: BulkImportResult = {
      imported: 0,
      skipped: 0,
      accountsGenerated: 0,
      errors: [],
    };

    if (rows.length === 0) {
      result.errors.push('Excel file has no valid rows.');
      return result;
    }

    for (const row of rows) {
      try {
        const studentNumber = this.getCellValue(row, [
          'studentNumber',
          'Student Number',
          'student number',
          'Student No',
          'Student No.',
          'Student ID',
          'student_id',
        ]);

        const firstName = this.getCellValue(row, [
          'firstName',
          'First Name',
          'first name',
          'Firstname',
          'firstname',
        ]);

        const lastName = this.getCellValue(row, [
          'lastName',
          'Last Name',
          'last name',
          'Lastname',
          'lastname',
        ]);

        const email = this.getCellValue(row, [
          'email',
          'Email',
          'Email Address',
          'emailAddress',
          'Student Email',
        ]).toLowerCase();

        const sectionId = this.getCellValue(row, [
          'sectionId',
          'Section ID',
          'section id',
          'Section',
          'section',
        ]);

        const yearLevel = this.getCellValue(row, [
          'yearLevel',
          'Year Level',
          'year level',
          'Year',
          'year',
        ]);

        const status =
          this.getCellValue(row, [
            'status',
            'Status',
            'Attendance Status',
            'attendanceStatus',
            'AttendanceStatus',
          ]) || 'active';

        const parentFirstName = this.getCellValue(row, [
          'parentFirstName',
          'Parent First Name',
          'Guardian First Name',
          'GuardianFirstName',
        ]);

        const parentLastName = this.getCellValue(row, [
          'parentLastName',
          'Parent Last Name',
          'Guardian Last Name',
          'GuardianLastName',
        ]);

        const parentEmail = this.getCellValue(row, [
          'parentEmail',
          'Parent Email',
          'Guardian Email',
          'GuardianEmail',
        ]).toLowerCase();

        const parentContactNumber = this.getCellValue(row, [
          'parentContactNumber',
          'Parent Contact Number',
          'Parent Contact',
          'Guardian Contact Number',
          'Guardian Contact',
        ]);

        const parentRelationship =
          this.getCellValue(row, [
            'parentRelationship',
            'Parent Relationship',
            'Relationship',
            'Guardian Relationship',
          ]) || 'Parent';

        if (!studentNumber || !firstName || !lastName || !email || !sectionId || !yearLevel) {
          result.skipped++;
          result.errors.push(
            `Skipped row: missing required student data for ${studentNumber || 'unknown student'}.`,
          );
          continue;
        }

        const existingStudent = await this.findStudentByStudentNumber(studentNumber);

        if (existingStudent) {
          result.skipped++;
          result.errors.push(`Skipped ${studentNumber}: student already exists.`);
          continue;
        }

        const studentRef = await addDoc(collection(db, this.collectionName), {
          userId: '',
          parentId: '',
          studentNumber,
          firstName,
          lastName,
          email,
          sectionId,
          yearLevel,
          status: status.toLowerCase(),
          parentFirstName,
          parentLastName,
          parentEmail,
          parentContactNumber,
          parentRelationship,
        });

        const createdStudent: Student = {
          id: studentRef.id,
          userId: '',
          parentId: '',
          studentNumber,
          firstName,
          lastName,
          email,
          sectionId,
          yearLevel,
          status: status.toLowerCase(),
          parentFirstName,
          parentLastName,
          parentEmail,
          parentContactNumber,
          parentRelationship,
        };

        if (this.hasCompleteParentDetails(createdStudent)) {
          const parent = await this.parentService.createOrLinkParentForStudent({
            studentId: studentRef.id,
            parentFirstName,
            parentLastName,
            parentEmail,
            parentContactNumber,
            parentRelationship,
          });

          await updateDoc(doc(db, this.collectionName, studentRef.id), {
            parentId: parent.id || '',
          });

          createdStudent.parentId = parent.id || '';
        }

        await this.createPortalAccountsForStudentAndParent(createdStudent);

        result.imported++;
        result.accountsGenerated++;
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

  private async findStudentByStudentNumber(studentNumber: string): Promise<Student | null> {
    const studentsRef = collection(db, this.collectionName);
    const studentQuery = query(studentsRef, where('studentNumber', '==', studentNumber));
    const snapshot = await getDocs(studentQuery);

    if (snapshot.empty) {
      return null;
    }

    const docSnap = snapshot.docs[0];

    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as Student;
  }

  private buildStudentPayload(student: Student): Omit<Student, 'id'> {
    const studentNumber = student.studentNumber.trim();
    const email = student.email?.trim().toLowerCase() || '';

    return {
      userId: student.userId?.trim() ?? '',
      parentId: student.parentId?.trim() ?? '',
      studentNumber,
      firstName: student.firstName.trim(),
      lastName: student.lastName.trim(),
      email,
      sectionId: student.sectionId.trim(),
      yearLevel: student.yearLevel.trim(),
      status: student.status?.trim() || 'active',

      parentFirstName: student.parentFirstName?.trim() || '',
      parentLastName: student.parentLastName?.trim() || '',
      parentEmail: student.parentEmail?.trim().toLowerCase() || '',
      parentContactNumber: student.parentContactNumber?.trim() || '',
      parentRelationship: student.parentRelationship?.trim() || '',
    };
  }

  private hasCompleteParentDetails(student: Student): boolean {
    return Boolean(
      student.parentFirstName?.trim() &&
      student.parentLastName?.trim() &&
      student.parentEmail?.trim() &&
      student.parentContactNumber?.trim() &&
      student.parentRelationship?.trim(),
    );
  }

  private generateParentUsername(parent: Parent, student: Student): string {
    const cleanStudentNumber = student.studentNumber.replace(/\s+/g, '').trim();

    const relationship = (parent.relationship || student.parentRelationship || 'parent')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    return `P-${cleanStudentNumber}-${relationship}`;
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

  private async sendStudentAccountEmail(data: {
    studentName: string;
    toEmail: string;
    username: string;
    temporaryPassword: string;
  }): Promise<void> {
    await emailjs.send(
      this.emailJsServiceId,
      this.emailJsTemplateId,
      {
        to_email: data.toEmail,
        student_name: data.studentName,
        username: data.username,
        temporary_password: data.temporaryPassword,
      },
      this.emailJsPublicKey,
    );
  }

  private async sendParentAccountEmail(data: {
    parentName: string;
    studentName: string;
    toEmail: string;
    username: string;
    temporaryPassword: string;
  }): Promise<void> {
    await emailjs.send(
      this.parentEmailJsServiceId,
      this.parentEmailJsTemplateId,
      {
        to_email: data.toEmail,
        parent_name: data.parentName,
        student_name: data.studentName,
        username: data.username,
        temporary_password: data.temporaryPassword,
      },
      this.parentEmailJsPublicKey,
    );
  }
}
