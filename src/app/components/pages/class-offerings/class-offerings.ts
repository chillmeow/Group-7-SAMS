import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs/operators';
import * as XLSX from 'xlsx';

import { AlertService } from '../../../services/alert.service';
import { ClassOfferingService } from '../../../services/class-offering.service';
import { SubjectService } from '../../../services/subject.service';
import { SectionService } from '../../../services/section.service';
import { TeacherService } from '../../../services/teacher.service';

import { ClassOffering, ClassSchedule, ScheduleType } from '../../../models/class-offering.model';
import { Subject } from '../../../models/subject.model';
import { Section } from '../../../models/section.model';
import { Teacher } from '../../../models/teacher.model';

type OfferingStatusFilter = 'all' | 'active' | 'inactive' | 'archived';
type DrawerMode = 'form' | 'import';

interface ImportRow {
  subjectCode: string;
  sectionName: string;
  teacherEmployeeNo: string;
  schoolYear: string;
  semester: string;
  type: ScheduleType;
  day: string;
  startTime: string;
  endTime: string;
  room: string;
}

@Component({
  selector: 'app-class-offerings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './class-offerings.html',
  styleUrl: './class-offerings.scss',
})
export class ClassOfferingsComponent implements OnInit {
  private readonly offeringService = inject(ClassOfferingService);
  private readonly subjectService = inject(SubjectService);
  private readonly sectionService = inject(SectionService);
  private readonly teacherService = inject(TeacherService);
  private readonly alert = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  offerings: ClassOffering[] = [];
  filteredList: ClassOffering[] = [];

  subjects: Subject[] = [];
  sections: Section[] = [];
  teachers: Teacher[] = [];

  search = '';
  statusFilter: OfferingStatusFilter = 'all';

  isLoading = false;
  isSaving = false;
  isImporting = false;

  showDrawer = false;
  drawerMode: DrawerMode = 'form';
  editing = false;

  selectedFileName = '';
  importRows: ImportRow[] = [];
  importPreview: ClassOffering[] = [];

  form: ClassOffering = this.createEmptyForm();

  readonly semesters = ['1st Semester', '2nd Semester', 'Summer'];
  readonly days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  readonly scheduleTypes: ScheduleType[] = ['Lecture', 'Laboratory'];

  ngOnInit(): void {
    this.loadInitialData();
  }

  loadInitialData(): void {
    this.loadSubjects();
    this.loadSections();
    this.loadTeachers();
    this.loadOfferings();
  }

