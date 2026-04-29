export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';

export type AttendanceMethod =
  | 'qr'
  | 'manual'
  | 'code'
  | 'teacher_assisted'
  | 'imported_excel'
  | 'imported_image';

export interface AttendanceRecord {
  id?: string;

  sessionId: string;
  studentId: string;

  status: AttendanceStatus;
  method: AttendanceMethod;

  timeRecorded: string;

  lateTime?: string;

  recordedBy?: string;

  isValid?: boolean;

  remarks?: string;
}
