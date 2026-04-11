import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Section } from '../models/section.model';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SectionService {
  private http = inject(HttpClient);
  private api = 'http://localhost:3000/sections';

  getSections(): Observable<Section[]> {
    return this.http.get<Section[]>(this.api);
  }

  addSection(section: Section): Observable<Section> {
    return this.http.post<Section>(this.api, section);
  }

  updateSection(section: Section): Observable<Section> {
    return this.http.put<Section>(`${this.api}/${section.id}`, section);
  }

  deleteSection(id: number) {
    return this.http.delete(`${this.api}/${id}`);
  }
}
