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

  email = '';
  password = '';
  errorMessage = '';
  isLoading = false;
  showPassword = false;

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  login(): void {
    this.errorMessage = '';

    const email = this.email.trim().toLowerCase();
    const password = this.password.trim();

    if (!email || !password) {
      this.alertService.warning('Missing fields', 'Please enter your email and password.');
      return;
    }

    this.isLoading = true;

    this.authService.login(email, password).subscribe({
      next: () => {
        this.isLoading = false;
        this.alertService.success('Login successful', 'Welcome back!');
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        this.isLoading = false;

        console.error('LOGIN ERROR:', error);

        let message = 'Unable to login. Please try again.';

        if (error?.code === 'auth/invalid-credential') {
          message = 'Invalid email or password.';
        } else if (error?.code === 'auth/user-not-found') {
          message = 'No account found for this email.';
        } else if (error?.code === 'auth/wrong-password') {
          message = 'Incorrect password.';
        } else if (error?.code === 'auth/invalid-email') {
          message = 'Invalid email format.';
        } else if (error?.code === 'auth/too-many-requests') {
          message = 'Too many login attempts. Please wait a moment and try again.';
        } else if (error?.message === 'firestore-user-not-found') {
          message = 'Authentication worked, but no matching user profile was found in Firestore.';
        } else if (
          error?.code === 'permission-denied' ||
          error?.code === 'firestore/permission-denied'
        ) {
          message = 'Authentication worked, but Firestore denied access to the user profile.';
        } else if (error?.message) {
          message = error.message;
        }

        this.alertService.error('Login failed', message);
      },
    });
  }
}
