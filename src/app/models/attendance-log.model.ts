export interface AttendanceLog {
  id?: string;

  sessionId: string;
  studentId: string;

  action: 'scan' | 'manual_mark' | 'edit';

  timestamp: string;

  deviceInfo?: string;
  ipAddress?: string;
}
