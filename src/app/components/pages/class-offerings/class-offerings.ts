import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClassOfferingService } from '../../../services/class-offering.service';
import { ClassOffering } from '../../../models/class-offering.model';
import { AlertService } from '../../../services/alert.service';

@Component({
  selector: 'app-class-offerings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './class-offerings.html',
  styleUrl: './class-offerings.scss',
})
export class ClassOfferingsComponent implements OnInit {
  private classOfferingService = inject(ClassOfferingService);
  private alert = inject(AlertService);

  offerings: ClassOffering[] = [];
  search = '';
  selectedStatus = 'All';

  showModal = false;
  editing = false;

  form: ClassOffering = {
    subject: '',
    teacher: '',
    section: '',
    room: '',
    schedule: '',
    status: 'Active',
  };

  ngOnInit(): void {
    this.loadOfferings();
  }

  loadOfferings(): void {
    this.classOfferingService.getClassOfferings().subscribe({
      next: (data) => {
        this.offerings = data;
      },
      error: () => {
        this.alert.error('Load failed', 'Unable to load class offerings.');
      },
    });
  }

  openAdd(): void {
    this.editing = false;
    this.form = {
      subject: '',
      teacher: '',
      section: '',
      room: '',
      schedule: '',
      status: 'Active',
    };
    this.showModal = true;
  }

  openEdit(offering: ClassOffering): void {
    this.editing = true;
    this.form = { ...offering };
    this.showModal = true;
  }

  saveOffering(): void {
    if (
      !this.form.subject ||
      !this.form.teacher ||
      !this.form.section ||
      !this.form.room ||
      !this.form.schedule
    ) {
      this.alert.warning('Missing fields', 'Please complete all required class offering details.');
      return;
    }

    if (this.editing) {
      this.classOfferingService.updateClassOffering(this.form).subscribe({
        next: () => {
          this.alert.success('Updated', 'Class offering updated successfully.');
          this.showModal = false;
          this.loadOfferings();
        },
        error: () => {
          this.alert.error('Update failed', 'Unable to update class offering.');
        },
      });
    } else {
      this.classOfferingService.addClassOffering(this.form).subscribe({
        next: () => {
          this.alert.success('Created', 'Class offering created successfully.');
          this.showModal = false;
          this.loadOfferings();
        },
        error: () => {
          this.alert.error('Create failed', 'Unable to create class offering.');
        },
      });
    }
  }

  deleteOffering(offering: ClassOffering): void {
    this.alert
      .confirm('Delete Class Offering?', `Delete ${offering.subject} for ${offering.section}?`)
      .then((confirmed) => {
        if (!confirmed) return;

        this.classOfferingService.deleteClassOffering(offering.id!).subscribe({
          next: () => {
            this.alert.success('Deleted', 'Class offering removed successfully.');
            this.loadOfferings();
          },
          error: () => {
            this.alert.error('Delete failed', 'Unable to delete class offering.');
          },
        });
      });
  }

  filteredOfferings(): ClassOffering[] {
    const keyword = this.search.toLowerCase().trim();

    return this.offerings.filter((offering) => {
      const matchesSearch =
        offering.subject.toLowerCase().includes(keyword) ||
        offering.teacher.toLowerCase().includes(keyword) ||
        offering.section.toLowerCase().includes(keyword) ||
        offering.room.toLowerCase().includes(keyword) ||
        offering.schedule.toLowerCase().includes(keyword);

      const matchesStatus =
        this.selectedStatus === 'All' || offering.status === this.selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }

  getActiveCount(): number {
    return this.offerings.filter((o) => o.status === 'Active').length;
  }

  getInactiveCount(): number {
    return this.offerings.filter((o) => o.status === 'Inactive').length;
  }

  getUniqueSectionsCount(): number {
    return new Set(this.offerings.map((o) => o.section)).size;
  }

  getCardAccent(index: number): string {
    const accents = ['blue', 'purple', 'green', 'orange', 'pink', 'indigo'];
    return accents[index % accents.length];
  }
}
