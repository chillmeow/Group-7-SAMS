import { Injectable, inject } from '@angular/core';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Observable, from, map, switchMap, throwError } from 'rxjs';

import { db } from '../firebase.config';
import { AttendanceCloseReason, AttendanceSession } from '../models/attendance-session.model';
import { AttendanceRecord, AttendanceStatus } from '../models/attendance-record.model';
import { AttendanceRequest } from '../models/attendance-request.model';
import { Student } from '../models/student.model';
import { Teacher } from '../models/teacher.model';
import { ClassOffering } from '../models/class-offering.model';
import { Parent } from '../models/parent.model';
import { FirestoreNotificationPayload, NotificationService } from './notification.service';

export interface CreateAttendanceSessionOptions {
  durationMinutes?: number;
  lateThresholdMinutes?: number;
  qrRotationSeconds?: number;
}

export interface HistoricalAttendanceImportPayload {
  classOfferingId: string;
  instructorId: string;
  attendanceDate: string;
  records: Array<Partial<AttendanceRecord> & { studentId: string; status: AttendanceStatus }>;
  startTime?: string;
  endTime?: string;
  lateThresholdMinutes?: number;
  remarks?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AttendanceService {
  private readonly notificationService = inject(NotificationService);

  private readonly sessionsCollection = collection(db, 'sessions');
  private readonly recordsCollection = collection(db, 'attendance');
  private readonly requestsCollection = collection(db, 'attendanceRequests');
  private readonly studentsCollection = collection(db, 'students');
  private readonly teachersCollection = collection(db, 'teachers');
  private readonly parentsCollection = collection(db, 'parents');
  private readonly usersCollection = collection(db, 'users');
  private readonly classOfferingsCollection = collection(db, 'classOfferings');

  private readonly defaultQrRotationSeconds = 30;
  private readonly minQrRotationSeconds = 15;
  private readonly maxQrRotationSeconds = 120;

  private readonly defaultDurationMinutes = 30;
  private readonly defaultLateThresholdMinutes = 10;

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

  createSession(
    classOfferingId: string,
    instructorId: string,
    options: CreateAttendanceSessionOptions | number = {},
  ): Observable<AttendanceSession> {
    const cleanClassOfferingId = String(classOfferingId || '').trim();
    const cleanInstructorId = String(instructorId || '').trim();

    if (!cleanClassOfferingId) {
      return throwError(
        () => new Error('Please select a class before starting an attendance session.'),
      );
    }

    if (!cleanInstructorId) {
      return throwError(() => new Error('Unable to identify the teacher starting this session.'));
    }

    const normalizedOptions = this.normalizeCreateSessionOptions(options);
    const now = new Date();
    const nowIso = now.toISOString();

    const durationMinutes = this.normalizePositiveNumber(
      normalizedOptions.durationMinutes,
      this.defaultDurationMinutes,
    );

    const lateThresholdMinutes = this.normalizePositiveNumber(
      normalizedOptions.lateThresholdMinutes,
      this.defaultLateThresholdMinutes,
    );

    const qrRotationSeconds = this.normalizeQrRotationSeconds(normalizedOptions.qrRotationSeconds);

    const sessionRef = doc(this.sessionsCollection);

    const payload: Omit<AttendanceSession, 'id'> = {
      classOfferingId: cleanClassOfferingId,
      instructorId: cleanInstructorId,
      date: nowIso.split('T')[0],
      startTime: nowIso,
      sessionCode: this.generateSessionCode(),
      qrToken: this.generateQrToken(),
      qrTokenUpdatedAt: nowIso,
      qrRotationSeconds,
      durationMinutes,
      autoCloseAt: new Date(now.getTime() + durationMinutes * 60_000).toISOString(),
      mode: 'live',
      status: 'active',
      createdAt: nowIso,
      lateThresholdMinutes,
    };

    const session: AttendanceSession = {
      id: sessionRef.id,
      ...payload,
    };

    return from(setDoc(sessionRef, this.stripEmptyFields(payload))).pipe(
      switchMap(() => from(this.notifySessionStartedSafely(session))),
      map(() => session),
    );
  }

  rotateSessionQrToken(sessionId: string): Observable<AttendanceSession> {
    return from(this.refreshSessionQrTokenSafely(sessionId));
  }

  closeSession(
    sessionId: string,
    closeReason: AttendanceCloseReason = 'manual_close',
  ): Observable<AttendanceSession> {
    return from(this.closeSessionAndMarkAbsentees(sessionId, closeReason));
  }

  closeExpiredSession(sessionId: string): Observable<AttendanceSession> {
    return from(this.closeExpiredSessionIfNeeded(sessionId));
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

    return from(updateDoc(recordRef, record as any)).pipe(
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

  importHistoricalAttendanceRecords(
    payload: HistoricalAttendanceImportPayload,
  ): Observable<{ session: AttendanceSession; records: AttendanceRecord[] }> {
    return from(this.importHistoricalAttendanceRecordsSafely(payload));
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

  private async importHistoricalAttendanceRecordsSafely(
    payload: HistoricalAttendanceImportPayload,
  ): Promise<{ session: AttendanceSession; records: AttendanceRecord[] }> {
    const classOfferingId = String(payload.classOfferingId || '').trim();
    const instructorId = String(payload.instructorId || '').trim();
    const attendanceDate = String(payload.attendanceDate || '').trim();

    if (!classOfferingId) {
      throw new Error('Please select a class before importing historical attendance.');
    }

    if (!instructorId) {
      throw new Error('Unable to identify the teacher importing this attendance file.');
    }

    if (!attendanceDate) {
      throw new Error('Please select the attendance date for the imported file.');
    }

    if (!payload.records.length) {
      throw new Error('The uploaded attendance file has no valid records to import.');
    }

    const offeringSnap = await getDoc(doc(this.classOfferingsCollection, classOfferingId));

    if (!offeringSnap.exists()) {
      throw new Error('Selected class offering was not found.');
    }

    const nowIso = new Date().toISOString();
    const startTime = this.buildDateTimeIso(attendanceDate, payload.startTime || '08:00');
    const endTime = payload.endTime
      ? this.buildDateTimeIso(attendanceDate, payload.endTime)
      : this.buildDateTimeIso(attendanceDate, '23:59');

    const sessionPayload: Omit<AttendanceSession, 'id'> = {
      classOfferingId,
      instructorId,
      date: attendanceDate,
      startTime,
      endTime,
      sessionCode: this.generateSessionCode(),
      qrToken: this.generateQrToken(),
      qrTokenUpdatedAt: nowIso,
      qrRotationSeconds: this.defaultQrRotationSeconds,
      durationMinutes: 0,
      autoCloseAt: endTime,
      mode: 'imported_excel',
      status: 'closed',
      closeReason: 'historical_import',
      createdAt: nowIso,
      lateThresholdMinutes: this.normalizePositiveNumber(
        payload.lateThresholdMinutes,
        this.defaultLateThresholdMinutes,
      ),
    };

    const sessionRef = await addDoc(this.sessionsCollection, this.stripEmptyFields(sessionPayload));

    const session: AttendanceSession = {
      id: sessionRef.id,
      ...sessionPayload,
    };

    const recordsToImport: AttendanceRecord[] = payload.records.map((record) => ({
      sessionId: session.id!,
      studentId: String(record.studentId || '').trim(),
      status: record.status,
      method: 'imported_excel',
      timeRecorded:
        record.timeRecorded ||
        this.buildDateTimeIso(attendanceDate, this.extractTimeOnly(record.lateTime) || '08:00'),
      lateTime: record.status === 'late' ? record.lateTime : undefined,
      recordedBy: instructorId,
      isValid: true,
      remarks: record.remarks || payload.remarks || 'Historical attendance import.',
    }));

    try {
      const records = await this.importAttendanceRecordsSafely(recordsToImport);
      return { session, records };
    } catch (error) {
      await deleteDoc(doc(this.sessionsCollection, session.id!));
      throw error;
    }
  }

  private async importAttendanceRecordsSafely(
    records: AttendanceRecord[],
  ): Promise<AttendanceRecord[]> {
    const preparedRecords: Array<{
      id: string;
      ref: ReturnType<typeof doc>;
      payload: Omit<AttendanceRecord, 'id'>;
    }> = [];

    const seen = new Set<string>();
    const sessionCache = new Map<string, AttendanceSession>();

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

      let session = sessionCache.get(sessionId);

      if (!session) {
        const sessionSnap = await getDoc(doc(this.sessionsCollection, sessionId));

        if (!sessionSnap.exists()) {
          throw new Error(`Session ID ${sessionId} was not found.`);
        }

        session = this.mapSession(sessionSnap.id, sessionSnap.data());
        sessionCache.set(sessionId, session);
      }

      if (session.status !== 'active' && session.status !== 'closed') {
        throw new Error(`Session ID ${sessionId} has an invalid status.`);
      }

      if (record.method !== 'imported_excel') {
        throw new Error('Imported attendance records must use imported_excel as method.');
      }

      const recordId = this.buildAttendanceRecordId(sessionId, studentId);
      const recordRef = doc(this.recordsCollection, recordId);
      const existingRecordSnap = await getDoc(recordRef);

      if (existingRecordSnap.exists()) {
        throw new Error(`Attendance already exists for student ${studentId} in this session.`);
      }

      const legacyRecord = await this.findExistingAttendanceRecord(sessionId, studentId);

      if (legacyRecord) {
        throw new Error(`Attendance already exists for student ${studentId} in this session.`);
      }

      const payload: AttendanceRecord = {
        sessionId,
        studentId,
        status: record.status,
        method: 'imported_excel',
        timeRecorded: record.timeRecorded || new Date().toISOString(),
        recordedBy: record.recordedBy || session.instructorId || 'teacher_import',
        isValid: true,
      };

      if (record.status === 'late' && record.lateTime) {
        payload.lateTime = record.lateTime;
      }

      if (record.remarks?.trim()) {
        payload.remarks = record.remarks.trim();
      }

      preparedRecords.push({
        id: recordId,
        ref: recordRef,
        payload: this.stripEmptyFields(this.stripId(payload)),
      });
    }

    const batches: ReturnType<typeof writeBatch>[] = [];
    let currentBatch = writeBatch(db);
    let operationCount = 0;

    for (const item of preparedRecords) {
      currentBatch.set(item.ref, item.payload);
      operationCount++;

      if (operationCount >= 450) {
        batches.push(currentBatch);
        currentBatch = writeBatch(db);
        operationCount = 0;
      }
    }

    if (operationCount > 0) {
      batches.push(currentBatch);
    }

    for (const batch of batches) {
      await batch.commit();
    }

    return preparedRecords.map((item) => ({
      id: item.id,
      ...item.payload,
    }));
  }

  private async refreshSessionQrTokenSafely(sessionId: string): Promise<AttendanceSession> {
    const cleanSessionId = String(sessionId || '').trim();

    if (!cleanSessionId) {
      throw new Error('Missing attendance session ID.');
    }

    const sessionRef = doc(this.sessionsCollection, cleanSessionId);
    const sessionSnapBeforeRotation = await getDoc(sessionRef);

    if (!sessionSnapBeforeRotation.exists()) {
      throw new Error('Attendance session not found.');
    }

    const sessionBeforeRotation = this.mapSession(
      sessionSnapBeforeRotation.id,
      sessionSnapBeforeRotation.data(),
    );

    if (this.isSessionExpired(sessionBeforeRotation)) {
      return this.closeSessionAndMarkAbsentees(cleanSessionId, 'auto_duration_expired');
    }

    return runTransaction(db, async (transaction) => {
      const sessionSnap = await transaction.get(sessionRef);

      if (!sessionSnap.exists()) {
        throw new Error('Attendance session not found.');
      }

      const session = this.mapSession(sessionSnap.id, sessionSnap.data());

      if (session.status !== 'active') {
        throw new Error(
          'QR and session code rotation is only available for active attendance sessions.',
        );
      }

      if (session.mode === 'imported_excel') {
        throw new Error('Historical imported sessions do not use QR or session code rotation.');
      }

      const nowIso = new Date().toISOString();
      const nextQrToken = this.generateQrToken();
      const nextSessionCode = this.generateSessionCode();
      const rotationSeconds = this.normalizeQrRotationSeconds(session.qrRotationSeconds);

      const updatePayload: Partial<AttendanceSession> = {
        qrToken: nextQrToken,
        sessionCode: nextSessionCode,
        qrTokenUpdatedAt: nowIso,
        qrRotationSeconds: rotationSeconds,
      };

      transaction.update(sessionRef, updatePayload);

      return {
        ...session,
        ...updatePayload,
      };
    });
  }

  private async closeExpiredSessionIfNeeded(sessionId: string): Promise<AttendanceSession> {
    const sessionSnap = await getDoc(doc(this.sessionsCollection, sessionId));

    if (!sessionSnap.exists()) {
      throw new Error('Attendance session not found.');
    }

    const session = this.mapSession(sessionSnap.id, sessionSnap.data());

    if (session.status === 'closed') {
      return session;
    }

    if (!this.isSessionExpired(session)) {
      return session;
    }

    return this.closeSessionAndMarkAbsentees(sessionId, 'auto_duration_expired');
  }

  private async closeSessionAndMarkAbsentees(
    sessionId: string,
    closeReason: AttendanceCloseReason = 'manual_close',
  ): Promise<AttendanceSession> {
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
          !student.isArchived &&
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
    const endTime =
      closeReason === 'auto_duration_expired' && session.autoCloseAt ? session.autoCloseAt : now;

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
        timeRecorded: endTime,
        recordedBy: session.instructorId,
        isValid: true,
        remarks:
          closeReason === 'auto_duration_expired'
            ? 'Auto-marked absent when the session duration expired.'
            : 'Auto-marked absent when the attendance session was closed.',
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
      closeReason,
    });
    batches.push(currentBatch);

    for (const batch of batches) {
      await batch.commit();
    }

    const closedSession: AttendanceSession = {
      ...session,
      status: 'closed',
      endTime,
      closeReason,
    };

    this.runSessionCloseNotificationsInBackground(
      closedSession,
      offering,
      sectionStudents,
      absentRecords,
    );

    return closedSession;
  }

  private runSessionCloseNotificationsInBackground(
    closedSession: AttendanceSession,
    offering: ClassOffering,
    sectionStudents: Student[],
    absentRecords: AttendanceRecord[],
  ): void {
    void (async () => {
      try {
        await Promise.all([
          this.notifySessionEndedSafely(closedSession, offering, sectionStudents),
          this.notifyAbsentRecordsCreatedSafely(absentRecords),
        ]);
      } catch (error) {
        console.warn('SESSION CLOSE BACKGROUND NOTIFICATION ERROR:', error);
      }
    })();
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
      throw new Error(
        method === 'qr' ? 'Invalid or expired QR code.' : 'Invalid or expired session code.',
      );
    }

    const session = this.mapSession(sessionDoc.id, sessionDoc.data());

    if (session.status !== 'active') {
      throw new Error('This attendance session is already closed.');
    }

    if (this.isSessionExpired(session)) {
      await this.closeSessionAndMarkAbsentees(session.id!, 'auto_duration_expired');
      throw new Error('This attendance session has already expired.');
    }

    const validation = await this.checkStudentBelongsToSession(session, studentId);

    if (!validation.belongs) {
      const requestResult = await this.createPendingRequestOnce(session, studentId);

      if (requestResult.created) {
        await this.notifyPendingAttendanceRequestSafely(
          session,
          requestResult.request,
          validation.student,
          validation.offering,
        );
      }

      throw new Error(
        'You are not officially enrolled in this class section. Your attendance request has been sent to the teacher for approval.',
      );
    }

    const status = this.computeAttendanceStatus(session);

    const savedRecord = await this.createRecordTransactionally({
      sessionId: session.id!,
      studentId,
      status,
      method,
      timeRecorded: new Date().toISOString(),
      isValid: true,
    });

    await this.notifyAttendanceRecordedSafely(savedRecord);

    return savedRecord;
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

    if (session.status !== 'active') {
      throw new Error('Manual attendance is only available while the live session is active.');
    }

    if (this.isSessionExpired(session)) {
      await this.closeSessionAndMarkAbsentees(sessionId, 'auto_duration_expired');
      throw new Error('This attendance session has already expired.');
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

    const savedRecord = await this.createRecordTransactionally(payload);
    await this.notifyAttendanceRecordedSafely(savedRecord);

    return savedRecord;
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

    const approvedRecord = await runTransaction(db, async (transaction) => {
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

      if (session.status !== 'active') {
        throw new Error('This attendance session is already closed.');
      }

      if (this.isSessionExpired(session)) {
        throw new Error('This attendance session has already expired.');
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

    await this.notifyAttendanceRequestReviewedSafely(requestForLookup, 'approved', approvedRecord);

    return approvedRecord;
  }

  private async rejectRequestSafely(
    requestId: string,
    instructorId: string,
  ): Promise<AttendanceRequest> {
    const requestRef = doc(this.requestsCollection, requestId);

    const rejectedRequest = await runTransaction(db, async (transaction) => {
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
        status: 'rejected' as const,
        reviewedAt,
        reviewedBy: instructorId,
      });

      return {
        ...request,
        status: 'rejected' as const,
        reviewedAt,
        reviewedBy: instructorId,
      };
    });

    await this.notifyAttendanceRequestReviewedSafely(rejectedRequest, 'rejected');

    return rejectedRequest;
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

    if (student.status === 'inactive' || student.status === 'archived' || student.isArchived) {
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

    if (offering.status === 'inactive' || offering.status === 'archived' || offering.isArchived) {
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
  ): Promise<{ request: AttendanceRequest; created: boolean }> {
    const requestId = this.buildAttendanceRequestId(session.id!, studentId);
    const requestRef = doc(this.requestsCollection, requestId);

    return runTransaction(db, async (transaction) => {
      const requestSnap = await transaction.get(requestRef);

      if (requestSnap.exists()) {
        const existingRequest = this.mapRequest(requestSnap.id, requestSnap.data());

        if (existingRequest.status === 'pending') {
          return { request: existingRequest, created: false };
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
        request: {
          id: requestId,
          ...payload,
        },
        created: true,
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
      const isImportedExcelRecord = record.method === 'imported_excel';
      const isAutoAbsentRecord = record.status === 'absent' && record.method === 'manual';

      if (session.status !== 'active' && !isImportedExcelRecord && !isAutoAbsentRecord) {
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

  private async notifyPendingAttendanceRequestSafely(
    session: AttendanceSession,
    request: AttendanceRequest,
    student: Student,
    offering: ClassOffering,
  ): Promise<void> {
    try {
      const teacherUserIds = await this.resolveTeacherNotificationTargetUserIds(
        session.instructorId,
      );
      const studentUserIds = await this.resolveStudentNotificationTargetUserIds(student);
      const studentName = this.getStudentFullName(student);
      const classLabel = this.getClassOfferingLabel(offering);
      const payloads: FirestoreNotificationPayload[] = [];
      const entityId = request.id || `${request.sessionId}-${request.studentId}`;

      for (const teacherUserId of teacherUserIds) {
        payloads.push({
          targetUserId: teacherUserId,
          targetRole: 'teacher',
          title: 'Attendance Request Pending',
          message: `${studentName} submitted a sit-in or irregular attendance request for ${classLabel}.`,
          type: 'request',
          link: '/attendance',
          entityType: 'attendance_request',
          entityId,
          actorUserId: studentUserIds[0] || student.id || request.studentId,
          actorName: studentName,
        });
      }

      for (const studentUserId of studentUserIds) {
        payloads.push({
          targetUserId: studentUserId,
          targetRole: 'student',
          title: 'Attendance Request Sent',
          message: `Your attendance request for ${classLabel} was sent to the faculty for review.`,
          type: 'request',
          link: '/student-attendance',
          entityType: 'attendance_request',
          entityId,
          actorName: 'SAMS Attendance',
        });
      }

      await this.createNotificationsSafely(payloads);
    } catch (error) {
      console.warn('PENDING ATTENDANCE NOTIFICATION ERROR:', error);
    }
  }

  private async notifyAttendanceRecordedSafely(record: AttendanceRecord): Promise<void> {
    try {
      const student = await this.getStudentById(record.studentId);

      if (!student) {
        console.warn('ATTENDANCE NOTIFICATION SKIPPED: Student not resolved for', record.studentId);
        return;
      }

      const session = await this.getSessionByIdDirect(record.sessionId);
      const offering = session?.classOfferingId
        ? await this.getClassOfferingById(session.classOfferingId)
        : null;

      const studentUserIds = await this.resolveStudentNotificationTargetUserIds(student);
      const teacherUserIds = session?.instructorId
        ? await this.resolveTeacherNotificationTargetUserIds(session.instructorId)
        : [];
      const parents = await this.findParentsForStudent(student);
      const studentName = this.getStudentFullName(student);
      const classLabel = this.getClassOfferingLabel(offering);
      const statusLabel = this.toStatusLabel(record.status);
      const payloads: FirestoreNotificationPayload[] = [];
      const entityId = record.id || `${record.sessionId}-${record.studentId}`;
      const notificationType =
        record.status === 'late' || record.status === 'absent' ? 'warning' : 'attendance';

      for (const studentUserId of studentUserIds) {
        payloads.push({
          targetUserId: studentUserId,
          targetRole: 'student',
          title: 'Attendance Recorded',
          message: `Your attendance was marked ${statusLabel} for ${classLabel}.`,
          type: notificationType,
          link: '/student-attendance',
          entityType: 'attendance_record',
          entityId,
          actorName: 'SAMS Attendance',
        });
      }

      if (this.shouldNotifyFacultyForAttendanceRecord(record)) {
        for (const teacherUserId of teacherUserIds) {
          payloads.push({
            targetUserId: teacherUserId,
            targetRole: 'teacher',
            title: 'Student Attendance Submitted',
            message: `${studentName} was marked ${statusLabel} for ${classLabel}.`,
            type: notificationType,
            link: '/attendance',
            entityType: 'attendance_record',
            entityId,
            actorUserId: studentUserIds[0] || student.id || record.studentId,
            actorName: studentName,
          });
        }
      }

      for (const parent of parents) {
        const parentUserIds = await this.resolveParentNotificationTargetUserIds(parent);

        for (const parentUserId of parentUserIds) {
          payloads.push({
            targetUserId: parentUserId,
            targetRole: 'parent',
            title: 'Child Attendance Update',
            message: `${studentName} was marked ${statusLabel} for ${classLabel}.`,
            type: record.status === 'absent' || record.status === 'late' ? 'warning' : 'attendance',
            link: '/parent-attendance',
            entityType: 'attendance_record',
            entityId,
            actorName: 'SAMS Attendance',
          });
        }
      }

      await this.createNotificationsSafely(payloads);
      await this.notifyAttendanceConcernIfNeeded(record, student, parents, offering);
    } catch (error) {
      console.warn('ATTENDANCE RECORDED NOTIFICATION ERROR:', error);
    }
  }

  private shouldNotifyFacultyForAttendanceRecord(record: AttendanceRecord): boolean {
    return record.method === 'qr' || record.method === 'code';
  }

  private async notifyAbsentRecordsCreatedSafely(records: AttendanceRecord[]): Promise<void> {
    if (!records.length) {
      return;
    }

    await Promise.all(records.map((record) => this.notifyAttendanceRecordedSafely(record)));
  }

  private async notifyAttendanceRequestReviewedSafely(
    request: AttendanceRequest,
    decision: 'approved' | 'rejected',
    record?: AttendanceRecord,
  ): Promise<void> {
    try {
      const student = await this.getStudentById(request.studentId);

      if (!student) return;

      const session = await this.getSessionByIdDirect(request.sessionId);
      const offering = session?.classOfferingId
        ? await this.getClassOfferingById(session.classOfferingId)
        : null;

      const studentUserIds = await this.resolveStudentNotificationTargetUserIds(student);
      const parents = await this.findParentsForStudent(student);
      const studentName = this.getStudentFullName(student);
      const classLabel = this.getClassOfferingLabel(offering);
      const isApproved = decision === 'approved';
      const statusLabel = record ? this.toStatusLabel(record.status) : 'Rejected';
      const payloads: FirestoreNotificationPayload[] = [];
      const entityId = request.id || `${request.sessionId}-${request.studentId}`;

      for (const studentUserId of studentUserIds) {
        payloads.push({
          targetUserId: studentUserId,
          targetRole: 'student',
          title: isApproved ? 'Attendance Request Approved' : 'Attendance Request Rejected',
          message: isApproved
            ? `Your attendance request for ${classLabel} was approved and marked ${statusLabel}.`
            : `Your attendance request for ${classLabel} was rejected by the faculty.`,
          type: isApproved ? 'success' : 'error',
          link: '/student-attendance',
          entityType: 'attendance_request',
          entityId,
          actorName: 'SAMS Attendance',
        });
      }

      for (const parent of parents) {
        const parentUserIds = await this.resolveParentNotificationTargetUserIds(parent);

        for (const parentUserId of parentUserIds) {
          payloads.push({
            targetUserId: parentUserId,
            targetRole: 'parent',
            title: isApproved
              ? 'Child Attendance Request Approved'
              : 'Child Attendance Request Rejected',
            message: isApproved
              ? `${studentName}'s attendance request for ${classLabel} was approved and marked ${statusLabel}.`
              : `${studentName}'s attendance request for ${classLabel} was rejected by the faculty.`,
            type: isApproved ? 'success' : 'warning',
            link: '/parent-attendance',
            entityType: 'attendance_request',
            entityId,
            actorName: 'SAMS Attendance',
          });
        }
      }

      await this.createNotificationsSafely(payloads);

      if (record) {
        await this.notifyAttendanceConcernIfNeeded(record, student, parents, offering);
      }
    } catch (error) {
      console.warn('ATTENDANCE REQUEST REVIEW NOTIFICATION ERROR:', error);
    }
  }

  private async notifyAttendanceConcernIfNeeded(
    record: AttendanceRecord,
    student: Student,
    parents: Parent[],
    offering: ClassOffering | null,
  ): Promise<void> {
    if (record.status !== 'absent') {
      return;
    }

    const recentAbsentCount = await this.getRecentConsecutiveAbsenceCount(record.studentId);

    if (recentAbsentCount < 3) {
      return;
    }

    const session = await this.getSessionByIdDirect(record.sessionId);
    const teacherUserIds = session?.instructorId
      ? await this.resolveTeacherNotificationTargetUserIds(session.instructorId)
      : [];
    const studentName = this.getStudentFullName(student);
    const classLabel = this.getClassOfferingLabel(offering);
    const payloads: FirestoreNotificationPayload[] = [];
    const entityId = record.id || `${record.sessionId}-${record.studentId}`;

    for (const teacherUserId of teacherUserIds) {
      payloads.push({
        targetUserId: teacherUserId,
        targetRole: 'teacher',
        title: 'Student Needs Monitoring',
        message: `${studentName} has ${recentAbsentCount} consecutive absence records. Please review the attendance history.`,
        type: 'warning',
        link: '/reports',
        entityType: 'absence_warning',
        entityId,
        actorName: 'SAMS Attendance',
      });
    }

    for (const parent of parents) {
      const parentUserIds = await this.resolveParentNotificationTargetUserIds(parent);

      for (const parentUserId of parentUserIds) {
        payloads.push({
          targetUserId: parentUserId,
          targetRole: 'parent',
          title: 'Absence Monitoring Alert',
          message: `${studentName} has ${recentAbsentCount} consecutive absence records. Latest class: ${classLabel}.`,
          type: 'warning',
          link: '/parent-attendance',
          entityType: 'absence_warning',
          entityId,
          actorName: 'SAMS Attendance',
        });
      }
    }

    await this.createNotificationsSafely(payloads);
  }

  private async notifySessionStartedSafely(session: AttendanceSession): Promise<void> {
    try {
      if (!session.id || !session.classOfferingId || session.mode === 'imported_excel') {
        return;
      }

      const offering = await this.getClassOfferingById(session.classOfferingId);

      if (!offering) {
        return;
      }

      const students = await this.getRegularStudentsForOffering(offering);

      await this.notifyStudentsForSessionStatusSafely(session, offering, students, 'started');
    } catch (error) {
      console.warn('SESSION START NOTIFICATION ERROR:', error);
    }
  }

  private async notifySessionEndedSafely(
    session: AttendanceSession,
    offering: ClassOffering,
    students: Student[],
  ): Promise<void> {
    try {
      if (!session.id || session.mode === 'imported_excel') {
        return;
      }

      await this.notifyStudentsForSessionStatusSafely(session, offering, students, 'ended');
    } catch (error) {
      console.warn('SESSION END NOTIFICATION ERROR:', error);
    }
  }

  private async notifyStudentsForSessionStatusSafely(
    session: AttendanceSession,
    offering: ClassOffering,
    students: Student[],
    status: 'started' | 'ended',
  ): Promise<void> {
    const classLabel = this.getClassOfferingLabel(offering);
    const payloads: FirestoreNotificationPayload[] = [];

    for (const student of students) {
      const studentUserIds = await this.resolveStudentNotificationTargetUserIds(student);

      for (const studentUserId of studentUserIds) {
        payloads.push({
          targetUserId: studentUserId,
          targetRole: 'student',
          title: status === 'started' ? 'Attendance Session Started' : 'Attendance Session Ended',
          message:
            status === 'started'
              ? `Your attendance session for ${classLabel} has started. Please scan the QR code or enter the session code before it closes.`
              : `The attendance session for ${classLabel} has ended.`,
          type: 'attendance',
          link: '/student-attendance',
          entityType: 'attendance_session',
          entityId: session.id,
          actorName: 'SAMS Attendance',
        });
      }
    }

    await this.createNotificationsSafely(payloads);
  }

  private async getRegularStudentsForOffering(offering: ClassOffering): Promise<Student[]> {
    const studentsSnapshot = await getDocs(this.studentsCollection);

    return studentsSnapshot.docs
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
          !student.isArchived &&
          this.studentMatchesOfferingSection(student, offering) &&
          Boolean(this.resolveStudentUserId(student)),
      );
  }

  private async createNotificationsSafely(payloads: FirestoreNotificationPayload[]): Promise<void> {
    const seen = new Set<string>();
    const validPayloads: FirestoreNotificationPayload[] = [];

    for (const payload of payloads) {
      const targetUserId = String(payload.targetUserId || '').trim();

      if (!targetUserId) {
        continue;
      }

      const isCorrectRoleTarget = await this.isValidRoleBasedNotificationTarget(payload);

      if (!isCorrectRoleTarget) {
        console.warn('ROLE-BASED NOTIFICATION SKIPPED:', {
          targetUserId,
          targetRole: payload.targetRole,
          title: payload.title,
          entityType: payload.entityType,
          entityId: payload.entityId,
        });
        continue;
      }

      const key = [
        targetUserId,
        payload.targetRole || '',
        payload.title || '',
        payload.entityType || '',
        payload.entityId || '',
      ].join('|');

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      validPayloads.push(payload);
    }

    if (validPayloads.length === 0) return;

    try {
      await this.notificationService.notifyUsers(validPayloads);
      console.log(
        'SAMS attendance notifications created:',
        validPayloads.map((payload) => ({
          targetUserId: payload.targetUserId,
          targetRole: payload.targetRole,
          title: payload.title,
          entityId: payload.entityId,
        })),
      );
    } catch (error) {
      console.warn('CREATE NOTIFICATIONS ERROR:', error);
    }
  }

  private async getStudentById(studentId: string): Promise<Student | null> {
    const cleanStudentId = String(studentId || '').trim();

    if (!cleanStudentId) return null;

    const studentSnap = await getDoc(doc(this.studentsCollection, cleanStudentId));

    if (studentSnap.exists()) {
      return {
        id: studentSnap.id,
        ...(studentSnap.data() as Omit<Student, 'id'>),
      };
    }

    const byUserIdSnapshot = await getDocs(
      query(this.studentsCollection, where('userId', '==', cleanStudentId)),
    );

    if (!byUserIdSnapshot.empty) {
      const foundStudent = byUserIdSnapshot.docs[0];

      return {
        id: foundStudent.id,
        ...(foundStudent.data() as Omit<Student, 'id'>),
      };
    }

    const byStudentNumberSnapshot = await getDocs(
      query(this.studentsCollection, where('studentNumber', '==', cleanStudentId)),
    );

    if (!byStudentNumberSnapshot.empty) {
      const foundStudent = byStudentNumberSnapshot.docs[0];

      return {
        id: foundStudent.id,
        ...(foundStudent.data() as Omit<Student, 'id'>),
      };
    }

    return null;
  }

  private async getSessionByIdDirect(sessionId: string): Promise<AttendanceSession | null> {
    const cleanSessionId = String(sessionId || '').trim();

    if (!cleanSessionId) return null;

    const sessionSnap = await getDoc(doc(this.sessionsCollection, cleanSessionId));

    if (!sessionSnap.exists()) {
      return null;
    }

    return this.mapSession(sessionSnap.id, sessionSnap.data());
  }

  private async getClassOfferingById(classOfferingId: string): Promise<ClassOffering | null> {
    const cleanOfferingId = String(classOfferingId || '').trim();

    if (!cleanOfferingId) return null;

    const offeringSnap = await getDoc(doc(this.classOfferingsCollection, cleanOfferingId));

    if (!offeringSnap.exists()) {
      return null;
    }

    return {
      id: offeringSnap.id,
      ...(offeringSnap.data() as Omit<ClassOffering, 'id'>),
    };
  }

  private async findParentsForStudent(student: Student): Promise<Parent[]> {
    const studentId = String(student.id || '').trim();
    const studentNumber = String(student.studentNumber || '').trim();
    const studentUserId = String(student.userId || '').trim();
    const parentId = String(student.parentId || '').trim();
    const parentEmail = String(student.parentEmail || '')
      .trim()
      .toLowerCase();

    const possibleStudentKeys = [studentId, studentNumber, studentUserId]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    const matchedParents: Parent[] = [];
    const seenParentKeys = new Set<string>();

    const addParent = (parent: Parent | null): void => {
      if (!parent) return;

      const parentRole = String((parent as Parent & { role?: string }).role || '')
        .trim()
        .toLowerCase();
      const parentStatus = String(parent.status || '').toLowerCase();
      const isInactive =
        parentStatus === 'inactive' || parentStatus === 'archived' || Boolean(parent.isArchived);

      if (parentRole && parentRole !== 'parent') return;
      if (isInactive) return;

      const key = String(parent.id || parent.userId || parent.email || '').trim();

      if (!key || seenParentKeys.has(key)) {
        return;
      }

      seenParentKeys.add(key);
      matchedParents.push(parent);
    };

    if (parentId) {
      const parentSnap = await getDoc(doc(this.parentsCollection, parentId));

      if (parentSnap.exists()) {
        addParent({
          id: parentSnap.id,
          ...(parentSnap.data() as Omit<Parent, 'id'>),
        });
      }
    }

    const parentsSnapshot = await getDocs(this.parentsCollection);

    parentsSnapshot.docs.forEach((parentSnap) => {
      const parent = {
        id: parentSnap.id,
        ...(parentSnap.data() as Omit<Parent, 'id'>),
      } as Parent;

      const parentData = parent as Parent & {
        linkedStudentIds?: string[];
        linkedStudents?: unknown[];
        childIds?: string[];
        childrenIds?: string[];
        studentNumber?: string;
      };

      /*
       * Important:
       * Do not compare parent.id to the student keys here.
       * parent.id is the parent record identifier, not the child identifier.
       * Comparing it to the student ID can accidentally send Parent-only notifications
       * to a Student account if IDs overlap or if data was copied incorrectly.
       */
      const directChildValues = [parent.studentId, parentData.studentNumber]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

      const arrayChildValues = [
        ...(Array.isArray(parent.studentIds) ? parent.studentIds : []),
        ...(Array.isArray(parentData.linkedStudentIds) ? parentData.linkedStudentIds : []),
        ...(Array.isArray(parentData.childIds) ? parentData.childIds : []),
        ...(Array.isArray(parentData.childrenIds) ? parentData.childrenIds : []),
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

      const linkedObjectChildValues = Array.isArray(parentData.linkedStudents)
        ? parentData.linkedStudents
            .flatMap((item) => {
              if (!item || typeof item !== 'object') return [];

              const linked = item as {
                id?: string;
                studentId?: string;
                studentNumber?: string;
                userId?: string;
              };

              return [linked.id, linked.studentId, linked.studentNumber, linked.userId];
            })
            .map((value) => String(value || '').trim())
            .filter(Boolean)
        : [];

      const hasStudentMatch = possibleStudentKeys.some(
        (key) =>
          directChildValues.includes(key) ||
          arrayChildValues.includes(key) ||
          linkedObjectChildValues.includes(key),
      );

      const hasParentMatch = parentId && String(parent.id || '').trim() === parentId;
      const hasEmailMatch =
        parentEmail &&
        String(parent.email || '')
          .trim()
          .toLowerCase() === parentEmail;

      if (hasStudentMatch || hasParentMatch || hasEmailMatch) {
        addParent(parent);
      }
    });

    return matchedParents;
  }

  private resolveParentUserId(parent: Parent): string {
    return String(parent.userId || parent.id || '').trim();
  }

  private async resolveStudentNotificationTargetUserIds(student: Student): Promise<string[]> {
    const ids = new Set<string>();
    const source = student as Student & {
      email?: string;
      username?: string;
      linkedUserId?: string | number;
      accountId?: string | number;
      profileId?: string | number;
    };

    this.addPossibleTargetId(ids, source.userId);
    this.addPossibleTargetId(ids, source.linkedUserId);
    this.addPossibleTargetId(ids, source.accountId);
    this.addPossibleTargetId(ids, source.profileId);
    this.addPossibleTargetId(ids, source.id);

    await this.addExistingUserDocId(ids, source.userId);
    await this.addExistingUserDocId(ids, source.id);
    await this.addExistingUserDocId(ids, source.studentNumber);

    await this.addUserIdsByField(ids, 'email', source.email);
    await this.addUserIdsByField(ids, 'username', source.username);
    await this.addUserIdsByField(ids, 'studentId', source.id);
    await this.addUserIdsByField(ids, 'studentId', source.studentNumber);
    await this.addUserIdsByField(ids, 'linkedStudentId', source.id);
    await this.addUserIdsByField(ids, 'linkedStudentId', source.studentNumber);
    await this.addUserIdsByField(ids, 'studentProfileId', source.id);
    await this.addUserIdsByField(ids, 'profileId', source.id);

    return Array.from(ids);
  }

  private async resolveTeacherNotificationTargetUserIds(teacherId: string): Promise<string[]> {
    const ids = new Set<string>();
    const cleanTeacherId = String(teacherId || '').trim();

    this.addPossibleTargetId(ids, cleanTeacherId);
    await this.addExistingUserDocId(ids, cleanTeacherId);

    if (!cleanTeacherId) {
      return Array.from(ids);
    }

    const teacherSnap = await getDoc(doc(this.teachersCollection, cleanTeacherId));

    if (teacherSnap.exists()) {
      const teacher = {
        id: teacherSnap.id,
        ...(teacherSnap.data() as Record<string, unknown>),
      } as Teacher & {
        userId?: string | number;
        email?: string;
        username?: string;
        employeeId?: string;
        employeeNo?: string;
        linkedUserId?: string | number;
        accountId?: string | number;
        profileId?: string | number;
      };

      this.addPossibleTargetId(ids, teacher.userId);
      this.addPossibleTargetId(ids, teacher.linkedUserId);
      this.addPossibleTargetId(ids, teacher.accountId);
      this.addPossibleTargetId(ids, teacher.profileId);
      this.addPossibleTargetId(ids, teacher.id);

      await this.addExistingUserDocId(ids, teacher.userId);
      await this.addExistingUserDocId(ids, teacher.id);
      await this.addExistingUserDocId(ids, teacher.employeeId);
      await this.addExistingUserDocId(ids, teacher.employeeNo);

      await this.addUserIdsByField(ids, 'email', teacher.email);
      await this.addUserIdsByField(ids, 'username', teacher.username);
      await this.addUserIdsByField(ids, 'teacherId', teacher.id);
      await this.addUserIdsByField(ids, 'facultyId', teacher.id);
      await this.addUserIdsByField(ids, 'instructorId', teacher.id);
      await this.addUserIdsByField(ids, 'linkedTeacherId', teacher.id);
      await this.addUserIdsByField(ids, 'linkedFacultyId', teacher.id);
      await this.addUserIdsByField(ids, 'profileId', teacher.id);
      await this.addUserIdsByField(ids, 'employeeId', teacher.employeeId);
      await this.addUserIdsByField(ids, 'employeeNo', teacher.employeeNo);
    }

    return Array.from(ids);
  }

  private async resolveParentNotificationTargetUserIds(parent: Parent): Promise<string[]> {
    const ids = new Set<string>();
    const source = parent as Parent & {
      username?: string;
      linkedUserId?: string | number;
      accountId?: string | number;
      profileId?: string | number;
    };

    /*
     * Parent-only notifications must target Parent user accounts only.
     * Do not add studentId, studentIds, linkedStudentIds, or childIds here.
     * Those fields identify the child, not the parent account that should receive the notification.
     */
    this.addPossibleTargetId(ids, source.userId);
    this.addPossibleTargetId(ids, source.linkedUserId);
    this.addPossibleTargetId(ids, source.accountId);
    this.addPossibleTargetId(ids, source.profileId);

    await this.addExistingUserDocIdForRole(ids, source.userId, 'parent');
    await this.addExistingUserDocIdForRole(ids, source.linkedUserId, 'parent');
    await this.addExistingUserDocIdForRole(ids, source.accountId, 'parent');
    await this.addExistingUserDocIdForRole(ids, source.profileId, 'parent');

    /*
     * Add parent.id only when it is also a real user document with role parent.
     * This prevents a child/student record ID from receiving Parent notifications.
     */
    await this.addExistingUserDocIdForRole(ids, source.id, 'parent');

    await this.addUserIdsByFieldForRole(ids, 'email', source.email, 'parent');
    await this.addUserIdsByFieldForRole(ids, 'username', source.username, 'parent');
    await this.addUserIdsByFieldForRole(ids, 'parentId', source.id, 'parent');
    await this.addUserIdsByFieldForRole(ids, 'linkedParentId', source.id, 'parent');
    await this.addUserIdsByFieldForRole(ids, 'parentProfileId', source.id, 'parent');
    await this.addUserIdsByFieldForRole(ids, 'profileId', source.id, 'parent');

    const verifiedIds: string[] = [];

    for (const id of ids) {
      const validParentTarget = await this.isValidRoleBasedNotificationTarget({
        targetUserId: id,
        targetRole: 'parent',
        title: 'Parent Target Validation',
        message: 'Parent target validation.',
        type: 'system',
      });

      if (validParentTarget) {
        verifiedIds.push(id);
      }
    }

    return Array.from(new Set(verifiedIds));
  }

  private addPossibleTargetId(targets: Set<string>, value: unknown): void {
    const cleanValue = String(value || '').trim();

    if (cleanValue) {
      targets.add(cleanValue);
    }
  }

  private async addExistingUserDocId(targets: Set<string>, value: unknown): Promise<void> {
    const cleanValue = String(value || '').trim();

    if (!cleanValue) return;

    try {
      const userSnap = await getDoc(doc(this.usersCollection, cleanValue));

      if (userSnap.exists()) {
        targets.add(userSnap.id);
      }
    } catch (error) {
      console.warn('USER DOC TARGET LOOKUP SKIPPED:', error);
    }
  }

  private async addUserIdsByField(
    targets: Set<string>,
    fieldName: string,
    value: unknown,
  ): Promise<void> {
    const cleanValue = String(value || '').trim();

    if (!cleanValue) return;

    try {
      const snapshot = await getDocs(
        query(this.usersCollection, where(fieldName, '==', cleanValue)),
      );

      snapshot.docs.forEach((userSnap) => targets.add(userSnap.id));
    } catch (error) {
      console.warn(`USER TARGET LOOKUP SKIPPED (${fieldName}):`, error);
    }
  }

  private async addExistingUserDocIdForRole(
    targets: Set<string>,
    value: unknown,
    expectedRole: 'admin' | 'teacher' | 'student' | 'parent',
  ): Promise<void> {
    const cleanValue = String(value || '').trim();

    if (!cleanValue) return;

    try {
      const userSnap = await getDoc(doc(this.usersCollection, cleanValue));

      if (!userSnap.exists()) {
        return;
      }

      const role = this.normalizeRole((userSnap.data() as { role?: string }).role);

      if (role === expectedRole) {
        targets.add(userSnap.id);
      }
    } catch (error) {
      console.warn('ROLE USER DOC TARGET LOOKUP SKIPPED:', error);
    }
  }

  private async addUserIdsByFieldForRole(
    targets: Set<string>,
    fieldName: string,
    value: unknown,
    expectedRole: 'admin' | 'teacher' | 'student' | 'parent',
  ): Promise<void> {
    const cleanValue = String(value || '').trim();

    if (!cleanValue) return;

    try {
      const snapshot = await getDocs(
        query(this.usersCollection, where(fieldName, '==', cleanValue)),
      );

      snapshot.docs.forEach((userSnap) => {
        const role = this.normalizeRole((userSnap.data() as { role?: string }).role);

        if (role === expectedRole) {
          targets.add(userSnap.id);
        }
      });
    } catch (error) {
      console.warn(`ROLE USER TARGET LOOKUP SKIPPED (${fieldName}):`, error);
    }
  }

  private async isValidRoleBasedNotificationTarget(
    payload: FirestoreNotificationPayload,
  ): Promise<boolean> {
    const targetUserId = String(payload.targetUserId || '').trim();
    const expectedRole = this.normalizeRole(payload.targetRole);

    if (!targetUserId) {
      return false;
    }

    if (!expectedRole) {
      return true;
    }

    const actualUserRole = await this.resolveUserRoleByTargetId(targetUserId);

    if (actualUserRole) {
      return actualUserRole === expectedRole;
    }

    /*
     * When the target is a profile document ID instead of a users document ID,
     * validate it against the correct profile collection.
     * This keeps existing Student/Faculty notification compatibility while still
     * blocking Parent-only notifications from appearing in Student accounts.
     */
    if (expectedRole === 'parent') {
      return this.parentProfileTargetExists(targetUserId);
    }

    if (expectedRole === 'student') {
      return this.studentProfileTargetExists(targetUserId);
    }

    if (expectedRole === 'teacher') {
      return this.teacherProfileTargetExists(targetUserId);
    }

    return true;
  }

  private async resolveUserRoleByTargetId(targetUserId: string): Promise<string> {
    const cleanTargetUserId = String(targetUserId || '').trim();

    if (!cleanTargetUserId) {
      return '';
    }

    try {
      const directUserSnap = await getDoc(doc(this.usersCollection, cleanTargetUserId));

      if (directUserSnap.exists()) {
        return this.normalizeRole((directUserSnap.data() as { role?: string }).role);
      }

      const possibleFields = ['uid', 'userId', 'accountId', 'profileId'];

      for (const fieldName of possibleFields) {
        const snapshot = await getDocs(
          query(this.usersCollection, where(fieldName, '==', cleanTargetUserId)),
        );

        if (!snapshot.empty) {
          return this.normalizeRole((snapshot.docs[0].data() as { role?: string }).role);
        }
      }
    } catch (error) {
      console.warn('USER ROLE TARGET VALIDATION SKIPPED:', error);
    }

    return '';
  }

  private async parentProfileTargetExists(targetUserId: string): Promise<boolean> {
    const cleanTargetUserId = String(targetUserId || '').trim();

    if (!cleanTargetUserId) {
      return false;
    }

    try {
      const directParentSnap = await getDoc(doc(this.parentsCollection, cleanTargetUserId));

      if (directParentSnap.exists()) {
        const parent = directParentSnap.data() as Parent & { role?: string };
        const role = this.normalizeRole(parent.role);
        const status = this.normalizeText(parent.status);

        return (
          (!role || role === 'parent') &&
          status !== 'inactive' &&
          status !== 'archived' &&
          !parent.isArchived
        );
      }

      const possibleFields = ['userId', 'linkedUserId', 'accountId', 'profileId'];

      for (const fieldName of possibleFields) {
        const snapshot = await getDocs(
          query(this.parentsCollection, where(fieldName, '==', cleanTargetUserId)),
        );

        if (!snapshot.empty) {
          const parent = snapshot.docs[0].data() as Parent & { role?: string };
          const role = this.normalizeRole(parent.role);
          const status = this.normalizeText(parent.status);

          return (
            (!role || role === 'parent') &&
            status !== 'inactive' &&
            status !== 'archived' &&
            !parent.isArchived
          );
        }
      }
    } catch (error) {
      console.warn('PARENT TARGET VALIDATION SKIPPED:', error);
    }

    return false;
  }

  private async studentProfileTargetExists(targetUserId: string): Promise<boolean> {
    const cleanTargetUserId = String(targetUserId || '').trim();

    if (!cleanTargetUserId) {
      return false;
    }

    try {
      const directStudentSnap = await getDoc(doc(this.studentsCollection, cleanTargetUserId));

      if (directStudentSnap.exists()) {
        return true;
      }

      const possibleFields = ['userId', 'uid', 'linkedUserId', 'accountId', 'profileId'];

      for (const fieldName of possibleFields) {
        const snapshot = await getDocs(
          query(this.studentsCollection, where(fieldName, '==', cleanTargetUserId)),
        );

        if (!snapshot.empty) {
          return true;
        }
      }
    } catch (error) {
      console.warn('STUDENT TARGET VALIDATION SKIPPED:', error);
    }

    return false;
  }

  private async teacherProfileTargetExists(targetUserId: string): Promise<boolean> {
    const cleanTargetUserId = String(targetUserId || '').trim();

    if (!cleanTargetUserId) {
      return false;
    }

    try {
      const directTeacherSnap = await getDoc(doc(this.teachersCollection, cleanTargetUserId));

      if (directTeacherSnap.exists()) {
        return true;
      }

      const possibleFields = ['userId', 'uid', 'linkedUserId', 'accountId', 'profileId'];

      for (const fieldName of possibleFields) {
        const snapshot = await getDocs(
          query(this.teachersCollection, where(fieldName, '==', cleanTargetUserId)),
        );

        if (!snapshot.empty) {
          return true;
        }
      }
    } catch (error) {
      console.warn('TEACHER TARGET VALIDATION SKIPPED:', error);
    }

    return false;
  }

  private normalizeRole(value: unknown): string {
    const role = String(value || '')
      .trim()
      .toLowerCase();

    if (role === 'faculty' || role === 'instructor') {
      return 'teacher';
    }

    if (role === 'administrator') {
      return 'admin';
    }

    return role;
  }

  private async resolveTeacherUserId(teacherId: string): Promise<string> {
    const ids = await this.resolveTeacherNotificationTargetUserIds(teacherId);
    return ids[0] || '';
  }

  private resolveStudentUserId(student: Student): string {
    return String(student.userId || student.id || '').trim();
  }

  private getStudentFullName(student: Student | null): string {
    if (!student) return 'Student';

    return `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student';
  }

  private getClassOfferingLabel(offering: ClassOffering | null): string {
    if (!offering) return 'the attendance session';

    const subject = offering.subjectCode || offering.subjectName || 'Class';
    const section = offering.sectionName || '';

    return section ? `${subject} - ${section}` : subject;
  }

  private toStatusLabel(status: AttendanceStatus): string {
    const normalized = String(status || '').toLowerCase();

    if (normalized === 'present') return 'Present';
    if (normalized === 'late') return 'Late';
    if (normalized === 'absent') return 'Absent';
    if (normalized === 'excused') return 'Excused';

    return 'Recorded';
  }

  private async getRecentConsecutiveAbsenceCount(studentId: string): Promise<number> {
    const recordsSnapshot = await getDocs(
      query(this.recordsCollection, where('studentId', '==', String(studentId || '').trim())),
    );

    const records = recordsSnapshot.docs
      .map((docSnap) => this.mapRecord(docSnap.id, docSnap.data()))
      .sort((a, b) => String(b.timeRecorded || '').localeCompare(String(a.timeRecorded || '')));

    let count = 0;

    for (const item of records) {
      if (item.status !== 'absent') {
        break;
      }

      count++;
    }

    return count;
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

  private isSessionExpired(session: AttendanceSession): boolean {
    if (session.status !== 'active') return false;
    if (!session.autoCloseAt) return false;

    const autoCloseAt = new Date(session.autoCloseAt).getTime();
    if (Number.isNaN(autoCloseAt)) return false;

    return Date.now() >= autoCloseAt;
  }

  private normalizeCreateSessionOptions(
    options: CreateAttendanceSessionOptions | number,
  ): CreateAttendanceSessionOptions {
    if (typeof options === 'number') {
      return {
        durationMinutes: options,
      };
    }

    return options || {};
  }

  private normalizePositiveNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.round(parsed);
  }

  private normalizeQrRotationSeconds(value: unknown): number {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return this.defaultQrRotationSeconds;
    }

    const rounded = Math.round(parsed);

    if (rounded < this.minQrRotationSeconds) {
      return this.minQrRotationSeconds;
    }

    if (rounded > this.maxQrRotationSeconds) {
      return this.maxQrRotationSeconds;
    }

    return rounded;
  }

  private extractTimeOnly(value: unknown): string {
    const text = String(value || '').trim();

    if (/^\d{2}:\d{2}$/.test(text)) {
      return text;
    }

    const date = new Date(text);

    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');

    return `${hour}:${minute}`;
  }

  private buildDateTimeIso(dateValue: string, timeValue: string): string {
    const cleanDate = String(dateValue || '').trim();
    const cleanTime = String(timeValue || '00:00').trim();
    const time = /^\d{2}:\d{2}$/.test(cleanTime) ? cleanTime : '00:00';
    const date = new Date(`${cleanDate}T${time}:00`);

    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString();
    }

    return date.toISOString();
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
    const lateThresholdMinutes = session.lateThresholdMinutes ?? this.defaultLateThresholdMinutes;
    const lateLimit = new Date(start.getTime() + lateThresholdMinutes * 60_000);

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
