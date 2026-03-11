import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, map, tap } from 'rxjs';
import { User, UserRole } from '../models/user.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly apiUrl = 'http://localhost:3000';
  private readonly storageKey = 'sams_current_user';

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  login(username: string, password: string): Observable<User | null> {
    return this.http
      .get<User[]>(`${this.apiUrl}/users`, {
        params: {
          username,
          password,
        },
      })
      .pipe(
        map((users) => (users.length ? users[0] : null)),
        tap((user) => {
          if (user && this.isBrowser) {
            localStorage.setItem(this.storageKey, JSON.stringify(user));
          }
        }),
      );
  }

  logout(): void {
    if (this.isBrowser) {
      localStorage.removeItem(this.storageKey);
    }
    this.router.navigate(['/login']);
  }

  getCurrentUser(): User | null {
    if (!this.isBrowser) return null;

    const raw = localStorage.getItem(this.storageKey);
    return raw ? (JSON.parse(raw) as User) : null;
  }

  getUserRole(): UserRole | null {
    return this.getCurrentUser()?.role ?? null;
  }

  isLoggedIn(): boolean {
    return !!this.getCurrentUser();
  }

  hasRole(allowedRoles: UserRole[]): boolean {
    const role = this.getUserRole();
    return !!role && allowedRoles.includes(role);
  }
}
