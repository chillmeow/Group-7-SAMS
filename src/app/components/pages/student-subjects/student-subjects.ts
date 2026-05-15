import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { collection, getDocs } from 'firebase/firestore';
import { firstValueFrom } from 'rxjs';

import { db } from '../../../firebase.config';
import { AuthService } from '../../../services/auth.service';
import { ClassOfferingService } from '../../../services/class-offering.service';
import { ClassOffering, ClassSchedule } from '../../../models/class-offering.model';

interface StudentRecord {
  id: string;
  userId?: string;
  uid?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  studentNumber?: string;
  sectionId?: string;
  sectionName?: string;
  section?: string;
  yearLevel?: string;
  status?: string;
  isArchived?: boolean;
}

interface SubjectRecord {
  id: string;
  code?: string;
  subjectCode?: string;
  name?: string;
  subjectName?: string;
  title?: string;
  units?: number | string;
  lectureUnits?: number | string;
  labUnits?: number | string;
}

interface TeacherRecord {
  id: string;
  userId?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
}

@Component({
  selector: 'app-student-subjects',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './student-subjects.html',
  styleUrl: './student-subjects.scss',
})
export class StudentSubjectsComponent implements OnInit {
  loading = true;
  errorMessage = '';

  searchTerm = '';
  selectedSemester = 'all';
  selectedSchoolYear = 'all';

  studentUid = '';
  studentDocId = '';
  studentName = '';
  studentEmail = '';
  studentNumber = '';
  studentSectionId = '';
  studentSectionName = '';
  studentYearLevel = '';

  studentOfferings: ClassOffering[] = [];

  semesters: string[] = [];
  schoolYears: string[] = [];

  private students: StudentRecord[] = [];
  private subjects: SubjectRecord[] = [];
  private teachers: TeacherRecord[] = [];
  private currentStudent: StudentRecord | null = null;

  constructor(
    private authService: AuthService,
    private classOfferingService: ClassOfferingService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadStudentSubjects();
  }

  get filteredOfferings(): ClassOffering[] {
    const term = this.normalizeText(this.searchTerm);

    return this.studentOfferings.filter((offering) => {
      const searchableText = this.normalizeText(
        [
          offering.subjectCode,
          offering.subjectName,
          offering.teacherName,
          offering.sectionName,
          offering.semester,
          offering.schoolYear,
          this.getOfferingUnits(offering),
          this.getSchedulePreview(offering.schedules || []),
        ].join(' '),
      );

      const matchesSearch = !term || searchableText.includes(term);

      const matchesSemester =
        this.selectedSemester === 'all' ||
        this.normalizeText(offering.semester) === this.normalizeText(this.selectedSemester);

      const matchesSchoolYear =
        this.selectedSchoolYear === 'all' ||
        this.normalizeText(offering.schoolYear) === this.normalizeText(this.selectedSchoolYear);

      return matchesSearch && matchesSemester && matchesSchoolYear;
    });
  }

  get totalSubjects(): number {
    return this.studentOfferings.length;
  }

  get totalTeachers(): number {
    return new Set(
      this.studentOfferings
        .map((offering) => this.normalizeText(offering.teacherName))
        .filter(Boolean),
    ).size;
  }

  get totalSchedules(): number {
    return this.studentOfferings.reduce(
      (total, offering) => total + (offering.schedules?.length || 0),
      0,
    );
  }

  get activeSubjects(): number {
    return this.studentOfferings.filter(
      (offering) => this.normalizeText(offering.status || 'active') === 'active',
    ).length;
  }

