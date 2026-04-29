import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { take } from 'rxjs/operators';

import { SubjectBulkImportResult, SubjectService } from '../../../services/subject.service';
import { Subject } from '../../../models/subject.model';
import { AlertService } from '../../../services/alert.service';

@Component({
  selector: 'app-subjects',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './subjects.html',
  styleUrl: './subjects.scss',
})
export class SubjectsComponent implements OnInit {
  private readonly subjectService = inject(SubjectService);
  private readonly alert = inject(AlertService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  @ViewChild('excelInput') excelInput!: ElementRef<HTMLInputElement>;

  subjects: Subject[] = [];
  filteredList: Subject[] = [];

  search = '';
  selectedStatus = 'all';

  showModal = false;
  editing = false;
  saving = false;
  loading = false;
  importing = false;

  lastImportResult: SubjectBulkImportResult | null = null;

  form: Subject = this.createEmptyForm();

  readonly programs = [
    'Information Technology',
    'Technology Communication Management',
    'Electro-Mechanical Technology',
  ];

  readonly yearLevels = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

  readonly semesters = ['1st Semester', '2nd Semester', 'Summer'];

  ngOnInit(): void {
    this.loadSubjects();
  }

  private createEmptyForm(): Subject {
    return {
      subjectCode: '',
      subjectName: '',
      program: '',
      yearLevel: '',
      semester: '',
      units: 3,
      lectureHours: 2,
      labHours: 1,
      status: 'active',
    };
  }

  private normalizeStatus(status: string | undefined): string {
    return (status || 'active').trim().toLowerCase();
  }

  loadSubjects(): void {
    this.loading = true;

    this.subjectService
      .getSubjects()
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.zone.run(() => {
            this.subjects = data.map((subject) => ({
              ...subject,
              status: this.normalizeStatus(subject.status),
            }));

            this.applyFilters();
            this.loading = false;
            this.cdr.detectChanges();
          });
        },
        error: (error) => {
          console.error('LOAD SUBJECTS ERROR:', error);

          this.zone.run(() => {
            this.loading = false;
            this.cdr.detectChanges();
          });

          this.alert.error('Load failed', 'Unable to load subjects from Firestore.');
        },
      });
  }

  openAdd(): void {
    this.editing = false;
    this.form = this.createEmptyForm();
    this.showModal = true;
    this.cdr.detectChanges();
  }

  openEdit(subject: Subject): void {
    this.editing = true;

    this.form = {
      ...subject,
      units: Number(subject.units) || 0,
      lectureHours: Number(subject.lectureHours) || 0,
      labHours: Number(subject.labHours) || 0,
      status: this.normalizeStatus(subject.status),
    };

    this.showModal = true;
    this.cdr.detectChanges();
  }

  closeModal(): void {
    this.zone.run(() => {
      this.showModal = false;
      this.editing = false;
      this.saving = false;
      this.form = this.createEmptyForm();
      this.cdr.detectChanges();
    });
  }

  saveSubject(): void {
    const subjectCode = this.form.subjectCode.trim();
    const subjectName = this.form.subjectName.trim();

    if (
      !subjectCode ||
      !subjectName ||
      !this.form.program ||
      !this.form.yearLevel ||
      !this.form.semester
    ) {
      this.alert.warning('Missing fields', 'Please complete all required subject information.');
      return;
    }

    if (Number(this.form.units) <= 0) {
      this.alert.warning('Invalid units', 'Units must be greater than 0.');
      return;
    }

    const payload: Subject = {
      ...this.form,
      subjectCode,
      subjectName,
      units: Number(this.form.units),
      lectureHours: Number(this.form.lectureHours) || 0,
      labHours: Number(this.form.labHours) || 0,
      status: this.normalizeStatus(this.form.status),
    };

    this.saving = true;
    const isEditing = this.editing;

    const request = isEditing
      ? this.subjectService.updateSubject(payload)
      : this.subjectService.addSubject(payload);

    request.pipe(take(1)).subscribe({
      next: () => {
        this.zone.run(() => {
          this.closeModal();
          this.loadSubjects();
        });

        setTimeout(() => {
          this.alert.success(
            isEditing ? 'Updated' : 'Added',
            isEditing ? 'Subject updated successfully.' : 'Subject added successfully.',
          );
        }, 150);
      },
      error: (error) => {
        console.error('SAVE SUBJECT ERROR:', error);

        this.zone.run(() => {
          this.saving = false;
          this.cdr.detectChanges();
        });

        this.alert.error(
          isEditing ? 'Update failed' : 'Add failed',
          error?.message || 'Unable to save subject.',
        );
      },
    });
  }

  archiveSubject(subject: Subject): void {
    this.alert.confirm('Archive Subject?', `Archive ${subject.subjectName}?`).then((confirmed) => {
      if (!confirmed) return;

      const updated: Subject = {
        ...subject,
        status: 'archived',
      };

      this.subjectService
        .updateSubject(updated)
        .pipe(take(1))
        .subscribe({
          next: () => {
            this.alert.success('Archived', 'Subject moved to archive successfully.');
            this.loadSubjects();
          },
          error: (error) => {
            this.alert.error('Archive failed', error?.message || 'Unable to archive subject.');
          },
        });
    });
  }

  restoreSubject(subject: Subject): void {
    const updated: Subject = {
      ...subject,
      status: 'active',
    };

    this.subjectService
      .updateSubject(updated)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.alert.success('Restored', 'Subject restored successfully.');
          this.loadSubjects();
        },
        error: (error) => {
          this.alert.error('Restore failed', error?.message || 'Unable to restore subject.');
        },
      });
  }

  permanentlyDeleteSubject(subject: Subject): void {
    if (!subject.id) {
      this.alert.error('Delete failed', 'Subject ID is missing.');
      return;
    }

    const subjectId = subject.id;

    this.alert
      .confirm(
        'Permanently Delete Subject?',
        `This will permanently delete ${subject.subjectName}.`,
      )
      .then((confirmed) => {
        if (!confirmed) return;

        this.subjectService
          .deleteSubject(subjectId)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.zone.run(() => {
                this.subjects = this.subjects.filter((item) => item.id !== subjectId);

                this.applyFilters();
                this.cdr.detectChanges();
              });

              this.alert.success('Deleted', 'Subject permanently removed.');
            },
            error: (error) => {
              this.alert.error('Delete failed', error?.message || 'Unable to delete subject.');
            },
          });
      });
  }

  openExcelPicker(): void {
    this.excelInput?.nativeElement?.click();
  }

  onExcelSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    this.importing = true;

    this.subjectService
      .importSubjectsFromExcel(file)
      .pipe(take(1))
      .subscribe({
        next: (result) => {
          this.lastImportResult = result;
          this.importing = false;
          input.value = '';

          this.alert.success(
            'Import completed',
            `${result.imported} imported, ${result.skipped} skipped.`,
          );

          this.loadSubjects();
        },
        error: (error) => {
          this.importing = false;
          input.value = '';

          this.alert.error('Import failed', error?.message || 'Unable to import subjects.');
        },
      });
  }

  applyFilters(): void {
    const keyword = this.search.toLowerCase().trim();

    this.filteredList = this.subjects.filter((subject) => {
      const matchesSearch =
        subject.subjectName.toLowerCase().includes(keyword) ||
        subject.subjectCode.toLowerCase().includes(keyword) ||
        subject.program.toLowerCase().includes(keyword);

      const status = this.normalizeStatus(subject.status);

      const matchesStatus =
        this.selectedStatus === 'all' ? status !== 'archived' : status === this.selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }

  getActiveCount(): number {
    return this.subjects.filter((s) => this.normalizeStatus(s.status) === 'active').length;
  }

  getInactiveCount(): number {
    return this.subjects.filter((s) => this.normalizeStatus(s.status) === 'inactive').length;
  }

  getArchivedCount(): number {
    return this.subjects.filter((s) => this.normalizeStatus(s.status) === 'archived').length;
  }

  getAverageUnits(): string {
    if (!this.subjects.length) return '0.0';

    const total = this.subjects.reduce((sum, s) => sum + Number(s.units || 0), 0);

    return (total / this.subjects.length).toFixed(1);
  }

  getCardAccent(index: number): string {
    const accents = ['blue', 'green', 'purple', 'orange', 'pink', 'indigo'];
    return accents[index % accents.length];
  }
}
