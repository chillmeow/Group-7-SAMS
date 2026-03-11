import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Student } from '../models/student.model';

@Injectable({
  providedIn: 'root',
})
export class StudentService {
  private http = inject(HttpClient);
  private api = 'http://localhost:3000/students';

  getStudents(): Observable<Student[]> {
    return this.http.get<Student[]>(this.api);
  }

  addStudent(student: Student): Observable<Student> {
    return this.http.post<Student>(this.api, student);
  }

  updateStudent(student: Student): Observable<Student> {
    return this.http.put<Student>(`${this.api}/${student.id}`, student);
  }

  deleteStudent(id: number): Observable<any> {
    return this.http.delete(`${this.api}/${id}`);
  }
}
