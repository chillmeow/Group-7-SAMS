import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SubjectService } from '../../../services/subject.service';
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
  private subjectService = inject(SubjectService);
  private alert = inject(AlertService);

  subjects: Subject[] = [];
  search = '';
  selectedStatus = 'All';

  showModal = false;
  editing = false;
  saving = false;
  loading = false;

  form: Subject = this.createEmptyForm();

  ngOnInit(): void {
    this.loadSubjects();
  }

  private createEmptyForm(): Subject {
    return {
      subjectCode: '',
      subjectName: '',
      units: 3,
      status: 'active',
    };
  }

  private normalizeStatus(status: string | undefined): string {
    return (status || 'active').trim().toLowerCase();
  }

  loadSubjects(): void {
    this.loading = true;

    this.subjectService.getSubjects().subscribe({
      next: (data) => {
        this.subjects = data.map((subject) => ({
          ...subject,
          status: this.normalizeStatus(subject.status),
        }));
        this.loading = false;
      },
      error: (error) => {
        console.error('LOAD SUBJECTS ERROR:', error);
        this.loading = false;
        this.alert.error('Load failed', 'Unable to load subjects from Firestore.');
      },
    });
  }

  openAdd(): void {
    this.editing = false;
    this.form = this.createEmptyForm();
    this.showModal = true;
  }

  openEdit(subject: Subject): void {
    this.editing = true;
    this.form = {
      ...subject,
      units: Number(subject.units) || 0,
      status: this.normalizeStatus(subject.status),
    };
    this.showModal = true;
  }

  saveSubject(): void {
    const subjectCode = this.form.subjectCode.trim();
    const subjectName = this.form.subjectName.trim();
    const units = Number(this.form.units);

    if (!subjectCode || !subjectName) {
      this.alert.warning('Missing fields', 'Please fill all required subject information.');
      return;
    }

    if (!Number.isFinite(units) || units <= 0) {
      this.alert.warning('Invalid units', 'Units must be greater than 0.');
      return;
    }

    const payload: Subject = {
      ...this.form,
      subjectCode,
      subjectName,
      units,
      status: this.normalizeStatus(this.form.status),
    };

    this.saving = true;

    if (this.editing) {
      this.subjectService.updateSubject(payload).subscribe({
        next: () => {
          this.saving = false;
          this.alert.success('Updated', 'Subject updated successfully.');
          this.showModal = false;
          this.loadSubjects();
        },
        error: (error) => {
          console.error('UPDATE SUBJECT ERROR:', error);
          this.saving = false;
          this.alert.error('Update failed', error?.message || 'Unable to update subject.');
        },
      });
    } else {
      this.subjectService.addSubject(payload).subscribe({
        next: () => {
          this.saving = false;
          this.alert.success('Added', 'Subject added successfully.');
          this.showModal = false;
          this.loadSubjects();
        },
        error: (error) => {
          console.error('ADD SUBJECT ERROR:', error);
          this.saving = false;
          this.alert.error('Add failed', error?.message || 'Unable to add subject.');
        },
      });
    }
  }

  deleteSubject(subject: Subject): void {
    if (!subject.id) {
      this.alert.error('Delete failed', 'Subject ID is missing.');
      return;
    }

    this.alert.confirm('Delete Subject?', `Delete ${subject.subjectName}?`).then((result) => {
      if (result) {
        this.subjectService.deleteSubject(subject.id!).subscribe({
          next: () => {
            this.alert.success('Deleted', 'Subject removed successfully.');
            this.loadSubjects();
          },
          error: (error) => {
            console.error('DELETE SUBJECT ERROR:', error);
            this.alert.error('Delete failed', error?.message || 'Unable to delete subject.');
          },
        });
      }
    });
  }

  filteredSubjects(): Subject[] {
    const keyword = this.search.toLowerCase().trim();

    return this.subjects.filter((subject) => {
      const matchesSearch =
        subject.subjectName.toLowerCase().includes(keyword) ||
        subject.subjectCode.toLowerCase().includes(keyword);

      const status = this.normalizeStatus(subject.status);
      const matchesStatus =
        this.selectedStatus === 'All' || status === this.selectedStatus.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }

  getActiveCount(): number {
    return this.subjects.filter((s) => this.normalizeStatus(s.status) === 'active').length;
  }

  getInactiveCount(): number {
    return this.subjects.filter((s) => this.normalizeStatus(s.status) === 'inactive').length;
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
