import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { collection, getDocs, query, where } from 'firebase/firestore';

import { db } from '../../../firebase.config';
import { AuthService } from '../../../services/auth.service';
import { ClassOfferingService } from '../../../services/class-offering.service';
import { ClassOffering, ClassSchedule } from '../../../models/class-offering.model';

interface TeacherSubjectGroup {
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  totalSections: number;
  totalSchedules: number;
  offerings: ClassOffering[];
}

@Component({
  selector: 'app-teacher-subjects',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './teacher-subjects.html',
  styleUrl: './teacher-subjects.scss',
})
export class TeacherSubjectsComponent implements OnInit {
  loading = true;
  errorMessage = '';

  searchTerm = '';
  selectedSemester = 'all';
  selectedSchoolYear = 'all';

  teacherUid = '';
  teacherDocId = '';
  teacherName = '';
  teacherEmail = '';

  teacherOfferings: ClassOffering[] = [];
  subjectGroups: TeacherSubjectGroup[] = [];

  semesters: string[] = [];
  schoolYears: string[] = [];

  constructor(
    private authService: AuthService,
    private classOfferingService: ClassOfferingService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadTeacherSubjects();
  }

  get filteredSubjectGroups(): TeacherSubjectGroup[] {
    const term = this.searchTerm.trim().toLowerCase();

    return this.subjectGroups
      .map((group) => {
        const filteredOfferings = group.offerings.filter((offering) => {
          const matchesSearch =
            !term ||
            offering.subjectCode.toLowerCase().includes(term) ||
            offering.subjectName.toLowerCase().includes(term) ||
            offering.sectionName.toLowerCase().includes(term) ||
            offering.schoolYear.toLowerCase().includes(term) ||
            offering.semester.toLowerCase().includes(term);

          const matchesSemester =
            this.selectedSemester === 'all' || offering.semester === this.selectedSemester;

          const matchesSchoolYear =
            this.selectedSchoolYear === 'all' || offering.schoolYear === this.selectedSchoolYear;

          return matchesSearch && matchesSemester && matchesSchoolYear;
        });

        return {
          ...group,
          offerings: filteredOfferings,
          totalSections: filteredOfferings.length,
          totalSchedules: filteredOfferings.reduce(
            (total, offering) => total + (offering.schedules?.length || 0),
            0,
          ),
        };
      })
      .filter((group) => group.offerings.length > 0);
  }

  get totalSubjects(): number {
    return this.subjectGroups.length;
  }

  get totalSections(): number {
    return this.teacherOfferings.length;
  }

  get totalSchedules(): number {
    return this.teacherOfferings.reduce(
      (total, offering) => total + (offering.schedules?.length || 0),
      0,
    );
  }

  get activeOfferings(): number {
    return this.teacherOfferings.filter(
      (offering) => (offering.status || '').toLowerCase() === 'active',
    ).length;
  }

