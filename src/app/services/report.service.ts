import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map } from 'rxjs';

import { AttendanceRecordModel } from '../models/attendance-record.model';
import { AttendanceSessionModel } from '../models/attendance-session.model';
import { Student } from '../models/student.model';
import { ClassOffering } from '../models/class-offering.model';

import { AttendanceSummaryReportModel, StudentAttendanceRiskModel } from '../models/report.model';

@Injectable({
  providedIn: 'root',
})
export class ReportService {
  private http = inject(HttpClient);

  private recordsApi = 'http://localhost:3000/attendanceRecords';
  private sessionsApi = 'http://localhost:3000/attendanceSessions';
  private studentsApi = 'http://localhost:3000/students';
  private offeringsApi = 'http://localhost:3000/classOfferings';

  getAttendanceSummary(): Observable<AttendanceSummaryReportModel[]> {
    return forkJoin({
      records: this.http.get<AttendanceRecordModel[]>(this.recordsApi),
      sessions: this.http.get<AttendanceSessionModel[]>(this.sessionsApi),
      offerings: this.http.get<ClassOffering[]>(this.offeringsApi),
      students: this.http.get<Student[]>(this.studentsApi),
    }).pipe(
      map(({ records, sessions, offerings, students }) => {
        const summaryMap: Record<string, any> = {};

        records.forEach((record) => {
          const session = sessions.find((s) => s.id === record.sessionId);
          if (!session) return;

          const offering = offerings.find((o) => o.id === session.offeringId);
          if (!offering) return;

          const subject =
            (offering as any).subject ?? (offering as any).subjectName ?? 'Unknown Subject';

          const section =
            (offering as any).section ?? (offering as any).sectionName ?? 'Unknown Section';

          const teacher =
            (offering as any).teacher ?? (offering as any).teacherName ?? 'Unknown Teacher';

          const key = `${subject}-${section}`;

          if (!summaryMap[key]) {
            summaryMap[key] = {
              subject,
              section,
              teacher,
              totalStudents: students.length,
              totalSessionsSet: new Set<number>(),
              present: 0,
              absent: 0,
              late: 0,
              excused: 0,
            };
          }

          summaryMap[key].totalSessionsSet.add(session.id);

          if (record.status === 'Present') {
            summaryMap[key].present++;
          } else if (record.status === 'Absent') {
            summaryMap[key].absent++;
          } else if (record.status === 'Late') {
            summaryMap[key].late++;
          } else if (record.status === 'Excused') {
            summaryMap[key].excused++;
          }
        });

        return Object.values(summaryMap).map((item: any) => {
          const totalMarked = item.present + item.absent + item.late + item.excused;

          return {
            subject: item.subject,
            section: item.section,
            teacher: item.teacher,
            totalStudents: item.totalStudents,
            totalSessions: item.totalSessionsSet.size,
            presentRate: totalMarked ? Math.round((item.present / totalMarked) * 100) : 0,
            absentRate: totalMarked ? Math.round((item.absent / totalMarked) * 100) : 0,
            lateRate: totalMarked ? Math.round((item.late / totalMarked) * 100) : 0,
          };
        });
      }),
    );
  }

  getStudentRiskReport(): Observable<StudentAttendanceRiskModel[]> {
    return forkJoin({
      records: this.http.get<AttendanceRecordModel[]>(this.recordsApi),
      students: this.http.get<Student[]>(this.studentsApi),
    }).pipe(
      map(({ records, students }) => {
        const riskMap: Record<number, any> = {};

        records.forEach((record) => {
          if (!riskMap[record.studentId]) {
            const student = students.find((s) => s.id === record.studentId);

            riskMap[record.studentId] = {
              studentId: record.studentId,
              studentName: student
                ? `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim() || 'Unknown'
                : 'Unknown',
              studentNo: student?.studentNo ?? '',
              section: student?.section ?? '',
              absences: 0,
              lates: 0,
              total: 0,
            };
          }

          riskMap[record.studentId].total++;

          if (record.status === 'Absent') {
            riskMap[record.studentId].absences++;
          } else if (record.status === 'Late') {
            riskMap[record.studentId].lates++;
          }
        });

        return Object.values(riskMap).map((item: any) => ({
          studentId: item.studentId,
          studentName: item.studentName,
          studentNo: item.studentNo,
          section: item.section,
          absences: item.absences,
          lates: item.lates,
          attendanceRate: item.total
            ? Math.round(((item.total - item.absences) / item.total) * 100)
            : 0,
        }));
      }),
    );
  }
}
