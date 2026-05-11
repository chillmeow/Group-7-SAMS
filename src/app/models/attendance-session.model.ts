export type AttendanceSessionStatus = 'active' | 'closed';

export type AttendanceSessionMode = 'live' | 'imported_excel';

export type AttendanceCloseReason = 'manual_close' | 'auto_duration_expired' | 'historical_import';

export interface AttendanceSession {
  id?: string;

  classOfferingId: string;
  instructorId: string;

  date: string;
  startTime: string;
  endTime?: string;

  sessionCode: string;
  qrToken: string;

  /**
   * Used by the QR anti-cheating system.
   * Every QR refresh updates this timestamp.
   */
  qrTokenUpdatedAt?: string;

  /**
   * QR refresh interval in seconds.
   * Default: 30 seconds.
   */
  qrRotationSeconds?: number;

  /**
   * Teacher-selected session duration.
   * Example: 15, 30, 45, 60, 120 minutes.
   */
  durationMinutes?: number;

  /**
   * Exact timestamp when the live session should automatically close.
   */
  autoCloseAt?: string;

  /**
   * Live = actual QR attendance session.
   * Imported Excel = old/historical attendance encoded through upload.
   */
  mode?: AttendanceSessionMode;

  status: AttendanceSessionStatus;

  closeReason?: AttendanceCloseReason;

  lateThresholdMinutes?: number;

  createdAt: string;
}