  async loadTeacherSubjects(): Promise<void> {
    try {
      this.loading = true;
      this.errorMessage = '';
      this.cdr.detectChanges();

      const currentUser = this.authService.getCurrentUser() as any;

      if (!currentUser) {
        this.errorMessage = 'Unable to load teacher subjects. Please log in again.';
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      this.teacherUid = currentUser.uid || currentUser.userId || currentUser.id || '';
      this.teacherEmail = currentUser.email || '';

      await this.resolveTeacherProfile(this.teacherUid, this.teacherEmail);

      this.classOfferingService.getClassOfferings().subscribe({
        next: (offerings) => {
          this.teacherOfferings = offerings.filter((offering) => {
            const offeringTeacherId = (offering.teacherId || '').trim();
            const offeringTeacherName = (offering.teacherName || '').trim().toLowerCase();
            const teacherName = this.teacherName.trim().toLowerCase();

            return (
              offeringTeacherId === this.teacherDocId ||
              offeringTeacherId === this.teacherUid ||
              (!!teacherName && offeringTeacherName === teacherName)
            );
          });

          this.teacherOfferings.sort((a, b) => {
            const subjectCompare = a.subjectCode.localeCompare(b.subjectCode);
            if (subjectCompare !== 0) return subjectCompare;

            return a.sectionName.localeCompare(b.sectionName);
          });

          this.semesters = this.getUniqueValues(this.teacherOfferings.map((item) => item.semester));
          this.schoolYears = this.getUniqueValues(
            this.teacherOfferings.map((item) => item.schoolYear),
          );

          this.subjectGroups = this.groupOfferingsBySubject(this.teacherOfferings);

          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Failed to load teacher subjects:', error);
          this.errorMessage = 'Failed to load your assigned subjects.';
          this.loading = false;
          this.cdr.detectChanges();
        },
      });
    } catch (error) {
      console.error('Failed to initialize teacher subjects:', error);
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

  trackSubjectGroup(index: number, group: TeacherSubjectGroup): string {
    return group.subjectId || `${group.subjectCode}-${index}`;
  }

  trackOffering(index: number, offering: ClassOffering): string {
    return offering.id || `${offering.subjectCode}-${offering.sectionName}-${index}`;
  }

  formatSchedule(schedule: ClassSchedule): string {
    const type = schedule.type ? `${schedule.type}: ` : '';
    const day = schedule.day || 'No day';
    const time =
      schedule.startTime && schedule.endTime ? `${schedule.startTime} - ${schedule.endTime}` : '';
    const room = schedule.room ? ` • ${schedule.room}` : '';

    return `${type}${day}${time ? ` • ${time}` : ''}${room}`;
  }

  getSchedulePreview(schedules: ClassSchedule[]): string {
    if (!schedules || schedules.length === 0) {
      return 'No schedule added';
    }

    return schedules.map((schedule) => this.formatSchedule(schedule)).join(' | ');
  }

  private async resolveTeacherProfile(uid: string, email: string): Promise<void> {
    this.teacherDocId = '';
    this.teacherName = '';

    const teachersRef = collection(db, 'teachers');

    if (uid) {
      const uidQuery = query(teachersRef, where('userId', '==', uid));
      const uidSnapshot = await getDocs(uidQuery);

      if (!uidSnapshot.empty) {
        const teacherDoc = uidSnapshot.docs[0];
        const data = teacherDoc.data();

        this.teacherDocId = teacherDoc.id;
        this.teacherName = this.buildTeacherName(data['firstName'], data['lastName']);
        this.teacherEmail = data['email'] || email;
        return;
      }
    }

    if (email) {
      const emailQuery = query(teachersRef, where('email', '==', email));
      const emailSnapshot = await getDocs(emailQuery);

      if (!emailSnapshot.empty) {
        const teacherDoc = emailSnapshot.docs[0];
        const data = teacherDoc.data();

        this.teacherDocId = teacherDoc.id;
        this.teacherName = this.buildTeacherName(data['firstName'], data['lastName']);
        this.teacherEmail = data['email'] || email;
        return;
      }
    }

    this.teacherDocId = uid;
  }

  private buildTeacherName(firstName: string, lastName: string): string {
    return `${firstName || ''} ${lastName || ''}`.trim();
  }

  private groupOfferingsBySubject(offerings: ClassOffering[]): TeacherSubjectGroup[] {
    const grouped = new Map<string, TeacherSubjectGroup>();

    offerings.forEach((offering) => {
      const key = offering.subjectId || offering.subjectCode;

      if (!grouped.has(key)) {
        grouped.set(key, {
          subjectId: offering.subjectId,
          subjectCode: offering.subjectCode,
          subjectName: offering.subjectName,
          totalSections: 0,
          totalSchedules: 0,
          offerings: [],
        });
      }

      const group = grouped.get(key);

      if (!group) return;

      group.offerings.push(offering);
      group.totalSections = group.offerings.length;
      group.totalSchedules = group.offerings.reduce(
        (total, item) => total + (item.schedules?.length || 0),
        0,
      );
    });

    return Array.from(grouped.values()).sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
  }

  private getUniqueValues(values: string[]): string[] {
    return Array.from(
      new Set(values.map((value) => value || '').filter((value) => value.trim() !== '')),
    ).sort();
  }
}
