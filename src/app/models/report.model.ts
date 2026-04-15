export interface AttendanceSummaryReportModel {
  subject: string;
  section: string;
  teacher: string;

  totalStudents: number;
  totalSessions: number;

  presentRate: number;
  absentRate: number;
  lateRate: number;
}

export interface StudentAttendanceRiskModel {
  studentId: string;
  studentName: string;
  studentNo: string;

  section: string;

  absences: number;
  lates: number;

  attendanceRate: number;
}

export interface ReportFilterModel {
  section?: string;
  subject?: string;
  month?: string;
  search?: string;
}
