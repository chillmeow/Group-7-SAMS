import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError, take } from 'rxjs/operators';

import { SectionService } from '../../../../services/section.service';
import { TeacherService } from '../../../../services/teacher.service';
import { AlertService } from '../../../../services/alert.service';
import { Section } from '../../../../models/section.model';
import { Teacher } from '../../../../models/teacher.model';

type SectionStatusFilter = 'all' | 'active' | 'inactive' | 'archived';
type SectionViewMode = 'cards' | 'table';
type SummaryTone = 'blue' | 'green' | 'orange' | 'purple';

interface SectionSummaryCard {
  label: string;
  value: number;
  icon: string;
  tone: SummaryTone;
}

@Component({
  selector: 'app-manage-sections',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manage-sections.html',
  styleUrl: './manage-sections.scss',
})
export class ManageSections implements OnInit {
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
  viewMode: SectionViewMode = 'cards';

  isLoading = false;
  isSaving = false;

  showModal = false;
  editing = false;

  form: Section = this.createEmptyForm();

  readonly programOptions: string[] = [
    'Information Technology',
    'Technology Communication Management',
    'Electro-Mechanical Technology',
  ];

  readonly yearLevelOptions: string[] = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
  readonly semesterOptions: string[] = ['1st Semester', '2nd Semester', 'Summer'];

  ngOnInit(): void {
    this.loadInitialData();
  }

  get summaryCards(): SectionSummaryCard[] {
    return [
      {
        label: 'Total Sections',
        value: this.totalSections,
        icon: 'pi pi-sitemap',
        tone: 'blue',
      },
      {
        label: 'Active Sections',
        value: this.activeSections,
        icon: 'pi pi-check-circle',
        tone: 'green',
      },
      {
        label: 'Assigned Faculty',
        value: this.assignedFacultySections,
        icon: 'pi pi-user',
        tone: 'purple',
      },
      {
        label: 'Total Capacity',
        value: this.totalCapacity,
        icon: 'pi pi-users',
        tone: 'orange',
      },
    ];
  }

  get totalSections(): number {
    return this.sections.filter((section) => !this.isArchived(section)).length;
  }

  get activeSections(): number {
    return this.sections.filter((section) => this.getSectionStatusValue(section) === 'active')
      .length;
  }

  get inactiveSections(): number {
    return this.sections.filter((section) => this.getSectionStatusValue(section) === 'inactive')
      .length;
  }

  get archivedSections(): number {
    return this.sections.filter((section) => this.getSectionStatusValue(section) === 'archived')
      .length;
  }

  get assignedFacultySections(): number {
    return this.sections.filter((section) => {
      const facultyId = this.normalizeText(section.adviserId);
      const facultyName = this.normalizeText(section.adviserName);

      return !this.isArchived(section) && Boolean(facultyId || facultyName);
    }).length;
  }

  get totalCapacity(): number {
    return this.sections
      .filter((section) => !this.isArchived(section))
      .reduce((total, section) => total + Number(section.capacity || 0), 0);
  }

  get recordCountLabel(): string {
    return `${this.filteredList.length} section record(s)`;
  }

