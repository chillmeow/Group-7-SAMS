import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ClassOffering } from '../models/class-offering.model';

@Injectable({
  providedIn: 'root',
})
export class ClassOfferingService {
  private http = inject(HttpClient);
  private api = 'http://localhost:3000/classOfferings';

  getClassOfferings(): Observable<ClassOffering[]> {
    return this.http.get<ClassOffering[]>(this.api);
  }

  addClassOffering(offering: ClassOffering): Observable<ClassOffering> {
    return this.http.post<ClassOffering>(this.api, offering);
  }

  updateClassOffering(offering: ClassOffering): Observable<ClassOffering> {
    return this.http.put<ClassOffering>(`${this.api}/${offering.id}`, offering);
  }

  deleteClassOffering(id: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/${id}`);
  }
}
