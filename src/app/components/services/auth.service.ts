import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  constructor(
    private http: HttpClient,
    private router: Router,
  ) {}

  login(username: string, password: string) {
    this.http
      .get<any[]>(`http://localhost:3000/users?username=${username}&password=${password}`)
      .subscribe((users) => {
        if (users.length === 0) {
          alert('Invalid credentials');
          return;
        }

        const user = users[0];

        // save session
        localStorage.setItem('user', JSON.stringify(user));

        if (user.role === 'instructor') this.router.navigate(['/instructor']);
        else if (user.role === 'student') this.router.navigate(['/student']);
        else if (user.role === 'parent') this.router.navigate(['/parent']);
      });
  }

  logout() {
    localStorage.removeItem('user');
    this.router.navigate(['/login']);
  }
}