  async loadStudentSubjects(): Promise<void> {
    try {
      this.loading = true;
      this.errorMessage = '';
      this.cdr.detectChanges();

      const currentUser = this.authService.getCurrentUser() as any;

      if (!currentUser) {
        this.errorMessage = 'Unable to load your subjects. Please log in again.';
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      this.studentUid = String(
        currentUser.uid || currentUser.userId || currentUser.id || '',
      ).trim();
      this.studentEmail = String(currentUser.email || '').trim();

      const [studentSnapshot, subjectSnapshot, teacherSnapshot, offerings] = await Promise.all([
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'subjects')),
        getDocs(collection(db, 'teachers')),
        firstValueFrom(this.classOfferingService.getClassOfferings()),
      ]);

      this.students = studentSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<StudentRecord, 'id'>),
      }));

      this.subjects = subjectSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<SubjectRecord, 'id'>),
      }));

      this.teachers = teacherSnapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<TeacherRecord, 'id'>),
      }));

      this.currentStudent = this.resolveStudentProfile(currentUser);

      if (!this.currentStudent) {
        this.errorMessage =
          'Your login account is not linked to a student record. Please ask the admin to check your student account link.';
        this.studentOfferings = [];
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      this.setStudentProfile(this.currentStudent);

      if (!this.hasStudentSectionInfo(this.currentStudent)) {
        this.errorMessage =
          'Your student account is not linked to a section yet. Please contact the administrator.';
        this.studentOfferings = [];
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      this.studentOfferings = (offerings || [])
        .filter((offering) => this.shouldDisplayOfferingForStudent(offering, this.currentStudent!))
        .map((offering) => this.enrichOffering(offering))
        .sort((a, b) => {
          const subjectCompare = String(a.subjectCode || '').localeCompare(
            String(b.subjectCode || ''),
          );

          if (subjectCompare !== 0) return subjectCompare;

          return String(a.teacherName || '').localeCompare(String(b.teacherName || ''));
        });

      this.semesters = this.getUniqueValues(this.studentOfferings.map((item) => item.semester));
      this.schoolYears = this.getUniqueValues(this.studentOfferings.map((item) => item.schoolYear));

      this.loading = false;
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Failed to initialize student subjects:', error);
      this.errorMessage = 'Something went wrong while loading your subjects.';
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  resetFilters(): void {
    this.searchTerm = '';
    this.selectedSemester = 'all';
    this.selectedSchoolYear = 'all';
  }

  trackOffering(index: number, offering: ClassOffering): string {
    return offering.id || `${offering.subjectCode}-${offering.sectionName}-${index}`;
  }

  formatSchedule(schedule: ClassSchedule): string {
    const type = schedule.type ? `${schedule.type}: ` : '';
    const day = schedule.day || 'No day';
    const startTime = this.formatTime(schedule.startTime);
    const endTime = this.formatTime(schedule.endTime);
    const time = startTime && endTime ? `${startTime} - ${endTime}` : '';
    const room = schedule.room ? ` • ${schedule.room}` : '';

    return `${type}${day}${time ? ` • ${time}` : ''}${room}`;
  }

  getSchedulePreview(schedules: ClassSchedule[]): string {
    if (!schedules || schedules.length === 0) {
      return 'No schedule added';
    }

    return schedules.map((schedule) => this.formatSchedule(schedule)).join(' | ');
  }

  getOfferingUnits(offering: ClassOffering): string {
    const offeringAny = offering as any;

    const directUnits = offeringAny.units;
    const lectureUnits = offeringAny.lectureUnits;
    const labUnits = offeringAny.labUnits;

    if (directUnits !== undefined && directUnits !== null && String(directUnits).trim() !== '') {
      return String(directUnits);
    }

    if (
      lectureUnits !== undefined &&
      lectureUnits !== null &&
      labUnits !== undefined &&
      labUnits !== null
    ) {
      const lecture = Number(lectureUnits) || 0;
      const lab = Number(labUnits) || 0;
      const total = lecture + lab;

      return total > 0 ? String(total) : '—';
    }

    const subject = this.findSubjectForOffering(offering);

    if (subject?.units !== undefined && subject.units !== null && String(subject.units).trim()) {
      return String(subject.units);
    }

    if (subject?.lectureUnits !== undefined && subject?.labUnits !== undefined) {
      const lecture = Number(subject.lectureUnits) || 0;
      const lab = Number(subject.labUnits) || 0;
      const total = lecture + lab;

      return total > 0 ? String(total) : '—';
    }

    return '—';
  }

  private resolveStudentProfile(currentUser: any): StudentRecord | null {
    const possibleUserIds = [
      currentUser?.uid,
      currentUser?.userId,
      currentUser?.id,
      currentUser?.profileId,
    ]
      .map((value) => this.normalizeText(value))
      .filter(Boolean);

    const currentEmail = this.normalizeText(currentUser?.email);
    const currentStudentNumber = this.normalizeText(currentUser?.studentNumber);

    return (
      this.students.find((student) =>
        possibleUserIds.some((userId) => this.normalizeText(student.userId) === userId),
      ) ||
      this.students.find((student) =>
        possibleUserIds.some((userId) => this.normalizeText(student.uid) === userId),
      ) ||
      this.students.find((student) =>
        possibleUserIds.some((userId) => this.normalizeText(student.id) === userId),
      ) ||
      this.students.find(
        (student) => !!currentEmail && this.normalizeText(student.email) === currentEmail,
      ) ||
      this.students.find(
        (student) =>
          !!currentStudentNumber &&
          this.normalizeText(student.studentNumber) === currentStudentNumber,
      ) ||
      null
    );
  }

  private setStudentProfile(student: StudentRecord): void {
    this.studentDocId = student.id;
    this.studentName = this.buildStudentName(student);
    this.studentEmail = student.email || this.studentEmail;
    this.studentNumber = student.studentNumber || '';
    this.studentSectionId = String(student.sectionId || '').trim();
    this.studentSectionName = String(student.sectionName || student.section || '').trim();
    this.studentYearLevel = student.yearLevel || '';
  }

  private hasStudentSectionInfo(student: StudentRecord): boolean {
    return Boolean(
      String(student.sectionId || '').trim() ||
      String(student.sectionName || '').trim() ||
      String(student.section || '').trim(),
    );
  }

  private shouldDisplayOfferingForStudent(
    offering: ClassOffering,
    student: StudentRecord,
  ): boolean {
    const offeringAny = offering as any;
    const status = this.normalizeText(offering.status || 'active');

    if (status === 'inactive' || status === 'archived') {
      return false;
    }

    if (offeringAny.isArchived || offeringAny.archivedAt) {
      return false;
    }

    if (this.studentIsDirectlyEnrolledInOffering(offering, student)) {
      return true;
    }

    return this.studentSectionMatchesOffering(offering, student);
  }

  private studentIsDirectlyEnrolledInOffering(
    offering: ClassOffering,
    student: StudentRecord,
  ): boolean {
    const offeringAny = offering as any;

    const possibleStudentValues = [
      student.id,
      student.userId,
      student.uid,
      student.studentNumber,
      this.studentUid,
    ]
      .map((value) => this.normalizeComparableText(value))
      .filter(Boolean);

    const enrollmentArrays = [
      offeringAny.studentIds,
      offeringAny.enrolledStudentIds,
      offeringAny.enrolledStudents,
      offeringAny.studentDocIds,
    ].filter(Array.isArray) as unknown[][];

    return enrollmentArrays.some((items) =>
      items.some((item) =>
        possibleStudentValues.includes(
          this.normalizeComparableText(this.extractEnrollmentValue(item)),
        ),
      ),
    );
  }

  private extractEnrollmentValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (value && typeof value === 'object') {
      const item = value as Record<string, unknown>;

      return String(
        item['id'] ||
          item['studentId'] ||
          item['studentDocId'] ||
          item['studentNumber'] ||
          item['userId'] ||
          '',
      );
    }

    return '';
  }

  private studentSectionMatchesOffering(offering: ClassOffering, student: StudentRecord): boolean {
    const offeringAny = offering as any;

    const studentSectionValues = [
      student.sectionId,
      student.sectionName,
      student.section,
      this.studentSectionId,
      this.studentSectionName,
    ]
      .map((value) => this.normalizeComparableText(value))
      .filter(Boolean);

    const offeringSectionValues = [
      offering.sectionId,
      offering.sectionName,
      offeringAny.section,
      offeringAny.sectionCode,
      offeringAny.sectionTitle,
    ]
      .map((value) => this.normalizeComparableText(value))
      .filter(Boolean);

    if (studentSectionValues.length === 0 || offeringSectionValues.length === 0) {
      return false;
    }

    return studentSectionValues.some((studentValue) =>
      offeringSectionValues.some(
        (offeringValue) =>
          studentValue === offeringValue ||
          studentValue.endsWith(offeringValue) ||
          offeringValue.endsWith(studentValue),
      ),
    );
  }

  private enrichOffering(offering: ClassOffering): ClassOffering {
    const subject = this.findSubjectForOffering(offering);
    const teacherName = this.getTeacherNameForOffering(offering);

    return {
      ...offering,
      subjectCode:
        offering.subjectCode || subject?.subjectCode || subject?.code || 'No subject code',
      subjectName:
        offering.subjectName ||
        subject?.subjectName ||
        subject?.name ||
        subject?.title ||
        'Unnamed Subject',
      teacherName: teacherName || offering.teacherName || 'No teacher assigned',
      sectionName:
        offering.sectionName || this.studentSectionName || this.studentSectionId || 'No section',
      semester: offering.semester || 'No semester',
      schoolYear: offering.schoolYear || 'No school year',
      status: offering.status || 'active',
    } as ClassOffering;
  }

  private findSubjectForOffering(offering: ClassOffering): SubjectRecord | null {
    const offeringAny = offering as any;

    const subjectId = this.normalizeText(offeringAny.subjectId);
    const subjectCode = this.normalizeText(offering.subjectCode);

    return (
      this.subjects.find(
        (subject) => !!subjectId && this.normalizeText(subject.id) === subjectId,
      ) ||
      this.subjects.find(
        (subject) =>
          !!subjectCode &&
          (this.normalizeText(subject.subjectCode) === subjectCode ||
            this.normalizeText(subject.code) === subjectCode),
      ) ||
      null
    );
  }

  private getTeacherNameForOffering(offering: ClassOffering): string {
    const offeringAny = offering as any;
    const existingName = String(offering.teacherName || offeringAny.instructorName || '').trim();

    if (existingName) {
      return existingName;
    }

    const possibleTeacherIds = [
      offering.teacherId,
      offeringAny.instructorId,
      offeringAny.facultyId,
      offeringAny.teacherUserId,
    ]
      .map((value) => this.normalizeText(value))
      .filter(Boolean);

    const teacher = this.teachers.find((item) =>
      possibleTeacherIds.some(
        (teacherId) =>
          this.normalizeText(item.id) === teacherId ||
          this.normalizeText(item.userId) === teacherId ||
          this.normalizeText(item.email) === teacherId,
      ),
    );

    return teacher ? this.buildTeacherName(teacher) : '';
  }

  private buildStudentName(student: StudentRecord): string {
    const fullName = String(student.fullName || '').trim();

    if (fullName) {
      return fullName;
    }

    const name = `${student.firstName || ''} ${student.lastName || ''}`.trim();

    return name || student.email || 'Student';
  }

  private buildTeacherName(teacher: TeacherRecord): string {
    const fullName = String(teacher.fullName || '').trim();

    if (fullName) {
      return fullName;
    }

    const name = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();

    return name || teacher.email || 'Teacher';
  }

  private getUniqueValues(values: Array<string | undefined>): string[] {
    return Array.from(
      new Set(values.map((value) => value || '').filter((value) => value.trim() !== '')),
    ).sort();
  }

  private formatTime(value: string | undefined): string {
    const rawValue = String(value || '').trim();

    if (!rawValue) {
      return '';
    }

    if (/^\d{1,2}:\d{2}$/.test(rawValue)) {
      const [hourRaw, minute] = rawValue.split(':');
      const hour = Number(hourRaw);
      const suffix = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;

      return `${displayHour}:${minute} ${suffix}`;
    }

    return rawValue;
  }

  private normalizeText(value: unknown): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private normalizeComparableText(value: unknown): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }
}
