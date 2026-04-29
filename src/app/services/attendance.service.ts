import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
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

    return from(addDoc(this.sessionsCollection, payload)).pipe(
      map((ref) => ({
        id: ref.id,
        ...payload,
      })),
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

      const alreadyExists = await this.checkDuplicateOnce(sessionId, studentId);

      if (alreadyExists) {
        throw new Error(
          `Attendance already exists for student ${studentId} in session ${sessionId}.`,
        );
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

      const saved = await this.createRecordOnce(payload);
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

    if (!offering.sectionId) {
      throw new Error('Class offering has no linked section.');
    }

    const studentsSnapshot = await getDocs(
      query(this.studentsCollection, where('sectionId', '==', offering.sectionId)),
    );

    const sectionStudents = studentsSnapshot.docs
      .map(
        (docSnap) =>
          ({
            id: docSnap.id,
            ...docSnap.data(),
          }) as Student,
      )
      .filter((student) => student.status !== 'inactive' && student.status !== 'archived');

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

    for (const student of sectionStudents) {
      if (!student.id) continue;

      const studentId = String(student.id);

      if (recordedStudentIds.has(studentId)) {
        continue;
      }

      const absentRecord: AttendanceRecord = {
        sessionId,
        studentId,
        status: 'absent',
        method: 'manual',
        timeRecorded: now,
        recordedBy: session.instructorId,
        isValid: true,
        remarks: 'Auto-marked absent when the attendance session was closed.',
      };

      await this.createRecordOnce(absentRecord);
      recordedStudentIds.add(studentId);
    }

    const endTime = new Date().toISOString();

    await updateDoc(sessionRef, {
      status: 'closed',
      endTime,
    });

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

    const alreadyExists = await this.checkDuplicateOnce(session.id!, studentId);

    if (alreadyExists) {
      throw new Error('Attendance already recorded for this session.');
    }

    const validation = await this.checkStudentBelongsToSession(session, studentId);

    if (!validation.belongs) {
      await this.createPendingRequestOnce(session, studentId);
      throw new Error(
        'You are not officially enrolled in this class section. Your attendance request has been sent to the teacher for approval.',
      );
    }

    const status = this.computeAttendanceStatus(session);

    return this.createRecordOnce({
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

    const alreadyExists = await this.checkDuplicateOnce(sessionId, studentId);

    if (alreadyExists) {
      throw new Error('Attendance already recorded for this student.');
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

    return this.createRecordOnce(payload);
  }

  private async approveRequestSafely(
    requestId: string,
    instructorId: string,
  ): Promise<AttendanceRecord> {
    const requestRef = doc(this.requestsCollection, requestId);
    const requestSnap = await getDoc(requestRef);

    if (!requestSnap.exists()) {
      throw new Error('Attendance request not found.');
    }

    const request = this.mapRequest(requestSnap.id, requestSnap.data());

    if (request.status !== 'pending') {
      throw new Error('This attendance request has already been reviewed.');
    }

    const sessionSnap = await getDoc(doc(this.sessionsCollection, request.sessionId));

    if (!sessionSnap.exists()) {
      throw new Error('Attendance session not found.');
    }

    const session = this.mapSession(sessionSnap.id, sessionSnap.data());

    if (session.instructorId !== instructorId) {
      throw new Error('You are not allowed to review this attendance request.');
    }

    const alreadyExists = await this.checkDuplicateOnce(request.sessionId, request.studentId);

    if (alreadyExists) {
      await updateDoc(requestRef, {
        status: 'approved',
        reviewedAt: new Date().toISOString(),
        reviewedBy: instructorId,
      });

      throw new Error('Attendance is already recorded for this student.');
    }

    const status = this.computeAttendanceStatus(session);

    const record = await this.createRecordOnce({
      sessionId: request.sessionId,
      studentId: request.studentId,
      status,
      method: 'teacher_assisted',
      timeRecorded: new Date().toISOString(),
      recordedBy: instructorId,
      isValid: true,
    });

    await updateDoc(requestRef, {
      status: 'approved',
      reviewedAt: new Date().toISOString(),
      reviewedBy: instructorId,
    });

    return record;
  }

  private async rejectRequestSafely(
    requestId: string,
    instructorId: string,
  ): Promise<AttendanceRequest> {
    const requestRef = doc(this.requestsCollection, requestId);
    const requestSnap = await getDoc(requestRef);

    if (!requestSnap.exists()) {
      throw new Error('Attendance request not found.');
    }

    const request = this.mapRequest(requestSnap.id, requestSnap.data());

    if (request.status !== 'pending') {
      throw new Error('This attendance request has already been reviewed.');
    }

    const sessionSnap = await getDoc(doc(this.sessionsCollection, request.sessionId));

    if (!sessionSnap.exists()) {
      throw new Error('Attendance session not found.');
    }

    const session = this.mapSession(sessionSnap.id, sessionSnap.data());

    if (session.instructorId !== instructorId) {
      throw new Error('You are not allowed to review this attendance request.');
    }

    const reviewedAt = new Date().toISOString();

    await updateDoc(requestRef, {
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
      belongs:
        !!student.sectionId && !!offering.sectionId && student.sectionId === offering.sectionId,
      student,
      offering,
    };
  }

  private async createPendingRequestOnce(
    session: AttendanceSession,
    studentId: string,
  ): Promise<AttendanceRequest> {
    const existingQuery = query(
      this.requestsCollection,
      where('sessionId', '==', session.id!),
      where('studentId', '==', studentId),
      where('status', '==', 'pending'),
    );

    const existingSnapshot = await getDocs(existingQuery);

    if (!existingSnapshot.empty) {
      return this.mapRequest(existingSnapshot.docs[0].id, existingSnapshot.docs[0].data());
    }

    const payload: Omit<AttendanceRequest, 'id'> = {
      sessionId: session.id!,
      studentId,
      classOfferingId: session.classOfferingId,
      reason: 'section_mismatch',
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };

    const requestRef = await addDoc(this.requestsCollection, payload);

    return {
      id: requestRef.id,
      ...payload,
    };
  }

  private async createRecordOnce(record: AttendanceRecord): Promise<AttendanceRecord> {
    const payload = this.stripEmptyFields(this.stripId(record));
    const ref = await addDoc(this.recordsCollection, payload);

    return {
      id: ref.id,
      ...(payload as Omit<AttendanceRecord, 'id'>),
    };
  }

  private async checkDuplicateOnce(sessionId: string, studentId: string): Promise<boolean> {
    const q = query(this.recordsCollection, where('sessionId', '==', sessionId));
    const snapshot = await getDocs(q);

    return snapshot.docs.some((docSnap) => {
      const data = docSnap.data() as AttendanceRecord;
      return data.studentId === studentId;
    });
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
