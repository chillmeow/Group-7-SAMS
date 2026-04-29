import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
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
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alertService = inject(AlertService);

  loginId = '';
  password = '';
  errorMessage = '';
  isLoading = false;
  showPassword = false;
  rememberMe = false;

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  login(): void {
    this.errorMessage = '';

    const loginId = this.loginId.trim();
    const password = this.password.trim();

    if (!loginId || !password) {
      this.alertService.warning('Missing fields', 'Please enter your username/email and password.');
      return;
    }

    this.isLoading = true;

    this.authService.login(loginId, password).subscribe({
      next: () => {
        this.isLoading = false;
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
}
