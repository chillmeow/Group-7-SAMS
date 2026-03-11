import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Subject } from '../models/subject.model';

@Injectable({
  providedIn: 'root',
})
export class SubjectService {
  private http = inject(HttpClient);
  private api = 'http://localhost:3000/subjects';

  getSubjects(): Observable<Subject[]> {
    return this.http.get<Subject[]>(this.api);
  }

  addSubject(subject: Subject): Observable<Subject> {
    return this.http.post<Subject>(this.api, subject);
  }

  updateSubject(subject: Subject): Observable<Subject> {
    return this.http.put<Subject>(`${this.api}/${subject.id}`, subject);
  }

  deleteSubject(id: number): Observable<any> {
    return this.http.delete(`${this.api}/${id}`);
  }
}
