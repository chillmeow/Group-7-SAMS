import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ParentService } from '../../../services/parent.service';
import { Parent } from '../../../models/parent.model';
import { AlertService } from '../../../services/alert.service';

@Component({
  selector: 'app-parents',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './parents.html',
  styleUrl: './parents.scss',
})
export class ParentsComponent implements OnInit {
  private parentService = inject(ParentService);
  private alert = inject(AlertService);

  parents: Parent[] = [];
  search = '';

  showModal = false;
  editing = false;

  form: Parent = {
    firstName: '',
    lastName: '',
    email: '',
    contactNumber: '',
    studentName: '',
    relationship: '',
    status: 'Active',
  };

  ngOnInit(): void {
    this.loadParents();
  }

  loadParents(): void {
    this.parentService.getParents().subscribe((data) => {
      this.parents = data;
    });
  }

  openAdd(): void {
    this.editing = false;
    this.form = {
      firstName: '',
      lastName: '',
      email: '',
      contactNumber: '',
      studentName: '',
      relationship: '',
      status: 'Active',
    };
    this.showModal = true;
  }

  openEdit(parent: Parent): void {
    this.editing = true;
    this.form = { ...parent };
    this.showModal = true;
  }

  saveParent(): void {
    if (
      !this.form.firstName ||
      !this.form.lastName ||
      !this.form.email ||
      !this.form.contactNumber ||
      !this.form.studentName ||
      !this.form.relationship
    ) {
      this.alert.warning('Missing fields', 'Please fill in all required parent details.');
      return;
    }

    if (this.editing) {
      this.parentService.updateParent(this.form).subscribe(() => {
        this.alert.success('Updated', 'Parent record updated successfully.');
        this.showModal = false;
        this.loadParents();
      });
    } else {
      this.parentService.addParent(this.form).subscribe(() => {
        this.alert.success('Added', 'Parent record added successfully.');
        this.showModal = false;
        this.loadParents();
      });
    }
  }

  deleteParent(parent: Parent): void {
    this.alert
      .confirm('Delete Parent?', `Delete ${parent.firstName} ${parent.lastName}?`)
      .then((result) => {
        if (result) {
          this.parentService.deleteParent(parent.id!).subscribe(() => {
            this.alert.success('Deleted', 'Parent record removed successfully.');
            this.loadParents();
          });
        }
      });
  }

  filteredParents(): Parent[] {
    const keyword = this.search.toLowerCase().trim();

    return this.parents.filter(
      (p) =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(keyword) ||
        p.email.toLowerCase().includes(keyword) ||
        p.contactNumber.toLowerCase().includes(keyword) ||
        p.studentName.toLowerCase().includes(keyword) ||
        p.relationship.toLowerCase().includes(keyword),
    );
  }
}
