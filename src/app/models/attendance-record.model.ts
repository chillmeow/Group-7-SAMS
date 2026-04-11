export type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Excused';

export interface AttendanceRecordModel {
  id?: string;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  time?: string;
  remarks?: string;
}
