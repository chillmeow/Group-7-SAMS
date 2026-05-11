import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, HostListener, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../services/auth.service';
import { AlertService } from '../../../services/alert.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alertService = inject(AlertService);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly rememberPreferenceKey = 'sams_login_remember_me';
  private readonly rememberedLoginIdKey = 'sams_remembered_login_id';

  loginId = '';
  password = '';
  errorMessage = '';
  isLoading = false;
  showPassword = false;
  rememberMe = false;

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.loadRememberedLogin();
  }

  @HostListener('document:keydown.enter', ['$event'])
  handleEnterKey(event: Event): void {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }

    if (this.isLoading || event.repeat) {
      return;
    }

    if (this.isSweetAlertOpen()) {
      return;
    }

    event.preventDefault();
    this.login();
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  onRememberMeChange(): void {
    if (!this.isBrowser) {
      return;
    }

    if (this.rememberMe) {
      localStorage.setItem(this.rememberPreferenceKey, 'true');

      const currentLoginId = this.loginId.trim();

      if (currentLoginId) {
        localStorage.setItem(this.rememberedLoginIdKey, currentLoginId);
      }

      return;
    }

    localStorage.removeItem(this.rememberPreferenceKey);
    localStorage.removeItem(this.rememberedLoginIdKey);
  }

  login(): void {
    if (this.isLoading) {
      return;
    }

    this.errorMessage = '';

    const loginId = this.loginId.trim();
    const password = this.password.trim();

    if (!loginId || !password) {
      this.alertService.warning('Missing fields', 'Please enter your username/email and password.');
      return;
    }

    this.isLoading = true;

    this.authService.login(loginId, password, this.rememberMe).subscribe({
      next: () => {
        this.isLoading = false;
        this.saveRememberedLogin(loginId);
        this.alertService.success('Login successful', 'Welcome back!');
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        this.isLoading = false;

        let message = 'Unable to login. Please try again.';

        if (error?.message === 'invalid-login') {
          message = 'No account found for this username or email.';
        } else if (error?.message === 'invalid-password') {
          message = 'Incorrect password.';
        } else if (error?.message === 'account-inactive') {
          message = 'This account is inactive.';
        } else if (error?.message) {
          message = error.message;
        }

        this.alertService.error('Login failed', message);
      },
    });
  }

  private loadRememberedLogin(): void {
    if (!this.isBrowser) {
      return;
    }

    const shouldRemember = localStorage.getItem(this.rememberPreferenceKey) === 'true';

    this.rememberMe = shouldRemember;

    if (shouldRemember) {
      this.loginId = localStorage.getItem(this.rememberedLoginIdKey) || '';
    }
  }

  private saveRememberedLogin(loginId: string): void {
    if (!this.isBrowser) {
      return;
    }

    if (this.rememberMe) {
      localStorage.setItem(this.rememberPreferenceKey, 'true');
      localStorage.setItem(this.rememberedLoginIdKey, loginId);
      return;
    }

    localStorage.removeItem(this.rememberPreferenceKey);
    localStorage.removeItem(this.rememberedLoginIdKey);
  }

  private isSweetAlertOpen(): boolean {
    if (!this.isBrowser) {
      return false;
    }

    return !!document.querySelector('.swal2-container.swal2-shown');
  }
}
