import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs/operators';

import { SectionService } from '../../../services/section.service';
import { TeacherService } from '../../../services/teacher.service';
import { AlertService } from '../../../services/alert.service';
import { Section } from '../../../models/section.model';
import { Teacher } from '../../../models/teacher.model';

type SectionStatusFilter = 'all' | 'active' | 'inactive' | 'archived';

@Component({
  selector: 'app-sections',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sections.html',
  styleUrl: './sections.scss',
})
export class SectionsComponent implements OnInit {
  private readonly sectionService = inject(SectionService);
  private readonly teacherService = inject(TeacherService);
  private readonly alert = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  sections: Section[] = [];
  filteredList: Section[] = [];
  teachers: Teacher[] = [];

  search = '';
  statusFilter: SectionStatusFilter = 'all';

  isLoading = false;
  isSaving = false;

  showModal = false;
  editing = false;

  form: Section = this.createEmptyForm();

  readonly programs = [
    'Information Technology',
    'Technology Communication Management',
    'Electro-Mechanical Technology',
  ];

  readonly yearLevels = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

  readonly semesters = ['1st Semester', '2nd Semester', 'Summer'];

  ngOnInit(): void {
    this.loadInitialData();
  }

  loadInitialData(): void {
    this.loadTeachers();
    this.loadSections();
  }

