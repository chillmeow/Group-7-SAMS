import { Injectable } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Observable, from, map, switchMap, throwError } from 'rxjs';

import { db } from '../firebase.config';
import { AttendanceSession } from '../models/attendance-session.model';
import { AttendanceRecord, AttendanceStatus } from '../models/attendance-record.model';
import { AttendanceRequest } from '../models/attendance-request.model';
import { Student } from '../models/student.model';
import { ClassOffering } from '../models/class-offering.model';

@Injectable({
  providedIn: 'root',
})
export class AttendanceService {
  private readonly sessionsCollection = collection(db, 'sessions');
  private readonly recordsCollection = collection(db, 'attendance');
  private readonly requestsCollection = collection(db, 'attendanceRequests');
  private readonly studentsCollection = collection(db, 'students');
  private readonly classOfferingsCollection = collection(db, 'classOfferings');

  getSessions(): Observable<AttendanceSession[]> {
    return from(getDocs(this.sessionsCollection)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((docSnap) => this.mapSession(docSnap.id, docSnap.data()))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
      ),
    );
  }

  getSessionById(sessionId: string): Observable<AttendanceSession | undefined> {
    return from(getDoc(doc(db, 'sessions', sessionId))).pipe(
      map((docSnap) => {
        if (!docSnap.exists()) return undefined;
        return this.mapSession(docSnap.id, docSnap.data());
      }),
    );
  }

  createSession(classOfferingId: string, instructorId: string): Observable<AttendanceSession> {
    const now = new Date();

    const payload: Omit<AttendanceSession, 'id'> = {
      classOfferingId,
      instructorId,
      date: now.toISOString().split('T')[0],
      startTime: now.toISOString(),
      sessionCode: this.generateSessionCode(),
      qrToken: this.generateQrToken(),
      status: 'active',
      createdAt: now.toISOString(),
      lateThresholdMinutes: 10,
    };

    return from(
      runTransaction(db, async (transaction) => {
        const sessionRef = doc(this.sessionsCollection);
        transaction.set(sessionRef, payload);

        return {
          id: sessionRef.id,
          ...payload,
        };
      }),
    );
  }

  closeSession(sessionId: string): Observable<AttendanceSession> {
    return from(this.closeSessionAndMarkAbsentees(sessionId));
  }

  deleteSession(id: string): Observable<void> {
    return from(deleteDoc(doc(db, 'sessions', id))).pipe(map(() => void 0));
  }

  getRecords(): Observable<AttendanceRecord[]> {
    return from(getDocs(this.recordsCollection)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((docSnap) => this.mapRecord(docSnap.id, docSnap.data()))
          .sort((a, b) => (b.timeRecorded || '').localeCompare(a.timeRecorded || '')),
      ),
    );
  }

  getRecordsBySession(sessionId: string): Observable<AttendanceRecord[]> {
    const q = query(this.recordsCollection, where('sessionId', '==', sessionId));

    return from(getDocs(q)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((docSnap) => this.mapRecord(docSnap.id, docSnap.data()))
          .sort((a, b) => (b.timeRecorded || '').localeCompare(a.timeRecorded || '')),
      ),
    );
  }

  getRecordsByStudent(studentId: string): Observable<AttendanceRecord[]> {
    const q = query(this.recordsCollection, where('studentId', '==', studentId));

    return from(getDocs(q)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((docSnap) => this.mapRecord(docSnap.id, docSnap.data()))
          .sort((a, b) => (b.timeRecorded || '').localeCompare(a.timeRecorded || '')),
      ),
    );
  }

  updateRecord(id: string, record: Partial<AttendanceRecord>): Observable<AttendanceRecord> {
    const recordRef = doc(db, 'attendance', id);

    return from(updateDoc(recordRef, record as Record<string, unknown>)).pipe(
      switchMap(() => from(getDoc(recordRef))),
      switchMap((docSnap) => {
        if (!docSnap.exists()) {
          return throwError(() => new Error('Attendance record not found after update.'));
        }

        return from([this.mapRecord(docSnap.id, docSnap.data())]);
      }),
    );
  }

  deleteRecord(id: string): Observable<void> {
    return from(deleteDoc(doc(db, 'attendance', id))).pipe(map(() => void 0));
  }

  importAttendanceRecords(records: AttendanceRecord[]): Observable<AttendanceRecord[]> {
    return from(this.importAttendanceRecordsSafely(records));
  }

  submitViaQR(qrToken: string, studentId: string): Observable<AttendanceRecord> {
    return from(this.submitAttendanceBySessionLookup('qrToken', qrToken.trim(), studentId, 'qr'));
  }

  submitViaCode(sessionCode: string, studentId: string): Observable<AttendanceRecord> {
    return from(
      this.submitAttendanceBySessionLookup(
        'sessionCode',
        sessionCode.trim().toUpperCase(),
        studentId,
        'code',
      ),
    );
  }

  manualMark(
    sessionId: string,
    studentId: string,
    status: AttendanceStatus,
    instructorId: string,
    lateTime?: string,
    remarks?: string,
  ): Observable<AttendanceRecord> {
    return from(
      this.createManualAttendanceRecord(
        sessionId,
        studentId,
        status,
        instructorId,
        lateTime,
        remarks,
      ),
    );
  }

  getAttendanceRequests(): Observable<AttendanceRequest[]> {
    return from(getDocs(this.requestsCollection)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((docSnap) => this.mapRequest(docSnap.id, docSnap.data()))
          .sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || '')),
      ),
    );
  }

  getPendingRequestsBySession(sessionId: string): Observable<AttendanceRequest[]> {
    const q = query(
      this.requestsCollection,
      where('sessionId', '==', sessionId),
      where('status', '==', 'pending'),
    );

    return from(getDocs(q)).pipe(
      map((snapshot) =>
        snapshot.docs
          .map((docSnap) => this.mapRequest(docSnap.id, docSnap.data()))
          .sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || '')),
      ),
    );
  }

  approveAttendanceRequest(requestId: string, instructorId: string): Observable<AttendanceRecord> {
    return from(this.approveRequestSafely(requestId, instructorId));
  }

  rejectAttendanceRequest(requestId: string, instructorId: string): Observable<AttendanceRequest> {
    return from(this.rejectRequestSafely(requestId, instructorId));
  }

  private async importAttendanceRecordsSafely(
    records: AttendanceRecord[],
  ): Promise<AttendanceRecord[]> {
    const imported: AttendanceRecord[] = [];
    const seen = new Set<string>();

    for (const record of records) {
      const sessionId = String(record.sessionId || '').trim();
      const studentId = String(record.studentId || '').trim();

      if (!sessionId || !studentId) {
        throw new Error('Imported record has missing session ID or student ID.');
      }

      const key = `${sessionId}-${studentId}`;

      if (seen.has(key)) {
        throw new Error(`Duplicate row found in import file for student ${studentId}.`);
      }

      seen.add(key);

      const sessionSnap = await getDoc(doc(this.sessionsCollection, sessionId));

      if (!sessionSnap.exists()) {
        throw new Error(`Session ID ${sessionId} was not found.`);
      }

      const session = this.mapSession(sessionSnap.id, sessionSnap.data());

      if (session.status !== 'active' && session.status !== 'closed') {
        throw new Error(`Session ID ${sessionId} has an invalid status.`);
      }

      const payload: AttendanceRecord = {
        sessionId,
        studentId,
        status: record.status,
        method: 'imported_excel',
        timeRecorded: record.timeRecorded || new Date().toISOString(),
        recordedBy: record.recordedBy || 'admin_import',
        isValid: true,
      };

      if (record.status === 'late' && record.lateTime) {
        payload.lateTime = record.lateTime;
      }

      if (record.remarks?.trim()) {
        payload.remarks = record.remarks.trim();
      }

      const saved = await this.createRecordTransactionally(payload);
      imported.push(saved);
    }

    return imported;
  }

  private async closeSessionAndMarkAbsentees(sessionId: string): Promise<AttendanceSession> {
    const sessionRef = doc(this.sessionsCollection, sessionId);
    const sessionSnap = await getDoc(sessionRef);

    if (!sessionSnap.exists()) {
      throw new Error('Attendance session not found.');
    }

    const session = this.mapSession(sessionSnap.id, sessionSnap.data());

    if (session.status === 'closed') {
      return session;
    }

    if (!session.classOfferingId) {
      throw new Error('This attendance session has no linked class offering.');
    }

    const offeringSnap = await getDoc(doc(this.classOfferingsCollection, session.classOfferingId));

    if (!offeringSnap.exists()) {
      throw new Error('Class offering for this session was not found.');
    }

    const offering = {
      id: offeringSnap.id,
      ...offeringSnap.data(),
    } as ClassOffering;

    if (!offering.sectionId && !(offering as any).sectionName) {
      throw new Error('Class offering has no linked section.');
    }

    const studentsSnapshot = await getDocs(this.studentsCollection);

    const sectionStudents = studentsSnapshot.docs
      .map(
        (docSnap) =>
          ({
            id: docSnap.id,
            ...docSnap.data(),
          }) as Student,
      )
      .filter(
        (student) =>
          student.status !== 'inactive' &&
          student.status !== 'archived' &&
          this.studentMatchesOfferingSection(student, offering),
      );

    const recordsSnapshot = await getDocs(
      query(this.recordsCollection, where('sessionId', '==', sessionId)),
    );

    const recordedStudentIds = new Set(
      recordsSnapshot.docs.map((docSnap) => {
        const record = docSnap.data() as AttendanceRecord;
        return String(record.studentId);
      }),
    );

    const now = new Date().toISOString();
    const endTime = new Date().toISOString();

    const absentRecords: AttendanceRecord[] = [];

    for (const student of sectionStudents) {
      if (!student.id) continue;

      const studentId = String(student.id);

      if (recordedStudentIds.has(studentId)) {
        continue;
      }

      absentRecords.push({
        sessionId,
        studentId,
        status: 'absent',
        method: 'manual',
        timeRecorded: now,
        recordedBy: session.instructorId,
        isValid: true,
        remarks: 'Auto-marked absent when the attendance session was closed.',
      });

      recordedStudentIds.add(studentId);
    }

    const batches: ReturnType<typeof writeBatch>[] = [];
    let currentBatch = writeBatch(db);
    let operationCount = 0;

    for (const record of absentRecords) {
      const recordId = this.buildAttendanceRecordId(record.sessionId, record.studentId);
      const recordRef = doc(this.recordsCollection, recordId);
      const payload = this.stripEmptyFields(this.stripId(record));

      currentBatch.set(recordRef, payload);
      operationCount++;

      if (operationCount >= 450) {
        batches.push(currentBatch);
        currentBatch = writeBatch(db);
        operationCount = 0;
      }
    }

    currentBatch.update(sessionRef, {
      status: 'closed',
      endTime,
    });
    batches.push(currentBatch);

    for (const batch of batches) {
      await batch.commit();
    }

    return {
      ...session,
      status: 'closed',
      endTime,
    };
  }

  private async submitAttendanceBySessionLookup(
    lookupField: 'qrToken' | 'sessionCode',
    lookupValue: string,
    studentId: string,
    method: 'qr' | 'code',
  ): Promise<AttendanceRecord> {
    const q = query(this.sessionsCollection, where(lookupField, '==', lookupValue));
    const snapshot = await getDocs(q);

    const sessionDoc = snapshot.docs[0];

    if (!sessionDoc) {
      throw new Error(method === 'qr' ? 'Invalid QR code.' : 'Invalid session code.');
    }

    const session = this.mapSession(sessionDoc.id, sessionDoc.data());

    if (session.status !== 'active') {
      throw new Error('This attendance session is already closed.');
    }

    const validation = await this.checkStudentBelongsToSession(session, studentId);

    if (!validation.belongs) {
      await this.createPendingRequestOnce(session, studentId);
      throw new Error(
        'You are not officially enrolled in this class section. Your attendance request has been sent to the teacher for approval.',
      );
    }

    const status = this.computeAttendanceStatus(session);

    return this.createRecordTransactionally({
      sessionId: session.id!,
      studentId,
      status,
      method,
      timeRecorded: new Date().toISOString(),
      isValid: true,
    });
  }

  private async createManualAttendanceRecord(
    sessionId: string,
    studentId: string,
    status: AttendanceStatus,
    instructorId: string,
    lateTime?: string,
    remarks?: string,
  ): Promise<AttendanceRecord> {
    const sessionSnap = await getDoc(doc(this.sessionsCollection, sessionId));

    if (!sessionSnap.exists()) {
      throw new Error('Attendance session not found.');
    }

    const session = this.mapSession(sessionSnap.id, sessionSnap.data());

    if (session.status !== 'active' && session.status !== 'closed') {
      throw new Error('This attendance session cannot accept manual attendance.');
    }

    const payload: AttendanceRecord = {
      sessionId,
      studentId,
      status,
      method: 'manual',
      timeRecorded: new Date().toISOString(),
      recordedBy: instructorId,
      isValid: true,
    };

    if (status === 'late' && lateTime) {
      payload.lateTime = lateTime;
    }

    if (remarks?.trim()) {
      payload.remarks = remarks.trim();
    }

    return this.createRecordTransactionally(payload);
  }

  private async approveRequestSafely(
    requestId: string,
    instructorId: string,
  ): Promise<AttendanceRecord> {
    const requestRef = doc(this.requestsCollection, requestId);
    const requestSnapForLookup = await getDoc(requestRef);

    if (!requestSnapForLookup.exists()) {
      throw new Error('Attendance request not found.');
    }

    const requestForLookup = this.mapRequest(requestSnapForLookup.id, requestSnapForLookup.data());

    const legacyRecord = await this.findExistingAttendanceRecord(
      requestForLookup.sessionId,
      requestForLookup.studentId,
    );

    return runTransaction(db, async (transaction) => {
      const requestSnap = await transaction.get(requestRef);

      if (!requestSnap.exists()) {
        throw new Error('Attendance request not found.');
      }

      const request = this.mapRequest(requestSnap.id, requestSnap.data());

      if (request.status !== 'pending') {
        throw new Error('This attendance request has already been reviewed.');
      }

      const sessionRef = doc(this.sessionsCollection, request.sessionId);
      const sessionSnap = await transaction.get(sessionRef);

      if (!sessionSnap.exists()) {
        throw new Error('Attendance session not found.');
      }

      const session = this.mapSession(sessionSnap.id, sessionSnap.data());

      if (session.instructorId !== instructorId) {
        throw new Error('You are not allowed to review this attendance request.');
      }

      const reviewedAt = new Date().toISOString();

      if (legacyRecord) {
        transaction.update(requestRef, {
          status: 'approved',
          reviewedAt,
          reviewedBy: instructorId,
        });

        return legacyRecord;
      }

      const recordId = this.buildAttendanceRecordId(request.sessionId, request.studentId);
      const recordRef = doc(this.recordsCollection, recordId);
      const existingRecordSnap = await transaction.get(recordRef);

      if (existingRecordSnap.exists()) {
        transaction.update(requestRef, {
          status: 'approved',
          reviewedAt,
          reviewedBy: instructorId,
        });

        return this.mapRecord(existingRecordSnap.id, existingRecordSnap.data());
      }

      const status = this.computeAttendanceStatus(session);

      const payload: AttendanceRecord = {
        sessionId: request.sessionId,
        studentId: request.studentId,
        status,
        method: 'teacher_assisted',
        timeRecorded: reviewedAt,
        recordedBy: instructorId,
        isValid: true,
      };

      const cleanedPayload = this.stripEmptyFields(this.stripId(payload));

      transaction.set(recordRef, cleanedPayload);

      transaction.update(requestRef, {
        status: 'approved',
        reviewedAt,
        reviewedBy: instructorId,
      });

      return {
        id: recordId,
        ...(cleanedPayload as Omit<AttendanceRecord, 'id'>),
      };
    });
  }

  private async rejectRequestSafely(
    requestId: string,
    instructorId: string,
  ): Promise<AttendanceRequest> {
    const requestRef = doc(this.requestsCollection, requestId);

    return runTransaction(db, async (transaction) => {
      const requestSnap = await transaction.get(requestRef);

      if (!requestSnap.exists()) {
        throw new Error('Attendance request not found.');
      }

      const request = this.mapRequest(requestSnap.id, requestSnap.data());

      if (request.status !== 'pending') {
        throw new Error('This attendance request has already been reviewed.');
      }

      const sessionRef = doc(this.sessionsCollection, request.sessionId);
      const sessionSnap = await transaction.get(sessionRef);

      if (!sessionSnap.exists()) {
        throw new Error('Attendance session not found.');
      }

      const session = this.mapSession(sessionSnap.id, sessionSnap.data());

      if (session.instructorId !== instructorId) {
        throw new Error('You are not allowed to review this attendance request.');
      }

      const reviewedAt = new Date().toISOString();

      transaction.update(requestRef, {
        status: 'rejected',
        reviewedAt,
        reviewedBy: instructorId,
      });

      return {
        ...request,
        status: 'rejected',
        reviewedAt,
        reviewedBy: instructorId,
      };
    });
  }

  private async checkStudentBelongsToSession(
    session: AttendanceSession,
    studentId: string,
  ): Promise<{ belongs: boolean; student: Student; offering: ClassOffering }> {
    if (!session.classOfferingId) {
      throw new Error('This attendance session has no linked class offering.');
    }

    const studentSnap = await getDoc(doc(this.studentsCollection, studentId));

    if (!studentSnap.exists()) {
      throw new Error('Student record was not found.');
    }

    const student = {
      id: studentSnap.id,
      ...studentSnap.data(),
    } as Student;

    if (student.status === 'inactive' || student.status === 'archived') {
      throw new Error('Your student account is not active for attendance.');
    }

    const offeringSnap = await getDoc(doc(this.classOfferingsCollection, session.classOfferingId));

    if (!offeringSnap.exists()) {
      throw new Error('Class offering for this session was not found.');
    }

    const offering = {
      id: offeringSnap.id,
      ...offeringSnap.data(),
    } as ClassOffering;

    if (offering.status === 'inactive' || offering.status === 'archived') {
      throw new Error('This class offering is not active.');
    }

    return {
      belongs: this.studentMatchesOfferingSection(student, offering),
      student,
      offering,
    };
  }

  private studentMatchesOfferingSection(student: Student, offering: ClassOffering): boolean {
    const studentSectionId = this.normalizeText((student as any).sectionId);
    const studentSectionName = this.normalizeText((student as any).sectionName);
    const studentSection = this.normalizeText((student as any).section);

    const offeringSectionId = this.normalizeText((offering as any).sectionId);
    const offeringSectionName = this.normalizeText((offering as any).sectionName);
    const offeringSection = this.normalizeText((offering as any).section);

    const studentValues = [studentSectionId, studentSectionName, studentSection].filter(Boolean);
    const offeringValues = [offeringSectionId, offeringSectionName, offeringSection].filter(
      Boolean,
    );

    for (const studentValue of studentValues) {
      for (const offeringValue of offeringValues) {
        if (studentValue === offeringValue) {
          return true;
        }

        if (offeringValue.endsWith(studentValue)) {
          return true;
        }

        if (studentValue.endsWith(offeringValue)) {
          return true;
        }
      }
    }

    return false;
  }

  private async createPendingRequestOnce(
    session: AttendanceSession,
    studentId: string,
  ): Promise<AttendanceRequest> {
    const requestId = this.buildAttendanceRequestId(session.id!, studentId);
    const requestRef = doc(this.requestsCollection, requestId);

    return runTransaction(db, async (transaction) => {
      const requestSnap = await transaction.get(requestRef);

      if (requestSnap.exists()) {
        const existingRequest = this.mapRequest(requestSnap.id, requestSnap.data());

        if (existingRequest.status === 'pending') {
          return existingRequest;
        }

        if (existingRequest.status === 'approved') {
          throw new Error('Attendance request has already been approved.');
        }

        if (existingRequest.status === 'rejected') {
          throw new Error('Attendance request has already been rejected.');
        }
      }

      const payload: Omit<AttendanceRequest, 'id'> = {
        sessionId: session.id!,
        studentId,
        classOfferingId: session.classOfferingId,
        reason: 'section_mismatch',
        status: 'pending',
        requestedAt: new Date().toISOString(),
      };

      transaction.set(requestRef, this.stripEmptyFields(payload));

      return {
        id: requestId,
        ...payload,
      };
    });
  }

  private async createRecordTransactionally(record: AttendanceRecord): Promise<AttendanceRecord> {
    const sessionId = String(record.sessionId || '').trim();
    const studentId = String(record.studentId || '').trim();

    if (!sessionId || !studentId) {
      throw new Error('Attendance record has missing session ID or student ID.');
    }

    const legacyRecord = await this.findExistingAttendanceRecord(sessionId, studentId);

    if (legacyRecord) {
      throw new Error('Attendance already recorded for this session.');
    }

    const recordId = this.buildAttendanceRecordId(sessionId, studentId);
    const recordRef = doc(this.recordsCollection, recordId);
    const sessionRef = doc(this.sessionsCollection, sessionId);
    const cleanedPayload = this.stripEmptyFields(this.stripId(record));

    return runTransaction(db, async (transaction) => {
      const sessionSnap = await transaction.get(sessionRef);

      if (!sessionSnap.exists()) {
        throw new Error('Attendance session not found.');
      }

      const session = this.mapSession(sessionSnap.id, sessionSnap.data());

      if (session.status !== 'active' && record.status !== 'absent') {
        throw new Error('This attendance session is already closed.');
      }

      const existingRecordSnap = await transaction.get(recordRef);

      if (existingRecordSnap.exists()) {
        throw new Error('Attendance already recorded for this session.');
      }

      transaction.set(recordRef, cleanedPayload);

      return {
        id: recordId,
        ...(cleanedPayload as Omit<AttendanceRecord, 'id'>),
      };
    });
  }

  private async findExistingAttendanceRecord(
    sessionId: string,
    studentId: string,
  ): Promise<AttendanceRecord | null> {
    const q = query(
      this.recordsCollection,
      where('sessionId', '==', sessionId),
      where('studentId', '==', studentId),
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const firstDoc = snapshot.docs[0];
    return this.mapRecord(firstDoc.id, firstDoc.data());
  }

  private buildAttendanceRecordId(sessionId: string, studentId: string): string {
    return `${this.safeDocId(sessionId)}_${this.safeDocId(studentId)}`;
  }

  private buildAttendanceRequestId(sessionId: string, studentId: string): string {
    return `${this.safeDocId(sessionId)}_${this.safeDocId(studentId)}_request`;
  }

  private safeDocId(value: string): string {
    return String(value || '')
      .trim()
      .replace(/\//g, '_')
      .replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private normalizeText(value: unknown): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private computeAttendanceStatus(session: AttendanceSession): 'present' | 'late' {
    const now = new Date();
    const start = new Date(session.startTime);
    const lateThresholdMinutes = session.lateThresholdMinutes ?? 10;
    const lateLimit = new Date(start.getTime() + lateThresholdMinutes * 60000);

    return now > lateLimit ? 'late' : 'present';
  }

  private generateSessionCode(): string {
    const random = Math.floor(1000 + Math.random() * 9000);
    return `ATTD-${random}`;
  }

  private generateQrToken(): string {
    const randomPart = Math.random().toString(36).slice(2, 10);
    const timePart = Date.now().toString(36);
    return `qr-${timePart}-${randomPart}`;
  }

  private mapSession(id: string, data: Record<string, unknown>): AttendanceSession {
    return {
      id,
      ...(data as Omit<AttendanceSession, 'id'>),
    };
  }

  private mapRecord(id: string, data: Record<string, unknown>): AttendanceRecord {
    return {
      id,
      ...(data as Omit<AttendanceRecord, 'id'>),
    };
  }

  private mapRequest(id: string, data: Record<string, unknown>): AttendanceRequest {
    return {
      id,
      ...(data as Omit<AttendanceRequest, 'id'>),
    };
  }

  private stripId<T extends { id?: string }>(value: T): Omit<T, 'id'> {
    const clone = { ...value };
    delete clone.id;
    return clone;
  }

  private stripEmptyFields<T extends Record<string, unknown>>(value: T): T {
    const clone = { ...value };

    Object.keys(clone).forEach((key) => {
      if (clone[key] === undefined || clone[key] === null || clone[key] === '') {
        delete clone[key];
      }
    });

    return clone;
  }
}
