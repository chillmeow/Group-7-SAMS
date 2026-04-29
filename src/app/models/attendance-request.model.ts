export interface AttendanceRequest {
  id?: string;

  sessionId: string;
  studentId: string;
  classOfferingId: string;

  reason: 'section_mismatch' | 'manual_review';

  status: 'pending' | 'approved' | 'rejected';

  requestedAt: string;

  reviewedAt?: string;
  reviewedBy?: string;
}
