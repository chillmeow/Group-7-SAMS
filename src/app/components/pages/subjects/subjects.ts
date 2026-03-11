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

  form: Subject = {
    subjectCode: '',
    subjectName: '',
    units: 3,
    status: 'Active',
  };

  ngOnInit(): void {
    this.loadSubjects();
  }

  loadSubjects(): void {
    this.subjectService.getSubjects().subscribe((data) => {
      this.subjects = data;
    });
  }

  openAdd(): void {
    this.editing = false;
    this.form = {
      subjectCode: '',
      subjectName: '',
      units: 3,
      status: 'Active',
    };
    this.showModal = true;
  }

  openEdit(subject: Subject): void {
    this.editing = true;
    this.form = { ...subject };
    this.showModal = true;
  }

  saveSubject(): void {
    if (!this.form.subjectCode || !this.form.subjectName) {
      this.alert.warning('Missing fields', 'Please fill all required subject information.');
      return;
    }

    if (this.editing) {
      this.subjectService.updateSubject(this.form).subscribe(() => {
        this.alert.success('Updated', 'Subject updated successfully.');
        this.showModal = false;
        this.loadSubjects();
      });
    } else {
      this.subjectService.addSubject(this.form).subscribe(() => {
        this.alert.success('Added', 'Subject added successfully.');
        this.showModal = false;
        this.loadSubjects();
      });
    }
  }

  deleteSubject(subject: Subject): void {
    this.alert.confirm('Delete Subject?', `Delete ${subject.subjectName}?`).then((result) => {
      if (result) {
        this.subjectService.deleteSubject(subject.id!).subscribe(() => {
          this.alert.success('Deleted', 'Subject removed successfully.');
          this.loadSubjects();
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

      const matchesStatus = this.selectedStatus === 'All' || subject.status === this.selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }

  getActiveCount(): number {
    return this.subjects.filter((s) => s.status === 'Active').length;
  }

  getInactiveCount(): number {
    return this.subjects.filter((s) => s.status === 'Inactive').length;
  }

  getAverageUnits(): string {
    if (!this.subjects.length) return '0.0';
    const total = this.subjects.reduce((sum, s) => sum + Number(s.units), 0);
    return (total / this.subjects.length).toFixed(1);
  }

  getCardAccent(index: number): string {
    const accents = ['blue', 'green', 'purple', 'orange', 'pink', 'indigo'];
    return accents[index % accents.length];
  }
}
