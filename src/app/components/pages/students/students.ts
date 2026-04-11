import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StudentService } from '../../../services/student.service';
import { Student } from '../../../models/student.model';
import { AlertService } from '../../../services/alert.service';

@Component({
  selector: 'app-students',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './students.html',
  styleUrl: './students.scss',
})
export class StudentsComponent implements OnInit {
  private studentService = inject(StudentService);
  private alert = inject(AlertService);

  students: Student[] = [];
  search = '';

  showModal = false;
  editing = false;

  form: Student = {
    userId: '',
    studentNumber: '',
    firstName: '',
    lastName: '',
    email: '',
    sectionId: '',
    yearLevel: '',
    status: 'active',
  };

  ngOnInit(): void {
    this.loadStudents();
  }

  loadStudents() {
    this.studentService.getStudents().subscribe((data) => {
      this.students = data;
    });
  }

  openAdd() {
    this.editing = false;
    this.form = {
      userId: '',
      studentNumber: '',
      firstName: '',
      lastName: '',
      email: '',
      sectionId: '',
      yearLevel: '',
      status: 'active',
    };
    this.showModal = true;
  }

  openEdit(student: Student) {
    this.editing = true;
    this.form = { ...student };
    this.showModal = true;
  }

  saveStudent() {
    if (
      !this.form.firstName ||
      !this.form.lastName ||
      !this.form.studentNumber ||
      !this.form.sectionId ||
      !this.form.yearLevel
    ) {
      this.alert.warning('Missing fields', 'Please fill all required fields');
      return;
    }

    if (this.editing) {
      this.studentService.updateStudent(this.form).subscribe(() => {
        this.alert.success('Updated', 'Student updated successfully');
        this.showModal = false;
        this.loadStudents();
      });
    } else {
      this.studentService.addStudent(this.form).subscribe(() => {
        this.alert.success('Added', 'Student added successfully');
        this.showModal = false;
        this.loadStudents();
      });
    }
  }

  deleteStudent(student: Student) {
    this.alert
      .confirm('Delete Student?', `Delete ${student.firstName} ${student.lastName}?`)
      .then((result) => {
        if (result && student.id) {
          this.studentService.deleteStudent(student.id).subscribe(() => {
            this.alert.success('Deleted', 'Student removed');
            this.loadStudents();
          });
        }
      });
  }

  filteredStudents() {
    return this.students.filter((s) =>
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(this.search.toLowerCase()),
    );
  }
}