  loadOfferings(): void {
    this.isLoading = true;

    this.offeringService
      .getClassOfferings()
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.zone.run(() => {
            this.offerings = (data || []).map((item) => ({
              ...item,
              status: this.normalizeStatus(item.status),
              schedules: item.schedules || [],
            }));

            this.applyFilters();
            this.isLoading = false;
            this.cdr.detectChanges();
          });
        },
        error: (error) => {
          console.error('LOAD CLASS OFFERINGS ERROR:', error);

          this.zone.run(() => {
            this.offerings = [];
            this.filteredList = [];
            this.isLoading = false;
            this.cdr.detectChanges();
          });

          this.alert.warning(
            'Unable to load class offerings',
            'Class offering records are currently unavailable. Please try again later.',
          );
        },
      });
  }

  loadSubjects(): void {
    this.subjectService
      .getSubjects()
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.zone.run(() => {
            this.subjects = (data || []).filter(
              (subject) => this.normalizeStatus(subject.status) === 'active',
            );
            this.cdr.detectChanges();
          });
        },
        error: () => {
          this.alert.warning(
            'Unable to load subjects',
            'Subject records are currently unavailable.',
          );
        },
      });
  }

  loadSections(): void {
    this.sectionService
      .getSections()
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.zone.run(() => {
            this.sections = (data || []).filter(
              (section) => this.normalizeStatus(section.status) === 'active',
            );
            this.cdr.detectChanges();
          });
        },
        error: () => {
          this.alert.warning(
            'Unable to load sections',
            'Section records are currently unavailable.',
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
        error: () => {
          this.alert.warning(
            'Unable to load teachers',
            'Teacher records are currently unavailable.',
          );
        },
      });
  }

  openAdd(): void {
    this.drawerMode = 'form';
    this.editing = false;
    this.form = this.createEmptyForm();
    this.showDrawer = true;
    this.cdr.detectChanges();
  }

  openImport(): void {
    this.drawerMode = 'import';
    this.editing = false;
    this.selectedFileName = '';
    this.importRows = [];
    this.importPreview = [];
    this.showDrawer = true;
    this.cdr.detectChanges();
  }

  openEdit(offering: ClassOffering): void {
    this.drawerMode = 'form';
    this.editing = true;

    this.form = {
      id: offering.id,
      offeringCode: offering.offeringCode || '',

      subjectId: offering.subjectId || '',
      subjectCode: offering.subjectCode || '',
      subjectName: offering.subjectName || '',

      sectionId: offering.sectionId || '',
      sectionName: offering.sectionName || '',

      teacherId: offering.teacherId || '',
      teacherName: offering.teacherName || '',

      schoolYear: offering.schoolYear || '',
      semester: offering.semester || '',

      schedules:
        offering.schedules?.length > 0
          ? offering.schedules.map((schedule) => ({ ...schedule }))
          : [this.createEmptySchedule()],

      status: this.normalizeStatus(offering.status),
      createdAt: offering.createdAt || '',
      updatedAt: offering.updatedAt || '',
    };

    this.showDrawer = true;
    this.cdr.detectChanges();
  }

  closeDrawer(): void {
    this.zone.run(() => {
      this.showDrawer = false;
      this.drawerMode = 'form';
      this.editing = false;
      this.isSaving = false;
      this.isImporting = false;
      this.selectedFileName = '';
      this.importRows = [];
      this.importPreview = [];
      this.form = this.createEmptyForm();
      this.cdr.detectChanges();
    });
  }

  saveOffering(): void {
    if (!this.isFormValid()) {
      this.alert.warning(
        'Incomplete record',
        'Please complete the subject, section, teacher, term, and schedule details.',
      );
      return;
    }

    if (this.hasInvalidScheduleTime(this.form.schedules)) {
      this.alert.warning(
        'Invalid schedule',
        'Each schedule must have an end time later than its start time.',
      );
      return;
    }

    this.syncSelectedSubject();
    this.syncSelectedSection();
    this.syncSelectedTeacher();

    const payload: ClassOffering = this.cleanOfferingPayload(this.form);

    this.isSaving = true;
    const isEditing = this.editing;

    const request = isEditing
      ? this.offeringService.updateClassOffering(payload)
      : this.offeringService.addClassOffering(payload);

    request.pipe(take(1)).subscribe({
      next: () => {
        this.zone.run(() => {
          this.closeDrawer();
          this.loadOfferings();
        });

        setTimeout(() => {
          this.alert.success(
            isEditing ? 'Class offering updated' : 'Class offering added',
            isEditing
              ? 'The class offering record was updated successfully.'
              : 'The class offering record was added successfully.',
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
          error?.message || 'Unable to save the class offering record right now.',
        );
      },
    });
  }

  onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    this.selectedFileName = file.name;

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
          defval: '',
        });

        this.importRows = rawRows.map((row) => this.mapExcelRow(row));
        this.importPreview = this.buildImportPreview(this.importRows);

        this.zone.run(() => {
          this.cdr.detectChanges();
        });

        if (!this.importPreview.length) {
          this.alert.warning(
            'No valid rows found',
            'Please check the Excel format and make sure the required columns are present.',
          );
        }
      } catch (error) {
        console.error('IMPORT PARSE ERROR:', error);
        this.alert.warning('Invalid Excel file', 'Unable to read the selected Excel file.');
      }
    };

    reader.readAsArrayBuffer(file);
  }

  importClassOfferings(): void {
    if (!this.importPreview.length) {
      this.alert.warning('No import data', 'Please select a valid Excel file first.');
      return;
    }

    const invalidOffering = this.importPreview.find(
      (offering) =>
        !offering.subjectId ||
        !offering.sectionId ||
        !offering.teacherId ||
        !offering.schoolYear ||
        !offering.semester ||
        !offering.schedules.length ||
        this.hasInvalidScheduleTime(offering.schedules),
    );

    if (invalidOffering) {
      this.alert.warning(
        'Import validation failed',
        'Some rows have missing references or invalid schedules. Please check subject code, section, teacher employee number, and time values.',
      );
      return;
    }

    this.isImporting = true;

    const requests = this.importPreview.map((offering) =>
      this.offeringService.addClassOffering(this.cleanOfferingPayload(offering)).pipe(take(1)),
    );

    let completed = 0;
    let failed = 0;

    requests.forEach((request) => {
      request.subscribe({
        next: () => {
          completed++;
          this.finishImportIfDone(completed, failed, requests.length);
        },
        error: (error) => {
          failed++;
          console.error('IMPORT CLASS OFFERING ERROR:', error);
          this.finishImportIfDone(completed, failed, requests.length);
        },
      });
    });
  }

  private finishImportIfDone(completed: number, failed: number, total: number): void {
    if (completed + failed !== total) return;

    this.zone.run(() => {
      this.isImporting = false;
      this.closeDrawer();
      this.loadOfferings();
    });

    if (failed > 0) {
      this.alert.warning(
        'Import completed with issues',
        `${completed} offering(s) imported. ${failed} offering(s) failed, possibly because they already exist or contain invalid data.`,
      );
      return;
    }

    this.alert.success(
      'Import successful',
      `${completed} class offering record(s) were imported successfully.`,
    );
  }

  private mapExcelRow(row: Record<string, unknown>): ImportRow {
    const get = (...keys: string[]): string => {
      for (const key of keys) {
        const foundKey = Object.keys(row).find(
          (item) => item.trim().toLowerCase() === key.trim().toLowerCase(),
        );

        if (foundKey) {
          return String(row[foundKey] ?? '').trim();
        }
      }

      return '';
    };

    return {
      subjectCode: get('Subject Code', 'SubjectCode', 'Code'),
      sectionName: get('Section', 'Section Name', 'SectionName'),
      teacherEmployeeNo: get('Teacher Employee No', 'Employee No', 'EmployeeNo', 'Teacher ID'),
      schoolYear: get('School Year', 'SchoolYear'),
      semester: get('Semester', 'Term'),
      type: this.normalizeScheduleType(get('Type', 'Schedule Type', 'ScheduleType')),
      day: get('Day'),
      startTime: this.normalizeExcelTime(get('Start Time', 'StartTime')),
      endTime: this.normalizeExcelTime(get('End Time', 'EndTime')),
      room: get('Room', 'Room / Lab', 'Lab'),
    };
  }

  private buildImportPreview(rows: ImportRow[]): ClassOffering[] {
    const grouped = new Map<string, ClassOffering>();

    rows.forEach((row) => {
      if (
        !row.subjectCode ||
        !row.sectionName ||
        !row.teacherEmployeeNo ||
        !row.schoolYear ||
        !row.semester ||
        !row.day ||
        !row.startTime ||
        !row.endTime ||
        !row.room
      ) {
        return;
      }

      const subject = this.subjects.find(
        (item) => item.subjectCode.trim().toLowerCase() === row.subjectCode.trim().toLowerCase(),
      );

      const section = this.sections.find(
        (item) =>
          this.getSectionDisplayName(item).trim().toLowerCase() ===
            row.sectionName.trim().toLowerCase() ||
          item.sectionName.trim().toLowerCase() === row.sectionName.trim().toLowerCase(),
      );

      const teacher = this.teachers.find(
        (item) =>
          item.employeeNo?.trim().toLowerCase() === row.teacherEmployeeNo.trim().toLowerCase(),
      );

      const key = [
        row.subjectCode,
        row.sectionName,
        row.teacherEmployeeNo,
        row.schoolYear,
        row.semester,
      ]
        .join('|')
        .toLowerCase();

      const schedule: ClassSchedule = {
        type: row.type,
        day: row.day,
        startTime: row.startTime,
        endTime: row.endTime,
        room: row.room,
      };

      if (!grouped.has(key)) {
        grouped.set(key, {
          offeringCode: '',
          subjectId: subject?.id || '',
          subjectCode: subject?.subjectCode || row.subjectCode,
          subjectName: subject?.subjectName || 'Subject not found',
          sectionId: section?.id || '',
          sectionName: section ? this.getSectionDisplayName(section) : row.sectionName,
          teacherId: teacher?.id || '',
          teacherName: teacher ? this.getTeacherFullName(teacher) : 'Teacher not found',
          schoolYear: row.schoolYear,
          semester: row.semester,
          schedules: [schedule],
          status: 'active',
        });

        return;
      }

      grouped.get(key)?.schedules.push(schedule);
    });

    return Array.from(grouped.values());
  }

  downloadTemplate(): void {
    const sampleRows = [
      {
        'Subject Code': 'IT 223',
        Section: 'IT 2B',
        'Teacher Employee No': 'EMP-001',
        'School Year': '2025-2026',
        Semester: '2nd Semester',
        'Schedule Type': 'Lecture',
        Day: 'Monday',
        'Start Time': '08:00',
        'End Time': '10:00',
        Room: 'Room 201',
      },
      {
        'Subject Code': 'IT 223',
        Section: 'IT 2B',
        'Teacher Employee No': 'EMP-001',
        'School Year': '2025-2026',
        Semester: '2nd Semester',
        'Schedule Type': 'Laboratory',
        Day: 'Wednesday',
        'Start Time': '13:00',
        'End Time': '16:00',
        Room: 'Lab 2',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Class Offerings');
    XLSX.writeFile(workbook, 'class-offerings-template.xlsx');
  }

  archiveOffering(offering: ClassOffering): void {
    this.alert
      .confirm(
        'Archive class offering?',
        `Move ${offering.subjectCode} - ${offering.sectionName} to archive?`,
      )
      .then((confirmed) => {
        if (!confirmed) return;
        this.updateOfferingStatus(offering, 'archived');
      });
  }

  restoreOffering(offering: ClassOffering): void {
    this.alert
      .confirm(
        'Restore class offering?',
        `Restore ${offering.subjectCode} - ${offering.sectionName} back to active records?`,
      )
      .then((confirmed) => {
        if (!confirmed) return;
        this.updateOfferingStatus(offering, 'active');
      });
  }

  toggleOfferingStatus(offering: ClassOffering): void {
    const currentStatus = this.normalizeStatus(offering.status);
    const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const actionLabel = nextStatus === 'active' ? 'activate' : 'deactivate';

    this.alert
      .confirm(
        `${this.capitalize(actionLabel)} class offering?`,
        `${this.capitalize(actionLabel)} ${offering.subjectCode} - ${offering.sectionName}?`,
      )
      .then((confirmed) => {
        if (!confirmed) return;
        this.updateOfferingStatus(offering, nextStatus);
      });
  }

  permanentlyDeleteOffering(offering: ClassOffering): void {
    if (!offering.id) {
      this.alert.warning('Delete failed', 'Class offering ID is missing.');
      return;
    }

    const offeringId = offering.id;

    this.alert
      .confirm(
        'Permanently delete class offering?',
        `This will permanently delete ${offering.subjectCode} - ${offering.sectionName}. This action cannot be undone.`,
      )
      .then((confirmed) => {
        if (!confirmed) return;

        this.offeringService
          .deleteClassOffering(offeringId)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.zone.run(() => {
                this.offerings = this.offerings.filter((item) => item.id !== offeringId);
                this.applyFilters();
                this.cdr.detectChanges();
              });

              this.alert.success(
                'Class offering permanently deleted',
                'The class offering record was permanently removed from Firebase.',
              );
            },
            error: (error) => {
              this.alert.warning(
                'Delete failed',
                error?.message || 'Unable to permanently delete this class offering right now.',
              );
            },
          });
      });
  }

  private updateOfferingStatus(offering: ClassOffering, status: string): void {
    this.offeringService
      .updateClassOffering({ ...offering, status })
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.alert.success(
            'Status updated',
            'The class offering status was updated successfully.',
          );
          this.loadOfferings();
        },
        error: (error) => {
          this.alert.warning(
            'Status update failed',
            error?.message || 'Unable to update class offering status right now.',
          );
        },
      });
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  setStatusFilter(filter: OfferingStatusFilter): void {
    this.statusFilter = filter;
    this.applyFilters();
  }

  onSubjectChange(): void {
    this.syncSelectedSubject();
  }

  onSectionChange(): void {
    this.syncSelectedSection();
  }

  onTeacherChange(): void {
    this.syncSelectedTeacher();
  }

  addSchedule(): void {
    this.form.schedules.push(this.createEmptySchedule());
  }

  removeSchedule(index: number): void {
    if (this.form.schedules.length === 1) {
      this.alert.warning('Schedule required', 'A class offering must have at least one schedule.');
      return;
    }

    this.form.schedules.splice(index, 1);
  }

  private syncSelectedSubject(): void {
    const selectedSubject = this.subjects.find((subject) => subject.id === this.form.subjectId);

    this.form.subjectCode = selectedSubject?.subjectCode || '';
    this.form.subjectName = selectedSubject?.subjectName || '';
  }

  private syncSelectedSection(): void {
    const selectedSection = this.sections.find((section) => section.id === this.form.sectionId);

    this.form.sectionName = selectedSection ? this.getSectionDisplayName(selectedSection) : '';
  }

  private syncSelectedTeacher(): void {
    const selectedTeacher = this.teachers.find((teacher) => teacher.id === this.form.teacherId);

    this.form.teacherName = selectedTeacher ? this.getTeacherFullName(selectedTeacher) : '';
  }

  get totalOfferings(): number {
    return this.offerings.filter((offering) => !this.isArchived(offering)).length;
  }

  get activeOfferings(): number {
    return this.offerings.filter((offering) => this.normalizeStatus(offering.status) === 'active')
      .length;
  }

  get totalSchedules(): number {
    return this.offerings
      .filter((offering) => !this.isArchived(offering))
      .reduce((total, offering) => total + (offering.schedules?.length || 0), 0);
  }

  get recordCountLabel(): string {
    return `${this.filteredList.length} class offering record(s)`;
  }

  getDrawerTitle(): string {
    if (this.drawerMode === 'import') return 'Import Class Offerings';
    return this.editing ? 'Edit Class Offering' : 'Add Class Offering';
  }

  getDrawerDescription(): string {
    if (this.drawerMode === 'import') {
      return 'Upload an Excel file from registrar or PRISM-style scheduling records.';
    }

    return this.editing
      ? 'Update the official teaching assignment and schedule details.'
      : 'Create a teaching assignment by connecting subject, section, teacher, and flexible schedules.';
  }

  getSubjectLabel(subject: Subject): string {
    return `${subject.subjectCode} - ${subject.subjectName}`;
  }

  getSectionDisplayName(section: Section): string {
    const programCode = this.getProgramCode(section.program);
    const yearNumber = this.getYearNumber(section.yearLevel);
    const block = section.sectionName || '';

    return `${programCode} ${yearNumber}${block}`.trim();
  }

  getTeacherFullName(teacher: Teacher): string {
    return `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
  }

  getTeacherLabel(teacher: Teacher): string {
    const name = this.getTeacherFullName(teacher);
    const employeeNo = teacher.employeeNo || 'No ID';

    return `${name} - ${employeeNo}`;
  }

  getScheduleLabel(schedule: ClassSchedule): string {
    return `${schedule.type}: ${schedule.day}, ${this.formatTime(schedule.startTime)} - ${this.formatTime(
      schedule.endTime,
    )}${schedule.room ? ' • ' + schedule.room : ''}`;
  }

  getScheduleSummary(offering: ClassOffering): string {
    if (!offering.schedules?.length) return 'No schedule set';

    return offering.schedules.map((schedule) => this.getScheduleLabel(schedule)).join(' | ');
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

  isArchived(offering: ClassOffering): boolean {
    return this.normalizeStatus(offering.status) === 'archived';
  }

  isArchiveView(): boolean {
    return this.statusFilter === 'archived';
  }

  trackByOffering(index: number, offering: ClassOffering): string | number {
    return offering.id || offering.offeringCode || index;
  }

  trackBySchedule(index: number): number {
    return index;
  }

  private applyFilters(): void {
    const keyword = this.search.trim().toLowerCase();

    this.filteredList = this.offerings.filter((offering) => {
      const searchBlob = [
        offering.offeringCode,
        offering.subjectCode,
        offering.subjectName,
        offering.sectionName,
        offering.teacherName,
        offering.schoolYear,
        offering.semester,
        this.getScheduleSummary(offering),
        offering.status,
      ]
        .join(' ')
        .toLowerCase();

      const status = this.normalizeStatus(offering.status);
      const matchesSearch = !keyword || searchBlob.includes(keyword);
      const matchesStatus =
        this.statusFilter === 'all' ? status !== 'archived' : status === this.statusFilter;

      return matchesSearch && matchesStatus;
    });
  }

  private isFormValid(): boolean {
    return Boolean(
      this.form.subjectId?.trim() &&
      this.form.sectionId?.trim() &&
      this.form.teacherId?.trim() &&
      this.form.schoolYear?.trim() &&
      this.form.semester?.trim() &&
      this.form.schedules.length > 0 &&
      this.form.schedules.every(
        (schedule) =>
          schedule.type &&
          schedule.day?.trim() &&
          schedule.startTime?.trim() &&
          schedule.endTime?.trim() &&
          schedule.room?.trim(),
      ),
    );
  }

  private hasInvalidScheduleTime(schedules: ClassSchedule[]): boolean {
    return schedules.some((schedule) => schedule.startTime >= schedule.endTime);
  }

  private cleanOfferingPayload(offering: ClassOffering): ClassOffering {
    return {
      ...offering,
      subjectCode: offering.subjectCode.trim().toUpperCase(),
      subjectName: offering.subjectName.trim(),
      sectionName: offering.sectionName.trim().toUpperCase(),
      teacherName: offering.teacherName.trim(),
      schoolYear: offering.schoolYear.trim(),
      semester: offering.semester.trim(),
      schedules: offering.schedules.map((schedule) => ({
        type: schedule.type,
        day: schedule.day.trim(),
        startTime: schedule.startTime.trim(),
        endTime: schedule.endTime.trim(),
        room: schedule.room.trim(),
      })),
      status: this.normalizeStatus(offering.status),
    };
  }

  private normalizeStatus(status: string | undefined): string {
    return (status || 'active').trim().toLowerCase();
  }

  private normalizeScheduleType(value: string): ScheduleType {
    return value.trim().toLowerCase().includes('lab') ? 'Laboratory' : 'Lecture';
  }

  private normalizeExcelTime(value: string): string {
    if (!value) return '';

    const clean = value.trim();

    if (/^\d{1,2}:\d{2}$/.test(clean)) {
      const [hour, minute] = clean.split(':');
      return `${hour.padStart(2, '0')}:${minute}`;
    }

    return clean;
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private formatTime(time: string): string {
    if (!time) return '';

    const [hourValue, minute] = time.split(':');
    const hour = Number(hourValue);

    if (Number.isNaN(hour)) return time;

    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;

    return `${displayHour}:${minute} ${period}`;
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

  private createEmptySchedule(): ClassSchedule {
    return {
      type: 'Lecture',
      day: '',
      startTime: '',
      endTime: '',
      room: '',
    };
  }

  private createEmptyForm(): ClassOffering {
    return {
      offeringCode: '',
      subjectId: '',
      subjectCode: '',
      subjectName: '',
      sectionId: '',
      sectionName: '',
      teacherId: '',
      teacherName: '',
      schoolYear: '',
      semester: '',
      schedules: [this.createEmptySchedule()],
      status: 'active',
    };
  }
}