  loadSections(): void {
    this.isLoading = true;

    this.sectionService
      .getSections()
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.zone.run(() => {
            this.sections = (data || []).map((section) => ({
              ...section,
              status: this.normalizeStatus(section.status),
              capacity: Number(section.capacity || 0),
            }));

            this.applyFilters();
            this.isLoading = false;
            this.cdr.detectChanges();
          });
        },
        error: (error) => {
          console.error('LOAD SECTIONS ERROR:', error);

          this.zone.run(() => {
            this.sections = [];
            this.filteredList = [];
            this.isLoading = false;
            this.cdr.detectChanges();
          });

          this.alert.warning(
            'Unable to load sections',
            'Section records are currently unavailable. Please try again later.',
          );
        },
      });
  }

  loadTeachers(): void {
    this.teacherService
      .getTeachers()
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.zone.run(() => {
            this.teachers = (data || []).filter(
              (teacher) => this.normalizeStatus(teacher.status) === 'active',
            );

            this.cdr.detectChanges();
          });
        },
        error: (error) => {
          console.error('LOAD TEACHERS ERROR:', error);

          this.zone.run(() => {
            this.teachers = [];
            this.cdr.detectChanges();
          });

          this.alert.warning(
            'Unable to load advisers',
            'Teacher records are currently unavailable for adviser assignment.',
          );
        },
      });
  }

  openAdd(): void {
    this.editing = false;
    this.form = this.createEmptyForm();
    this.showModal = true;
    this.cdr.detectChanges();
  }

  openEdit(section: Section): void {
    this.editing = true;

    this.form = {
      id: section.id,
      sectionCode: section.sectionCode || '',
      sectionName: section.sectionName || '',
      program: section.program || '',
      yearLevel: section.yearLevel || '',
      semester: section.semester || '',
      adviserId: section.adviserId || '',
      adviserName: section.adviserName || '',
      schoolYear: section.schoolYear || '',
      capacity: Number(section.capacity || 0),
      status: this.normalizeStatus(section.status) || 'active',
      createdAt: section.createdAt || '',
      updatedAt: section.updatedAt || '',
    };

    this.showModal = true;
    this.cdr.detectChanges();
  }

  closeModal(): void {
    this.zone.run(() => {
      this.showModal = false;
      this.editing = false;
      this.isSaving = false;
      this.form = this.createEmptyForm();
      this.cdr.detectChanges();
    });
  }

  saveSection(): void {
    if (!this.isFormValid()) {
      this.alert.warning('Incomplete record', 'Please complete all required section details.');
      return;
    }

    this.syncSelectedAdviser();

    const payload: Section = {
      ...this.form,
      sectionName: this.form.sectionName.trim().toUpperCase(),
      program: this.form.program.trim(),
      yearLevel: this.form.yearLevel.trim(),
      semester: this.form.semester.trim(),
      adviserId: this.form.adviserId.trim(),
      adviserName: this.form.adviserName.trim(),
      schoolYear: this.form.schoolYear.trim(),
      capacity: Number(this.form.capacity || 0),
      status: this.normalizeStatus(this.form.status),
    };

    this.isSaving = true;
    const isEditing = this.editing;

    const request = isEditing
      ? this.sectionService.updateSection(payload)
      : this.sectionService.addSection(payload);

    request.pipe(take(1)).subscribe({
      next: () => {
        this.zone.run(() => {
          this.closeModal();
          this.loadSections();
        });

        setTimeout(() => {
          this.alert.success(
            isEditing ? 'Section updated' : 'Section added',
            isEditing
              ? 'The section record was updated successfully.'
              : 'The section record was added successfully.',
          );
        }, 150);
      },
      error: (error) => {
        console.error('SAVE SECTION ERROR:', error);

        this.zone.run(() => {
          this.isSaving = false;
          this.cdr.detectChanges();
        });

        this.alert.warning(
          isEditing ? 'Update failed' : 'Create failed',
          error?.message || 'Unable to save the section record right now.',
        );
      },
    });
  }

  archiveSection(section: Section): void {
    this.alert
      .confirm(
        'Archive section?',
        `Move ${this.getSectionDisplayName(section)} to archive? This section can still be restored later.`,
      )
      .then((confirmed) => {
        if (!confirmed) return;
        this.updateSectionStatus(section, 'archived');
      });
  }

  restoreSection(section: Section): void {
    this.alert
      .confirm(
        'Restore section?',
        `Restore ${this.getSectionDisplayName(section)} back to active records?`,
      )
      .then((confirmed) => {
        if (!confirmed) return;
        this.updateSectionStatus(section, 'active');
      });
  }

  toggleSectionStatus(section: Section): void {
    const currentStatus = this.normalizeStatus(section.status);
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const actionLabel = nextStatus === 'active' ? 'activate' : 'deactivate';

    this.alert
      .confirm(
        `${this.capitalize(actionLabel)} section?`,
        `${this.capitalize(actionLabel)} ${this.getSectionDisplayName(section)}?`,
      )
      .then((confirmed) => {
        if (!confirmed) return;
        this.updateSectionStatus(section, nextStatus);
      });
  }

  permanentlyDeleteSection(section: Section): void {
    if (!section.id) {
      this.alert.warning('Delete failed', 'Section ID is missing.');
      return;
    }

    const sectionId = section.id;

    this.alert
      .confirm(
        'Permanently delete section?',
        `This will permanently delete ${this.getSectionDisplayName(section)}. This action cannot be undone.`,
      )
      .then((confirmed) => {
        if (!confirmed) return;

        this.sectionService
          .deleteSection(sectionId)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.zone.run(() => {
                this.sections = this.sections.filter((item) => item.id !== sectionId);
                this.applyFilters();
                this.cdr.detectChanges();
              });

              this.alert.success(
                'Section permanently deleted',
                'The section record was permanently removed from Firebase.',
              );
            },
            error: (error) => {
              console.error('DELETE SECTION ERROR:', error);

              this.alert.warning(
                'Delete failed',
                error?.message || 'Unable to permanently delete this section record right now.',
              );
            },
          });
      });
  }

  private updateSectionStatus(section: Section, status: string): void {
    const updatedSection: Section = {
      ...section,
      status,
    };

    this.sectionService
      .updateSection(updatedSection)
      .pipe(take(1))
      .subscribe({
        next: () => {
          if (status === 'active') {
            this.alert.success('Section restored', 'The section is now active again.');
          } else if (status === 'inactive') {
            this.alert.success('Section deactivated', 'The section has been marked inactive.');
          } else if (status === 'archived') {
            this.alert.success(
              'Section archived',
              'The section was moved to archive successfully.',
            );
          }

          this.loadSections();
        },
        error: (error) => {
          console.error('UPDATE SECTION STATUS ERROR:', error);

          this.alert.warning(
            'Status update failed',
            error?.message || 'Unable to update section status right now.',
          );
        },
      });
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  setStatusFilter(filter: SectionStatusFilter): void {
    this.statusFilter = filter;
    this.applyFilters();
  }

  onAdviserChange(): void {
    this.syncSelectedAdviser();
  }

  private syncSelectedAdviser(): void {
    const selectedTeacher = this.teachers.find((teacher) => teacher.id === this.form.adviserId);
    this.form.adviserName = selectedTeacher ? this.getTeacherFullName(selectedTeacher) : '';
  }

  get totalSections(): number {
    return this.sections.filter((section) => !this.isArchived(section)).length;
  }

  get activeSections(): number {
    return this.sections.filter((section) => this.normalizeStatus(section.status) === 'active')
      .length;
  }

  get inactiveSections(): number {
    return this.sections.filter((section) => this.normalizeStatus(section.status) === 'inactive')
      .length;
  }

  get assignedAdviserSections(): number {
    return this.sections.filter(
      (section) => !this.isArchived(section) && !!section.adviserId?.trim(),
    ).length;
  }

  get totalCapacity(): number {
    return this.sections
      .filter((section) => !this.isArchived(section))
      .reduce((total, section) => total + Number(section.capacity || 0), 0);
  }

  get recordCountLabel(): string {
    return `${this.filteredList.length} section record(s)`;
  }

  getModalTitle(): string {
    return this.editing ? 'Edit Section' : 'Add Section';
  }

  getModalDescription(): string {
    return this.editing
      ? 'Update the section details used for student grouping and attendance monitoring.'
      : 'Create a section grouping for students under a program, year level, semester, and school year.';
  }

  getTeacherFullName(teacher: Teacher): string {
    return `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
  }

  getTeacherLabel(teacher: Teacher): string {
    const name = this.getTeacherFullName(teacher);
    const employeeNo = teacher.employeeNo || 'No ID';

    return `${name} - ${employeeNo}`;
  }

  getSectionDisplayName(section: Section): string {
    return `${this.getProgramCode(section.program)} ${this.getYearNumber(section.yearLevel)}${section.sectionName}`;
  }

  getStatusLabel(status: string | undefined): string {
    const normalized = this.normalizeStatus(status);

    if (normalized === 'active') return 'Active';
    if (normalized === 'inactive') return 'Inactive';
    if (normalized === 'archived') return 'Archived';

    return 'Unknown';
  }

  getActionLabel(status: string | undefined): string {
    return this.normalizeStatus(status) === 'active' ? 'Deactivate' : 'Activate';
  }

  getActionClass(status: string | undefined): string {
    return this.normalizeStatus(status) === 'active' ? 'deactivate' : 'activate';
  }

  isArchived(section: Section): boolean {
    return this.normalizeStatus(section.status) === 'archived';
  }

  isArchiveView(): boolean {
    return this.statusFilter === 'archived';
  }

  trackBySection(index: number, section: Section): string | number {
    return section.id || section.sectionCode || index;
  }

  private applyFilters(): void {
    const keyword = this.search.trim().toLowerCase();

    this.filteredList = this.sections.filter((section) => {
      const sectionCode = (section.sectionCode || '').toLowerCase();
      const sectionName = (section.sectionName || '').toLowerCase();
      const displayName = this.getSectionDisplayName(section).toLowerCase();
      const program = (section.program || '').toLowerCase();
      const yearLevel = (section.yearLevel || '').toLowerCase();
      const semester = (section.semester || '').toLowerCase();
      const adviserName = (section.adviserName || '').toLowerCase();
      const schoolYear = (section.schoolYear || '').toLowerCase();
      const status = this.normalizeStatus(section.status);

      const matchesSearch =
        !keyword ||
        sectionCode.includes(keyword) ||
        sectionName.includes(keyword) ||
        displayName.includes(keyword) ||
        program.includes(keyword) ||
        yearLevel.includes(keyword) ||
        semester.includes(keyword) ||
        adviserName.includes(keyword) ||
        schoolYear.includes(keyword) ||
        status.includes(keyword);

      const matchesStatus =
        this.statusFilter === 'all' ? status !== 'archived' : status === this.statusFilter;

      return matchesSearch && matchesStatus;
    });
  }

  private isFormValid(): boolean {
    return Boolean(
      this.form.sectionName?.trim() &&
      this.form.program?.trim() &&
      this.form.yearLevel?.trim() &&
      this.form.semester?.trim() &&
      this.form.schoolYear?.trim() &&
      Number(this.form.capacity || 0) > 0,
    );
  }

  private normalizeStatus(status: string | undefined): string {
    return (status || 'active').trim().toLowerCase();
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private getProgramCode(program: string): string {
    const normalized = program.trim().toLowerCase();

    if (normalized.includes('information technology')) return 'IT';
    if (normalized.includes('technology communication management')) return 'TCM';
    if (normalized.includes('electro-mechanical technology')) return 'EMT';

    return program
      .split(/\s+/)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase();
  }

  private getYearNumber(yearLevel: string): string {
    if (yearLevel.includes('1')) return '1';
    if (yearLevel.includes('2')) return '2';
    if (yearLevel.includes('3')) return '3';
    if (yearLevel.includes('4')) return '4';

    return '';
  }

  private createEmptyForm(): Section {
    return {
      sectionCode: '',
      sectionName: '',
      program: '',
      yearLevel: '',
      semester: '',
      adviserId: '',
      adviserName: '',
      schoolYear: '',
      capacity: 40,
      status: 'active',
    };
  }
}
