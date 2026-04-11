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

  private recordsApi = 'http://localhost:3000/attendance';
  private sessionsApi = 'http://localhost:3000/sessions';
  private studentsApi = 'http://localhost:3000/students';
  private offeringsApi = 'http://localhost:3000/classOfferings';
  private subjectsApi = 'http://localhost:3000/subjects';
  private sectionsApi = 'http://localhost:3000/sections';
  private teachersApi = 'http://localhost:3000/teachers';

  getAttendanceSummary(): Observable<AttendanceSummaryReportModel[]> {
    return forkJoin({
      records: this.http.get<AttendanceRecordModel[]>(this.recordsApi),
      sessions: this.http.get<AttendanceSessionModel[]>(this.sessionsApi),
      offerings: this.http.get<ClassOffering[]>(this.offeringsApi),
      students: this.http.get<Student[]>(this.studentsApi),
      subjects: this.http.get<any[]>(this.subjectsApi),
      sections: this.http.get<any[]>(this.sectionsApi),
      teachers: this.http.get<any[]>(this.teachersApi),
    }).pipe(
      map(({ records, sessions, offerings, students, subjects, sections, teachers }) => {
        const summaryMap: Record<string, any> = {};

        records.forEach((record) => {
          const session = sessions.find((s) => s.id === record.sessionId);
          if (!session) return;

          const offering = offerings.find((o) => o.id === session.offeringId);
          if (!offering) return;

          const subject = subjects.find((s) => s.id === offering.subjectId);
          const section = sections.find((s) => s.id === offering.sectionId);
          const teacher = teachers.find((t) => t.id === offering.teacherId);

          const subjectName = subject?.subjectName ?? 'Unknown Subject';
          const sectionName = section?.sectionName ?? 'Unknown Section';
          const teacherName = teacher
            ? `${teacher.firstName} ${teacher.lastName}`
            : 'Unknown Teacher';

          const studentsInSection = students.filter(
            (student) => student.sectionId === offering.sectionId,
          );

          const key = `${offering.subjectId}-${offering.sectionId}`;

          if (!summaryMap[key]) {
            summaryMap[key] = {
              subject: subjectName,
              section: sectionName,
              teacher: teacherName,
              totalStudents: studentsInSection.length,
              totalSessionsSet: new Set<string>(),
              present: 0,
              absent: 0,
              late: 0,
              excused: 0,
            };
          }

          summaryMap[key].totalSessionsSet.add(session.id!);

          if (record.status === 'Present') summaryMap[key].present++;
          else if (record.status === 'Absent') summaryMap[key].absent++;
          else if (record.status === 'Late') summaryMap[key].late++;
          else if (record.status === 'Excused') summaryMap[key].excused++;
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
      sections: this.http.get<any[]>(this.sectionsApi),
    }).pipe(
      map(({ records, students, sections }) => {
        const riskMap: Record<string, any> = {};

        records.forEach((record) => {
          if (!riskMap[record.studentId]) {
            const student = students.find((s) => s.id === record.studentId);
            const section = sections.find((sec) => sec.id === student?.sectionId);

            riskMap[record.studentId] = {
              studentId: record.studentId,
              studentName: student ? `${student.firstName} ${student.lastName}`.trim() : 'Unknown',
              studentNo: student?.studentNumber ?? '',
              section: section?.sectionName ?? '',
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
