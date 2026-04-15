import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, map } from 'rxjs';

import { AttendanceRecord } from '../models/attendance-record.model';
import { AttendanceSession } from '../models/attendance-session.model';
import { Student } from '../models/student.model';
import { ClassOffering } from '../models/class-offering.model';
import { AttendanceSummaryReportModel, StudentAttendanceRiskModel } from '../models/report.model';

interface SubjectLike {
  id?: string;
  subjectName?: string;
  name?: string;
  code?: string;
}

interface SectionLike {
  id?: string;
  sectionName?: string;
  name?: string;
}

interface TeacherLike {
  id?: string;
  firstName?: string;
  lastName?: string;
}

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
      records: this.http.get<AttendanceRecord[]>(this.recordsApi),
      sessions: this.http.get<AttendanceSession[]>(this.sessionsApi),
      offerings: this.http.get<ClassOffering[]>(this.offeringsApi),
      students: this.http.get<Student[]>(this.studentsApi),
      subjects: this.http.get<SubjectLike[]>(this.subjectsApi),
      sections: this.http.get<SectionLike[]>(this.sectionsApi),
      teachers: this.http.get<TeacherLike[]>(this.teachersApi),
    }).pipe(
      map(({ records, sessions, offerings, students, subjects, sections, teachers }) => {
        const summaryMap: Record<
          string,
          {
            subject: string;
            section: string;
            teacher: string;
            totalStudents: number;
            totalSessionsSet: Set<string>;
            present: number;
            absent: number;
            late: number;
            excused: number;
          }
        > = {};

        records.forEach((record) => {
          const session = sessions.find((s) => s.id === record.sessionId);
          if (!session) return;

          const offering = offerings.find((o) => o.id === session.classOfferingId);
          if (!offering) return;

          const subject = subjects.find((s) => s.id === offering.subjectId);
          const section = sections.find((s) => s.id === offering.sectionId);
          const teacher = teachers.find((t) => t.id === offering.teacherId);

          const subjectName =
            subject?.subjectName?.trim() ||
            subject?.name?.trim() ||
            subject?.code?.trim() ||
            'Unknown Subject';

          const sectionName =
            section?.sectionName?.trim() || section?.name?.trim() || 'Unknown Section';

          const teacherName =
            teacher && (teacher.firstName || teacher.lastName)
              ? `${teacher.firstName ?? ''} ${teacher.lastName ?? ''}`.trim()
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

          if (session.id) {
            summaryMap[key].totalSessionsSet.add(session.id);
          }

          switch (record.status) {
            case 'present':
              summaryMap[key].present++;
              break;
            case 'absent':
              summaryMap[key].absent++;
              break;
            case 'late':
              summaryMap[key].late++;
              break;
            case 'excused':
              summaryMap[key].excused++;
              break;
          }
        });

        return Object.values(summaryMap).map((item) => {
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
      records: this.http.get<AttendanceRecord[]>(this.recordsApi),
      students: this.http.get<Student[]>(this.studentsApi),
      sections: this.http.get<SectionLike[]>(this.sectionsApi),
    }).pipe(
      map(({ records, students, sections }) => {
        const riskMap: Record<
          string,
          {
            studentId: string;
            studentName: string;
            studentNo: string;
            section: string;
            absences: number;
            lates: number;
            total: number;
          }
        > = {};

        records.forEach((record) => {
          if (!riskMap[record.studentId]) {
            const student = students.find((s) => s.id === record.studentId);
            const section = sections.find((sec) => sec.id === student?.sectionId);

            riskMap[record.studentId] = {
              studentId: record.studentId,
              studentName: student ? `${student.firstName} ${student.lastName}`.trim() : 'Unknown',
              studentNo: student?.studentNumber ?? '',
              section: section?.sectionName?.trim() || section?.name?.trim() || '',
              absences: 0,
              lates: 0,
              total: 0,
            };
          }

          riskMap[record.studentId].total++;

          if (record.status === 'absent') {
            riskMap[record.studentId].absences++;
          } else if (record.status === 'late') {
            riskMap[record.studentId].lates++;
          }
        });

        return Object.values(riskMap)
          .map((item) => ({
            studentId: item.studentId,
            studentName: item.studentName,
            studentNo: item.studentNo,
            section: item.section,
            absences: item.absences,
            lates: item.lates,
            attendanceRate: item.total
              ? Math.round(((item.total - item.absences) / item.total) * 100)
              : 0,
          }))
          .sort((a, b) => {
            if (a.attendanceRate !== b.attendanceRate) {
              return a.attendanceRate - b.attendanceRate;
            }
            if (a.absences !== b.absences) {
              return b.absences - a.absences;
            }
            return a.studentName.localeCompare(b.studentName);
          });
      }),
    );
  }
}
