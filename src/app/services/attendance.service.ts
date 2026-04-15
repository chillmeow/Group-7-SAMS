import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap, throwError } from 'rxjs';

import { AttendanceSession } from '../models/attendance-session.model';
import { AttendanceRecord } from '../models/attendance-record.model';

@Injectable({
  providedIn: 'root',
})
export class AttendanceService {
  private http = inject(HttpClient);

  private sessionApi = 'http://localhost:3000/sessions';
  private recordApi = 'http://localhost:3000/attendance';

  getSessions(): Observable<AttendanceSession[]> {
    return this.http.get<AttendanceSession[]>(this.sessionApi);
  }

  getSessionById(sessionId: string): Observable<AttendanceSession | undefined> {
    return this.http
      .get<AttendanceSession[]>(`${this.sessionApi}?id=${sessionId}`)
      .pipe(map((sessions) => sessions[0]));
  }

  createSession(classOfferingId: string, instructorId: string): Observable<AttendanceSession> {
    const now = new Date();

    const newSession: AttendanceSession = {
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

    return this.http.post<AttendanceSession>(this.sessionApi, newSession);
  }

  closeSession(sessionId: string): Observable<AttendanceSession> {
    return this.http.patch<AttendanceSession>(`${this.sessionApi}/${sessionId}`, {
      status: 'closed',
      endTime: new Date().toISOString(),
    });
  }

  deleteSession(id: string): Observable<void> {
    return this.http.delete<void>(`${this.sessionApi}/${id}`);
  }

  getRecords(): Observable<AttendanceRecord[]> {
    return this.http.get<AttendanceRecord[]>(this.recordApi);
  }

  getRecordsBySession(sessionId: string): Observable<AttendanceRecord[]> {
    return this.http.get<AttendanceRecord[]>(`${this.recordApi}?sessionId=${sessionId}`);
  }

  getRecordsByStudent(studentId: string): Observable<AttendanceRecord[]> {
    return this.http.get<AttendanceRecord[]>(`${this.recordApi}?studentId=${studentId}`);
  }

  updateRecord(id: string, record: Partial<AttendanceRecord>): Observable<AttendanceRecord> {
    return this.http.patch<AttendanceRecord>(`${this.recordApi}/${id}`, record);
  }

  deleteRecord(id: string): Observable<void> {
    return this.http.delete<void>(`${this.recordApi}/${id}`);
  }

  submitViaQR(qrToken: string, studentId: string): Observable<AttendanceRecord> {
    return this.http
      .get<AttendanceSession[]>(`${this.sessionApi}?qrToken=${encodeURIComponent(qrToken)}`)
      .pipe(
        switchMap((sessions) => {
          const session = sessions[0];

          if (!session || !session.id) {
            return throwError(() => new Error('Invalid QR code.'));
          }

          if (session.status !== 'active') {
            return throwError(() => new Error('This attendance session is already closed.'));
          }

          return this.checkDuplicate(session.id, studentId).pipe(
            switchMap((alreadyExists) => {
              if (alreadyExists) {
                return throwError(() => new Error('Attendance already recorded for this session.'));
              }

              const status = this.computeAttendanceStatus(session);

              return this.createRecord({
                sessionId: session.id!,
                studentId,
                status,
                method: 'qr',
                timeRecorded: new Date().toISOString(),
                isValid: true,
              });
            }),
          );
        }),
      );
  }

  submitViaCode(sessionCode: string, studentId: string): Observable<AttendanceRecord> {
    return this.http
      .get<AttendanceSession[]>(`${this.sessionApi}?sessionCode=${encodeURIComponent(sessionCode)}`)
      .pipe(
        switchMap((sessions) => {
          const session = sessions[0];

          if (!session || !session.id) {
            return throwError(() => new Error('Invalid session code.'));
          }

          if (session.status !== 'active') {
            return throwError(() => new Error('This attendance session is already closed.'));
          }

          return this.checkDuplicate(session.id, studentId).pipe(
            switchMap((alreadyExists) => {
              if (alreadyExists) {
                return throwError(() => new Error('Attendance already recorded for this session.'));
              }

              const status = this.computeAttendanceStatus(session);

              return this.createRecord({
                sessionId: session.id!,
                studentId,
                status,
                method: 'code',
                timeRecorded: new Date().toISOString(),
                isValid: true,
              });
            }),
          );
        }),
      );
  }

  manualMark(
    sessionId: string,
    studentId: string,
    status: 'present' | 'late' | 'absent' | 'excused',
    instructorId: string,
  ): Observable<AttendanceRecord> {
    return this.checkDuplicate(sessionId, studentId).pipe(
      switchMap((alreadyExists) => {
        if (alreadyExists) {
          return throwError(() => new Error('Attendance already recorded for this student.'));
        }

        return this.createRecord({
          sessionId,
          studentId,
          status,
          method: 'manual',
          timeRecorded: new Date().toISOString(),
          recordedBy: instructorId,
          isValid: true,
        });
      }),
    );
  }

  private createRecord(record: AttendanceRecord): Observable<AttendanceRecord> {
    return this.http.post<AttendanceRecord>(this.recordApi, record);
  }

  private checkDuplicate(sessionId: string, studentId: string): Observable<boolean> {
    return this.http
      .get<AttendanceRecord[]>(`${this.recordApi}?sessionId=${sessionId}&studentId=${studentId}`)
      .pipe(map((records) => records.length > 0));
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
}
