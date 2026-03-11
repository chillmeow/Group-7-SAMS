import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SectionService } from '../../../services/section.service';
import { Section } from '../../../models/section.model';
import { AlertService } from '../../../services/alert.service';

@Component({
  selector: 'app-sections',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sections.html',
  styleUrl: './sections.scss',
})
export class SectionsComponent implements OnInit {
  private sectionService = inject(SectionService);
  private alert = inject(AlertService);

  sections: Section[] = [];
  search = '';
  selectedStatus = 'All';

  showModal = false;
  editing = false;

  form: Section = {
    sectionName: '',
    yearLevel: '',
    adviser: '',
    capacity: 40,
    students: 0,
    status: 'Active',
  };

  ngOnInit(): void {
    this.loadSections();
  }

  loadSections(): void {
    this.sectionService.getSections().subscribe({
      next: (data) => {
        this.sections = data;
      },
      error: () => {
        this.alert.error('Load failed', 'Unable to load section records.');
      },
    });
  }

  openAdd(): void {
    this.editing = false;
    this.form = {
      sectionName: '',
      yearLevel: '',
      adviser: '',
      capacity: 40,
      students: 0,
      status: 'Active',
    };
    this.showModal = true;
  }

  openEdit(section: Section): void {
    this.editing = true;
    this.form = { ...section };
    this.showModal = true;
  }

  saveSection(): void {
    if (!this.form.sectionName || !this.form.yearLevel || !this.form.adviser) {
      this.alert.warning('Missing fields', 'Please complete the required section details.');
      return;
    }

    if (Number(this.form.capacity) < 1) {
      this.alert.warning('Invalid capacity', 'Capacity must be at least 1.');
      return;
    }

    if (Number(this.form.students) < 0) {
      this.alert.warning('Invalid student count', 'Student count cannot be negative.');
      return;
    }

    if (Number(this.form.students) > Number(this.form.capacity)) {
      this.alert.warning('Invalid values', 'Student count cannot be greater than capacity.');
      return;
    }

    const payload: Section = {
      ...this.form,
      capacity: Number(this.form.capacity),
      students: Number(this.form.students),
    };

    if (this.editing) {
      this.sectionService.updateSection(payload).subscribe({
        next: () => {
          this.alert.success('Updated', 'Section updated successfully.');
          this.showModal = false;
          this.loadSections();
        },
        error: () => {
          this.alert.error('Update failed', 'Unable to update section.');
        },
      });
    } else {
      this.sectionService.addSection(payload).subscribe({
        next: () => {
          this.alert.success('Created', 'Section created successfully.');
          this.showModal = false;
          this.loadSections();
        },
        error: () => {
          this.alert.error('Create failed', 'Unable to create section.');
        },
      });
    }
  }

  deleteSection(section: Section): void {
    this.alert.confirm('Delete Section?', `Delete ${section.sectionName}?`).then((confirmed) => {
      if (!confirmed) return;

      this.sectionService.deleteSection(section.id!).subscribe({
        next: () => {
          this.alert.success('Deleted', 'Section removed successfully.');
          this.loadSections();
        },
        error: () => {
          this.alert.error('Delete failed', 'Unable to delete section.');
        },
      });
    });
  }

  filteredSections(): Section[] {
    const keyword = this.search.toLowerCase().trim();

    return this.sections.filter((section) => {
      const matchesSearch =
        section.sectionName.toLowerCase().includes(keyword) ||
        section.yearLevel.toLowerCase().includes(keyword) ||
        section.adviser.toLowerCase().includes(keyword);

      const matchesStatus = this.selectedStatus === 'All' || section.status === this.selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }

  getActiveCount(): number {
    return this.sections.filter((s) => s.status === 'Active').length;
  }

  getInactiveCount(): number {
    return this.sections.filter((s) => s.status === 'Inactive').length;
  }

  getTotalStudents(): number {
    return this.sections.reduce((sum, section) => sum + Number(section.students), 0);
  }

  getOccupancy(section: Section): number {
    if (!section.capacity || section.capacity <= 0) return 0;
    return Math.min(100, Math.round((Number(section.students) / Number(section.capacity)) * 100));
  }

  getOccupancyLabel(section: Section): string {
    const occupancy = this.getOccupancy(section);

    if (occupancy >= 90) return 'Almost Full';
    if (occupancy >= 70) return 'High';
    if (occupancy >= 40) return 'Moderate';
    return 'Available';
  }

  getCardAccent(index: number): string {
    const accents = ['blue', 'purple', 'green', 'orange', 'pink', 'indigo'];
    return accents[index % accents.length];
  }
}
