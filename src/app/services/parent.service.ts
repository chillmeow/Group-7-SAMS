import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Parent } from '../models/parent.model';

@Injectable({
  providedIn: 'root',
})
export class ParentService {
  private http = inject(HttpClient);
  private api = 'http://localhost:3000/parents';

  getParents(): Observable<Parent[]> {
    return this.http.get<Parent[]>(this.api);
  }

  addParent(parent: Parent): Observable<Parent> {
    return this.http.post<Parent>(this.api, parent);
  }

  updateParent(parent: Parent): Observable<Parent> {
    return this.http.put<Parent>(`${this.api}/${parent.id}`, parent);
  }

  deleteParent(id: number): Observable<any> {
    return this.http.delete(`${this.api}/${id}`);
  }
}
