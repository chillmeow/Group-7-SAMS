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

  private sessionApi = 'http://localhost:3000/sessions';
  private recordApi = 'http://localhost:3000/attendance';

  getSessions(): Observable<AttendanceSessionModel[]> {
    return this.http.get<AttendanceSessionModel[]>(this.sessionApi);
  }

  createSession(session: AttendanceSessionModel): Observable<AttendanceSessionModel> {
    return this.http.post<AttendanceSessionModel>(this.sessionApi, session);
  }

  deleteSession(id: string): Observable<void> {
    return this.http.delete<void>(`${this.sessionApi}/${id}`);
  }

  getRecords(): Observable<AttendanceRecordModel[]> {
    return this.http.get<AttendanceRecordModel[]>(this.recordApi);
  }

  getRecordsBySession(sessionId: string): Observable<AttendanceRecordModel[]> {
    return this.http.get<AttendanceRecordModel[]>(`${this.recordApi}?sessionId=${sessionId}`);
  }

  createRecord(record: AttendanceRecordModel): Observable<AttendanceRecordModel> {
    return this.http.post<AttendanceRecordModel>(this.recordApi, record);
  }

  updateRecord(
    id: string,
    record: Partial<AttendanceRecordModel>,
  ): Observable<AttendanceRecordModel> {
    return this.http.patch<AttendanceRecordModel>(`${this.recordApi}/${id}`, record);
  }

  deleteRecord(id: string): Observable<void> {
    return this.http.delete<void>(`${this.recordApi}/${id}`);
  }
}
