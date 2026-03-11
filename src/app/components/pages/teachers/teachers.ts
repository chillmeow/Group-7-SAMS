import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TeacherService } from '../../../services/teacher.service';
import { Teacher } from '../../../models/teacher.model';
import { AlertService } from '../../../services/alert.service';

@Component({
  selector: 'app-teachers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teachers.html',
  styleUrl: './teachers.scss',
})
export class TeachersComponent implements OnInit {
  private teacherService = inject(TeacherService);
  private alert = inject(AlertService);

  teachers: Teacher[] = [];
  search = '';

  showModal = false;
  editing = false;

  form: Teacher = {
    employeeNo: '',
    userId: null,
    firstName: '',
    lastName: '',
    department: '',
    email: '',
    status: 'Active',
  };

  ngOnInit(): void {
    this.loadTeachers();
  }

  loadTeachers(): void {
    this.teacherService.getTeachers().subscribe((data) => {
      this.teachers = data;
    });
  }

  openAdd(): void {
    this.editing = false;
    this.form = {
      employeeNo: '',
      userId: null,
      firstName: '',
      lastName: '',
      department: '',
      email: '',
      status: 'Active',
    };
    this.showModal = true;
  }

  openEdit(teacher: Teacher): void {
    this.editing = true;
    this.form = { ...teacher };
    this.showModal = true;
  }

  saveTeacher(): void {
    if (
      !this.form.employeeNo ||
      !this.form.firstName ||
      !this.form.lastName ||
      !this.form.department ||
      !this.form.email
    ) {
      this.alert.warning('Missing fields', 'Please fill in all required teacher details.');
      return;
    }

    if (this.editing) {
      this.teacherService.updateTeacher(this.form).subscribe(() => {
        this.alert.success('Updated', 'Teacher record updated successfully.');
        this.showModal = false;
        this.loadTeachers();
      });
    } else {
      this.teacherService.addTeacher(this.form).subscribe(() => {
        this.alert.success('Added', 'Teacher record added successfully.');
        this.showModal = false;
        this.loadTeachers();
      });
    }
  }

  deleteTeacher(teacher: Teacher): void {
    this.alert
      .confirm('Delete Teacher?', `Delete ${teacher.firstName} ${teacher.lastName}?`)
      .then((result) => {
        if (result) {
          this.teacherService.deleteTeacher(teacher.id!).subscribe(() => {
            this.alert.success('Deleted', 'Teacher record removed successfully.');
            this.loadTeachers();
          });
        }
      });
  }

  filteredTeachers(): Teacher[] {
    const keyword = this.search.toLowerCase().trim();

    return this.teachers.filter(
      (t) =>
        `${t.firstName} ${t.lastName}`.toLowerCase().includes(keyword) ||
        t.employeeNo.toLowerCase().includes(keyword) ||
        t.department.toLowerCase().includes(keyword) ||
        t.email.toLowerCase().includes(keyword),
    );
  }
}
