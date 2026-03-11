import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AttendanceSessionModel } from '../models/attendance-session.model';
import { AttendanceRecordModel } from '../models/attendance-record.model';

@Injectable({
  providedIn: 'root',
})
export class AttendanceService {
  private http = inject(HttpClient);

  private sessionApi = 'http://localhost:3000/attendanceSessions';
  private recordApi = 'http://localhost:3000/attendanceRecords';

  /* =========================
     Attendance Sessions
  ========================= */

  getSessions(): Observable<AttendanceSessionModel[]> {
    return this.http.get<AttendanceSessionModel[]>(this.sessionApi);
  }

  createSession(session: AttendanceSessionModel): Observable<AttendanceSessionModel> {
    return this.http.post<AttendanceSessionModel>(this.sessionApi, session);
  }

  deleteSession(id: number): Observable<void> {
    return this.http.delete<void>(`${this.sessionApi}/${id}`);
  }

  /* =========================
     Attendance Records
  ========================= */

  getRecords(): Observable<AttendanceRecordModel[]> {
    return this.http.get<AttendanceRecordModel[]>(this.recordApi);
  }

  getRecordsBySession(sessionId: number): Observable<AttendanceRecordModel[]> {
    return this.http.get<AttendanceRecordModel[]>(`${this.recordApi}?sessionId=${sessionId}`);
  }

  createRecord(record: AttendanceRecordModel): Observable<AttendanceRecordModel> {
    return this.http.post<AttendanceRecordModel>(this.recordApi, record);
  }

  updateRecord(
    id: number,
    record: Partial<AttendanceRecordModel>,
  ): Observable<AttendanceRecordModel> {
    return this.http.patch<AttendanceRecordModel>(`${this.recordApi}/${id}`, record);
  }

  deleteRecord(id: number): Observable<void> {
    return this.http.delete<void>(`${this.recordApi}/${id}`);
  }
}
