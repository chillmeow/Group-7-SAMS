export type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Excused';

export interface AttendanceRecordModel {
  id?: number;
  sessionId: number;
  studentId: number;
  status: AttendanceStatus;
  remarks?: string;
}
