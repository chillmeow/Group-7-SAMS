export interface AttendanceSession {
  id?: string;

  classOfferingId: string;
  instructorId: string;

  date: string;
  startTime: string;
  endTime?: string;

  sessionCode: string;
  qrToken: string;

  status: 'active' | 'closed';

  lateThresholdMinutes?: number;

  createdAt: string;
}
