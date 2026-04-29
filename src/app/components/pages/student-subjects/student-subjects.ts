import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { collection, getDocs, query, where } from 'firebase/firestore';

import { db } from '../../../firebase.config';
import { AuthService } from '../../../services/auth.service';
import { ClassOfferingService } from '../../../services/class-offering.service';
import { ClassOffering, ClassSchedule } from '../../../models/class-offering.model';

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
  studentYearLevel = '';

  studentOfferings: ClassOffering[] = [];

  semesters: string[] = [];
  schoolYears: string[] = [];

  constructor(
    private authService: AuthService,
    private classOfferingService: ClassOfferingService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadStudentSubjects();
  }

  get filteredOfferings(): ClassOffering[] {
    const term = this.searchTerm.trim().toLowerCase();

    return this.studentOfferings.filter((offering) => {
      const matchesSearch =
        !term ||
        offering.subjectCode.toLowerCase().includes(term) ||
        offering.subjectName.toLowerCase().includes(term) ||
        offering.teacherName.toLowerCase().includes(term) ||
        offering.sectionName.toLowerCase().includes(term) ||
        offering.semester.toLowerCase().includes(term) ||
        offering.schoolYear.toLowerCase().includes(term);

      const matchesSemester =
        this.selectedSemester === 'all' || offering.semester === this.selectedSemester;

      const matchesSchoolYear =
        this.selectedSchoolYear === 'all' || offering.schoolYear === this.selectedSchoolYear;

      return matchesSearch && matchesSemester && matchesSchoolYear;
    });
  }

  get totalSubjects(): number {
    return this.studentOfferings.length;
  }

  get totalTeachers(): number {
    return new Set(
      this.studentOfferings
        .map((offering) => offering.teacherName || '')
        .filter((teacherName) => teacherName.trim() !== ''),
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
      (offering) => (offering.status || '').toLowerCase() === 'active',
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

      this.studentUid = currentUser.uid || currentUser.userId || currentUser.id || '';
      this.studentEmail = currentUser.email || '';

      await this.resolveStudentProfile(this.studentUid, this.studentEmail);

      if (!this.studentSectionId) {
        this.errorMessage =
          'Your student account is not linked to a section yet. Please contact the administrator.';
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      this.classOfferingService.getClassOfferings().subscribe({
        next: (offerings) => {
          this.studentOfferings = offerings
            .filter((offering) => {
              const offeringSectionId = String(offering.sectionId || '').trim();
              const status = String(offering.status || '').toLowerCase();

              return (
                offeringSectionId === this.studentSectionId &&
                status !== 'inactive' &&
                status !== 'archived'
              );
            })
            .sort((a, b) => {
              const subjectCompare = a.subjectCode.localeCompare(b.subjectCode);
              if (subjectCompare !== 0) return subjectCompare;

              return a.teacherName.localeCompare(b.teacherName);
            });

          this.semesters = this.getUniqueValues(this.studentOfferings.map((item) => item.semester));
          this.schoolYears = this.getUniqueValues(
            this.studentOfferings.map((item) => item.schoolYear),
          );

          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Failed to load student subjects:', error);
          this.errorMessage = 'Failed to load your enrolled subjects.';
          this.loading = false;
          this.cdr.detectChanges();
        },
      });
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

  private async resolveStudentProfile(uid: string, email: string): Promise<void> {
    this.studentDocId = '';
    this.studentName = '';
    this.studentNumber = '';
    this.studentSectionId = '';
    this.studentYearLevel = '';

    const studentsRef = collection(db, 'students');

    if (uid) {
      const uidQuery = query(studentsRef, where('userId', '==', uid));
      const uidSnapshot = await getDocs(uidQuery);

      if (!uidSnapshot.empty) {
        const studentDoc = uidSnapshot.docs[0];
        const data = studentDoc.data();

        this.setStudentProfile(studentDoc.id, data, email);
        return;
      }
    }

    if (email) {
      const emailQuery = query(studentsRef, where('email', '==', email));
      const emailSnapshot = await getDocs(emailQuery);

      if (!emailSnapshot.empty) {
        const studentDoc = emailSnapshot.docs[0];
        const data = studentDoc.data();

        this.setStudentProfile(studentDoc.id, data, email);
        return;
      }
    }
  }

  private setStudentProfile(studentDocId: string, data: any, fallbackEmail: string): void {
    this.studentDocId = studentDocId;
    this.studentName = this.buildStudentName(data['firstName'], data['lastName']);
    this.studentEmail = data['email'] || fallbackEmail;
    this.studentNumber = data['studentNumber'] || '';
    this.studentSectionId = String(data['sectionId'] || '').trim();
    this.studentYearLevel = data['yearLevel'] || '';
  }

  private buildStudentName(firstName: string, lastName: string): string {
    return `${firstName || ''} ${lastName || ''}`.trim();
  }

  private getUniqueValues(values: string[]): string[] {
    return Array.from(
      new Set(values.map((value) => value || '').filter((value) => value.trim() !== '')),
    ).sort();
  }
}
