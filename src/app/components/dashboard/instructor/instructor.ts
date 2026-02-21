import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-instructor',
  templateUrl: './instructor.html',
  styleUrl: './instructor.scss',
})
export class Instructor implements OnInit {
  stats = {
    subjects: 0,
    sections: 0,
    students: 0,
    today: 0,
    pending: 0,
  };

  constructor(
    private http: HttpClient,
    private router: Router,
    private auth: AuthService,
  ) {}

  ngOnInit() {
    this.loadStats();
  }

  loadStats() {
    this.http
      .get<any[]>('http://localhost:3000/subjects')
      .subscribe((res) => (this.stats.subjects = res.length));

    this.http
      .get<any[]>('http://localhost:3000/sections')
      .subscribe((res) => (this.stats.sections = res.length));

    this.http
      .get<any[]>('http://localhost:3000/students')
      .subscribe((res) => (this.stats.students = res.length));

    this.http
      .get<any[]>('http://localhost:3000/classesToday')
      .subscribe((res) => (this.stats.today = res.length));

    this.http
      .get<any[]>('http://localhost:3000/pendingAttendance')
      .subscribe((res) => (this.stats.pending = res.length));
  }

  // ✅ Use AuthService logout
  logout() {
    this.auth.logout();
  }
}
