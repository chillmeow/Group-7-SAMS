import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, from, map, switchMap, throwError, catchError } from 'rxjs';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';

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

  login(emailOrUsername: string, password: string, rememberMe = false): Observable<User> {
    const loginInput = emailOrUsername.trim();
    const normalizedPassword = password.trim();

    const firebaseEmail = loginInput.toLowerCase();

    return this.loginWithFirebase(firebaseEmail, normalizedPassword, rememberMe).pipe(
      catchError(() =>
        this.loginWithInstitutionalAccount(loginInput, normalizedPassword, rememberMe),
      ),
    );
  }

  private loginWithFirebase(
    email: string,
    password: string,
    rememberMe: boolean,
  ): Observable<User> {
    const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;

    return from(setPersistence(auth, persistence)).pipe(
      switchMap(() => from(signInWithEmailAndPassword(auth, email, password))),
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

            this.saveSession(user, rememberMe);
            return user;
          }),
        );
      }),
    );
  }

  private loginWithInstitutionalAccount(
    emailOrUsername: string,
    password: string,
    rememberMe: boolean,
  ): Observable<User> {
    const usersRef = collection(db, 'users');

    const usernameQuery = query(usersRef, where('username', '==', emailOrUsername));
    const emailQuery = query(usersRef, where('email', '==', emailOrUsername.toLowerCase()));

    return from(getDocs(usernameQuery)).pipe(
      switchMap((usernameSnapshot) => {
        if (!usernameSnapshot.empty) {
          const userDoc = usernameSnapshot.docs[0];
          return from([this.buildInstitutionalUser(userDoc.id, userDoc.data(), password)]);
        }

        return from(getDocs(emailQuery)).pipe(
          switchMap((emailSnapshot) => {
            if (emailSnapshot.empty) {
              return throwError(() => new Error('invalid-login'));
            }

            const userDoc = emailSnapshot.docs[0];
            return from([this.buildInstitutionalUser(userDoc.id, userDoc.data(), password)]);
          }),
        );
      }),
      map((user) => {
        this.saveSession(user, rememberMe);
        return user;
      }),
    );
  }

  private buildInstitutionalUser(
    id: string,
    data: Record<string, unknown>,
    password: string,
  ): User {
    const user = {
      id,
      ...(data as Omit<User, 'id'>),
    } as User;

    if (user.status === 'inactive') {
      throw new Error('account-inactive');
    }

    if (!user.defaultPassword || user.defaultPassword !== password) {
      throw new Error('invalid-password');
    }

    return user;
  }

  logout(): void {
    signOut(auth).finally(() => {
      this.removeSession();
      this.router.navigate(['/login']);
    });
  }

  getCurrentUser(): User | null {
    if (!this.isBrowser) {
      return null;
    }

    const sessionUser = this.getStoredUser(sessionStorage);

    if (sessionUser) {
      return sessionUser;
    }

    return this.getStoredUser(localStorage);
  }

  updateCurrentUser(partial: Partial<User>): User | null {
    const current = this.getCurrentUser();
    const activeStorage = this.getActiveStorage();

    if (!current || !activeStorage) {
      return current;
    }

    const updatedUser: User = {
      ...current,
      ...partial,
    };

    activeStorage.setItem(this.storageKey, JSON.stringify(updatedUser));
    return updatedUser;
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
    this.removeSession();
  }

  getCurrentUserId(): string | null {
    return this.getCurrentUser()?.id ?? null;
  }

  getLinkedStudentId(): string | null {
    const user = this.getCurrentUser();
    return this.extractLinkedId(user, [
      'studentId',
      'linkedStudentId',
      'studentProfileId',
      'profileId',
    ]);
  }

  getLinkedFacultyId(): string | null {
    const user = this.getCurrentUser();
    return this.extractLinkedId(user, [
      'facultyId',
      'teacherId',
      'instructorId',
      'linkedFacultyId',
      'linkedTeacherId',
      'facultyProfileId',
      'teacherProfileId',
      'profileId',
    ]);
  }

  getLinkedParentId(): string | null {
    const user = this.getCurrentUser();
    return this.extractLinkedId(user, [
      'parentId',
      'linkedParentId',
      'parentProfileId',
      'profileId',
    ]);
  }

  private extractLinkedId(user: User | null, possibleKeys: string[]): string | null {
    if (!user) {
      return null;
    }

    const source = user as unknown as Record<string, unknown>;

    for (const key of possibleKeys) {
      const value = source[key];

      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private saveSession(user: User, rememberMe: boolean): void {
    if (!this.isBrowser) {
      return;
    }

    const serializedUser = JSON.stringify(user);

    if (rememberMe) {
      localStorage.setItem(this.storageKey, serializedUser);
      sessionStorage.removeItem(this.storageKey);
      return;
    }

    sessionStorage.setItem(this.storageKey, serializedUser);
    localStorage.removeItem(this.storageKey);
  }

  private removeSession(): void {
    if (!this.isBrowser) {
      return;
    }

    localStorage.removeItem(this.storageKey);
    sessionStorage.removeItem(this.storageKey);
  }

  private getActiveStorage(): Storage | null {
    if (!this.isBrowser) {
      return null;
    }

    if (sessionStorage.getItem(this.storageKey)) {
      return sessionStorage;
    }

    if (localStorage.getItem(this.storageKey)) {
      return localStorage;
    }

    return null;
  }

  private getStoredUser(storage: Storage): User | null {
    const raw = storage.getItem(this.storageKey);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as User;
    } catch {
      storage.removeItem(this.storageKey);
      return null;
    }
  }
}