  loadInitialData(): void {
    this.isLoading = true;

    forkJoin({
      sections: this.sectionService.getSections().pipe(take(1)),
      teachers: this.teacherService.getTeachers().pipe(
        take(1),
        catchError(() => of([] as Teacher[])),
      ),
    }).subscribe({
      next: ({ sections, teachers }) => {
        this.zone.run(() => {
          this.sections = (sections ?? []).map((section) => ({
            ...section,
            status: this.getSectionStatusValue(section),
            capacity: Number(section.capacity || 0),
          }));

          this.teachers = (teachers ?? []).filter(
            (teacher) =>
              this.normalizeStatus(teacher.status) === 'active' && teacher.isArchived !== true,
          );

          this.applyFilters();
          this.isLoading = false;
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.zone.run(() => {
          this.sections = [];
          this.teachers = [];
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

  loadSections(): void {
    this.loadInitialData();
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
      status:
        this.getSectionStatusValue(section) === 'archived'
          ? 'active'
          : this.getSectionStatusValue(section),
      isArchived: section.isArchived ?? false,
      archivedAt: section.archivedAt ?? '',
      createdAt: section.createdAt ?? '',
      updatedAt: section.updatedAt ?? '',
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
      this.alert.warning(
        'Incomplete record',
        'Please complete all required section details before saving.',
      );
      return;
    }

    this.syncSelectedFaculty();

    const isEditing = this.editing;
    const now = new Date().toISOString();

    const payload: Section = {
      ...this.form,
      sectionName: this.normalizeText(this.form.sectionName).toUpperCase(),
      program: this.normalizeText(this.form.program),
      yearLevel: this.normalizeText(this.form.yearLevel),
      semester: this.normalizeText(this.form.semester),
      adviserId: this.normalizeText(this.form.adviserId),
      adviserName: this.normalizeText(this.form.adviserName),
      schoolYear: this.normalizeText(this.form.schoolYear),
      capacity: Number(this.form.capacity || 0),
      status: this.normalizeStatus(this.form.status) || 'active',
      isArchived: false,
      archivedAt: '',
      createdAt: this.form.createdAt || now,
      updatedAt: now,
    };

    this.isSaving = true;

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

  toggleSectionStatus(section: Section): void {
    const currentStatus = this.getSectionStatusValue(section);
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const actionLabel = nextStatus === 'active' ? 'activate' : 'deactivate';

    this.alert
      .confirm(
        `${this.toTitleCase(actionLabel)} section?`,
        `${this.toTitleCase(actionLabel)} ${this.getSectionDisplayName(section)}?`,
      )
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.updateSectionStatus(section, nextStatus);
      });
  }

  archiveSection(section: Section): void {
    this.alert
      .confirm(
        'Move section to archive?',
        `${this.getSectionDisplayName(section)} will be moved to Archive and can still be restored later.`,
      )
      .then((confirmed) => {
        if (!confirmed || !section.id) {
          return;
        }

        this.sectionService
          .deleteSection(section.id)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.alert.success('Section archived', 'The section record was moved to Archive.');
              this.loadSections();
            },
            error: (error) => {
              this.alert.warning(
                'Archive failed',
                error?.message || 'Unable to archive this section record right now.',
              );
            },
          });
      });
  }

  restoreSection(section: Section): void {
    this.alert
      .confirm(
        'Restore archived section?',
        `${this.getSectionDisplayName(section)} will be restored to the active section directory.`,
      )
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.updateSectionStatus(section, 'active');
      });
  }

  onFacultyChange(): void {
    this.syncSelectedFaculty();
  }

  setViewMode(mode: SectionViewMode): void {
    this.viewMode = mode;
  }

  onSearchChange(value: string): void {
    this.search = value;
    this.applyFilters();
  }

  clearSearch(): void {
    this.search = '';
    this.applyFilters();
  }

  setStatusFilter(filter: SectionStatusFilter): void {
    this.statusFilter = filter;
    this.applyFilters();
  }

  getFilterCount(filter: SectionStatusFilter): number {
    if (filter === 'all') {
      return this.sections.filter((section) => !this.isArchived(section)).length;
    }

    return this.sections.filter((section) => this.getSectionStatusValue(section) === filter).length;
  }

  getModalTitle(): string {
    return this.editing ? 'Edit Section' : 'Add Section';
  }

  getTeacherFullName(teacher: Teacher): string {
    return `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || 'Unnamed Faculty';
  }

  getTeacherLabel(teacher: Teacher): string {
    const name = this.getTeacherFullName(teacher);
    const employeeNo = teacher.employeeNo || 'No ID';

    return `${name} • ${employeeNo}`;
  }

  getSectionDisplayName(section: Section): string {
    const programCode = this.getProgramCode(section.program);
    const yearCode = this.getYearNumber(section.yearLevel);
    const sectionName = section.sectionName || '';

    if (!programCode && !yearCode && !sectionName) {
      return 'Unnamed Section';
    }

    return `${programCode}${yearCode}-${sectionName}`.replace(/^-|-$/g, '');
  }

  getSectionInitial(section: Section): string {
    const programCode = this.getProgramCode(section.program);
    const yearCode = this.getYearNumber(section.yearLevel);

    return `${programCode.charAt(0) || 'S'}${yearCode || ''}`.toUpperCase();
  }

  getProgramCode(program: string | undefined): string {
    const normalized = this.normalizeText(program).toLowerCase();

    if (normalized.includes('information technology')) {
      return 'IT';
    }

    if (normalized.includes('technology communication management')) {
      return 'TCM';
    }

    if (normalized.includes('electro-mechanical technology')) {
      return 'EMT';
    }

    return this.normalizeText(program)
      .split(/\s+/)
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase();
  }

  getYearNumber(yearLevel: string | undefined): string {
    const value = this.normalizeText(yearLevel);

    if (value.includes('1')) {
      return '1';
    }

    if (value.includes('2')) {
      return '2';
    }

    if (value.includes('3')) {
      return '3';
    }

    if (value.includes('4')) {
      return '4';
    }

    return '';
  }

  getFacultyLabel(section: Section): string {
    const facultyName = this.normalizeText(section.adviserName);

    if (facultyName) {
      return facultyName;
    }

    const facultyId = this.normalizeText(section.adviserId);

    if (!facultyId) {
      return 'No faculty assigned';
    }

    const matchedTeacher = this.teachers.find((teacher) => {
      return this.normalizeText(teacher.id) === facultyId;
    });

    if (matchedTeacher) {
      return this.getTeacherFullName(matchedTeacher);
    }

    return 'Faculty record not found';
  }

  getCapacityLabel(section: Section): string {
    const capacity = Number(section.capacity || 0);

    return capacity > 0 ? `${capacity} slots` : 'No capacity set';
  }

  getStatusLabel(status: string | undefined): string {
    const normalized = this.normalizeStatus(status);

    if (normalized === 'active') {
      return 'Active';
    }

    if (normalized === 'inactive') {
      return 'Inactive';
    }

    if (normalized === 'archived') {
      return 'Archived';
    }

    return 'Unknown';
  }

  getSectionStatusLabel(section: Section): string {
    return this.getStatusLabel(this.getSectionStatusValue(section));
  }

  getStatusClass(status: string | undefined): string {
    const normalized = this.normalizeStatus(status);

    if (normalized === 'active') {
      return 'active';
    }

    if (normalized === 'inactive') {
      return 'inactive';
    }

    if (normalized === 'archived') {
      return 'archived';
    }

    return 'neutral';
  }

  getSectionStatusClass(section: Section): string {
    return this.getStatusClass(this.getSectionStatusValue(section));
  }

  getActionLabel(section: Section): string {
    return this.getSectionStatusValue(section) === 'active' ? 'Deactivate' : 'Activate';
  }

  getActionClass(section: Section): string {
    return this.getSectionStatusValue(section) === 'active' ? 'deactivate' : 'activate';
  }

  isArchived(section: Section): boolean {
    return section.isArchived === true || this.normalizeStatus(section.status) === 'archived';
  }

  isArchiveView(): boolean {
    return this.statusFilter === 'archived';
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackBySection(index: number, section: Section): string | number {
    return section.id || section.sectionCode || index;
  }

  private updateSectionStatus(section: Section, status: string): void {
    const now = new Date().toISOString();

    const updatedSection: Section = {
      ...section,
      status,
      isArchived: status === 'archived',
      archivedAt: status === 'archived' ? now : '',
      updatedAt: now,
    };

    this.sectionService
      .updateSection(updatedSection)
      .pipe(take(1))
      .subscribe({
        next: () => {
          if (status === 'active') {
            this.alert.success('Section restored', 'The section is now active.');
          } else if (status === 'inactive') {
            this.alert.success('Section deactivated', 'The section has been marked inactive.');
          } else if (status === 'archived') {
            this.alert.success('Section archived', 'The section was moved to Archive.');
          }

          this.loadSections();
        },
        error: (error) => {
          this.alert.warning(
            'Status update failed',
            error?.message || 'Unable to update section status right now.',
          );
        },
      });
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
      const facultyName = this.getFacultyLabel(section).toLowerCase();
      const schoolYear = (section.schoolYear || '').toLowerCase();
      const capacity = String(section.capacity || '').toLowerCase();
      const status = this.getSectionStatusValue(section);
      const statusLabel = this.getSectionStatusLabel(section).toLowerCase();

      const matchesSearch =
        !keyword ||
        sectionCode.includes(keyword) ||
        sectionName.includes(keyword) ||
        displayName.includes(keyword) ||
        program.includes(keyword) ||
        yearLevel.includes(keyword) ||
        semester.includes(keyword) ||
        facultyName.includes(keyword) ||
        schoolYear.includes(keyword) ||
        capacity.includes(keyword) ||
        status.includes(keyword) ||
        statusLabel.includes(keyword);

      const matchesStatus =
        this.statusFilter === 'all' ? status !== 'archived' : status === this.statusFilter;

      return matchesSearch && matchesStatus;
    });
  }

  private syncSelectedFaculty(): void {
    const selectedTeacher = this.teachers.find((teacher) => teacher.id === this.form.adviserId);
    this.form.adviserName = selectedTeacher ? this.getTeacherFullName(selectedTeacher) : '';
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

  private getSectionStatusValue(section: Section): string {
    if (section.isArchived === true || this.normalizeStatus(section.status) === 'archived') {
      return 'archived';
    }

    const normalized = this.normalizeStatus(section.status);

    if (normalized === 'inactive') {
      return 'inactive';
    }

    return 'active';
  }

  private normalizeStatus(status: string | undefined): string {
    return (status || 'active').trim().toLowerCase();
  }

  private normalizeText(value: unknown): string {
    return String(value ?? '').trim();
  }

  private toTitleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
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
      isArchived: false,
      archivedAt: '',
      createdAt: '',
      updatedAt: '',
    };
  }
}
