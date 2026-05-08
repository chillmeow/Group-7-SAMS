import { Injectable } from '@angular/core';
import { collection, getDocs } from 'firebase/firestore';
import { Observable, from, map } from 'rxjs';

import { db } from '../firebase.config';
import { AttendanceRecord } from '../models/attendance-record.model';
import { AttendanceSession } from '../models/attendance-session.model';
import { Student } from '../models/student.model';
import { ClassOffering } from '../models/class-offering.model';
import { AttendanceSummaryReportModel, StudentAttendanceRiskModel } from '../models/report.model';

interface SubjectLike {
  id?: string;
  subjectCode?: string;
  subjectName?: string;
  name?: string;
  code?: string;
  status?: string;
  isArchived?: boolean;
}

interface SectionLike {
  id?: string;
  sectionCode?: string;
  sectionName?: string;
  name?: string;
  status?: string;
  isArchived?: boolean;
}

interface TeacherLike {
  id?: string;
  firstName?: string;
  lastName?: string;
  status?: string;
  isArchived?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ReportService {
  getAttendanceSummary(): Observable<AttendanceSummaryReportModel[]> {
    return from(this.buildAttendanceSummary());
  }

  getStudentRiskReport(): Observable<StudentAttendanceRiskModel[]> {
    return from(this.buildStudentRiskReport());
  }

  private async buildAttendanceSummary(): Promise<AttendanceSummaryReportModel[]> {
    const [records, sessions, offerings, students, subjects, sections, teachers] =
      await Promise.all([
        this.getCollectionData<AttendanceRecord>('attendance'),
        this.getCollectionData<AttendanceSession>('sessions'),
        this.getCollectionData<ClassOffering>('classOfferings'),
        this.getCollectionData<Student>('students'),
        this.getCollectionData<SubjectLike>('subjects'),
        this.getCollectionData<SectionLike>('sections'),
        this.getCollectionData<TeacherLike>('teachers'),
      ]);

    const activeRecords = records.filter((record) => record.isValid !== false);
    const activeStudents = students.filter((student) => !this.isArchivedOrInactive(student));
    const activeOfferings = offerings.filter((offering) => !this.isArchivedOrInactive(offering));

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

    activeRecords.forEach((record) => {
      const session = sessions.find((s) => s.id === record.sessionId);
      if (!session) return;

      const offering = activeOfferings.find((o) => o.id === session.classOfferingId);
      if (!offering) return;

      const subject = subjects.find((s) => s.id === offering.subjectId);
      const section = sections.find((s) => s.id === offering.sectionId);
      const teacher = teachers.find((t) => t.id === offering.teacherId);

      const subjectName =
        offering.subjectName?.trim() ||
        subject?.subjectName?.trim() ||
        subject?.name?.trim() ||
        subject?.subjectCode?.trim() ||
        subject?.code?.trim() ||
        'Unknown Subject';

      const sectionName =
        offering.sectionName?.trim() ||
        section?.sectionName?.trim() ||
        section?.name?.trim() ||
        'Unknown Section';

      const teacherName =
        offering.teacherName?.trim() ||
        (teacher && (teacher.firstName || teacher.lastName)
          ? `${teacher.firstName ?? ''} ${teacher.lastName ?? ''}`.trim()
          : 'Unknown Teacher');

      const studentsInSection = activeStudents.filter((student) =>
        this.studentMatchesOfferingSection(student, offering),
      );

      const key = `${offering.subjectId}-${offering.sectionId}-${offering.schoolYear}-${offering.semester}`;

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

    return Object.values(summaryMap)
      .map((item) => {
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
      })
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }

  private async buildStudentRiskReport(): Promise<StudentAttendanceRiskModel[]> {
    const [records, students, offerings, sessions, sections] = await Promise.all([
      this.getCollectionData<AttendanceRecord>('attendance'),
      this.getCollectionData<Student>('students'),
      this.getCollectionData<ClassOffering>('classOfferings'),
      this.getCollectionData<AttendanceSession>('sessions'),
      this.getCollectionData<SectionLike>('sections'),
    ]);

    const activeRecords = records.filter((record) => record.isValid !== false);
    const activeStudents = students.filter((student) => !this.isArchivedOrInactive(student));

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

    activeRecords.forEach((record) => {
      const student = activeStudents.find((s) => s.id === record.studentId);

      if (!student) return;

      if (!riskMap[record.studentId]) {
        const section = sections.find((sec) => {
          const studentSection = this.normalizeText(student.sectionId);
          const sectionId = this.normalizeText(sec.id);
          const sectionName = this.normalizeText(sec.sectionName);
          const sectionCode = this.normalizeText(sec.sectionCode);

          return (
            studentSection === sectionId ||
            studentSection === sectionName ||
            studentSection === sectionCode ||
            sectionName.endsWith(studentSection)
          );
        });

        riskMap[record.studentId] = {
          studentId: record.studentId,
          studentName: `${student.firstName} ${student.lastName}`.trim(),
          studentNo: student.studentNumber ?? '',
          section: section?.sectionName?.trim() || student.sectionId || '',
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
  }

  private async getCollectionData<T extends { id?: string }>(collectionName: string): Promise<T[]> {
    const snapshot = await getDocs(collection(db, collectionName));

    return snapshot.docs.map(
      (docSnap) =>
        ({
          id: docSnap.id,
          ...docSnap.data(),
        }) as T,
    );
  }

  private studentMatchesOfferingSection(student: Student, offering: ClassOffering): boolean {
    const studentSectionId = this.normalizeText((student as any).sectionId);
    const studentSectionName = this.normalizeText((student as any).sectionName);
    const studentSection = this.normalizeText((student as any).section);

    const offeringSectionId = this.normalizeText((offering as any).sectionId);
    const offeringSectionName = this.normalizeText((offering as any).sectionName);
    const offeringSection = this.normalizeText((offering as any).section);

    const studentValues = [studentSectionId, studentSectionName, studentSection].filter(Boolean);
    const offeringValues = [offeringSectionId, offeringSectionName, offeringSection].filter(
      Boolean,
    );

    for (const studentValue of studentValues) {
      for (const offeringValue of offeringValues) {
        if (studentValue === offeringValue) return true;
        if (offeringValue.endsWith(studentValue)) return true;
        if (studentValue.endsWith(offeringValue)) return true;
      }
    }

    return false;
  }

  private isArchivedOrInactive(value: { status?: string; isArchived?: boolean }): boolean {
    const status = this.normalizeText(value.status);

    return value.isArchived === true || status === 'archived' || status === 'inactive';
  }

  private normalizeText(value: unknown): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }
}
