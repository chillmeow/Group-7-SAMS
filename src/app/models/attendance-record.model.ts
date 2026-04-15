export interface AttendanceRecord {
  id?: string;

  sessionId: string;
  studentId: string;

  status: 'present' | 'late' | 'absent' | 'excused';

  method: 'qr' | 'manual' | 'code';

  timeRecorded: string;

  recordedBy?: string;

  isValid?: boolean;
}
