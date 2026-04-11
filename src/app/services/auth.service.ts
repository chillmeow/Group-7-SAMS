import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, from, switchMap, map } from 'rxjs';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

import { auth, db } from '../firebase.config';
import { User, UserRole } from '../models/user.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly storageKey = 'sams_current_user';

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  login(email: string, password: string): Observable<User> {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    return from(signInWithEmailAndPassword(auth, normalizedEmail, normalizedPassword)).pipe(
      switchMap((cred) => {
        const uid = cred.user.uid;

        return from(getDoc(doc(db, 'users', uid))).pipe(
          map((userDoc) => {
            if (!userDoc.exists()) {
              throw new Error('firestore-user-not-found');
            }

            const data = userDoc.data() as Omit<User, 'id'>;

            const user: User = {
              id: uid,
              ...data,
            };

            if (this.isBrowser) {
              localStorage.setItem(this.storageKey, JSON.stringify(user));
            }

            return user;
          }),
        );
      }),
    );
  }

  logout(): void {
    signOut(auth).finally(() => {
      if (this.isBrowser) {
        localStorage.removeItem(this.storageKey);
      }

      this.router.navigate(['/login']);
    });
  }

  getCurrentUser(): User | null {
    if (!this.isBrowser) {
      return null;
    }

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
    const currentRole = this.getUserRole();
    return !!currentRole && allowedRoles.includes(currentRole);
  }

  clearSession(): void {
    if (this.isBrowser) {
      localStorage.removeItem(this.storageKey);
    }
  }
}
