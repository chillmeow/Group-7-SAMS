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

  username = '';
  password = '';
  errorMessage = '';
  isLoading = false;
  showPassword = false;

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  login(): void {
    this.errorMessage = '';

    if (!this.username.trim() || !this.password.trim()) {
      this.alertService.warning('Missing fields', 'Please enter your username and password.');
      return;
    }

    this.isLoading = true;

    this.authService.login(this.username.trim(), this.password.trim()).subscribe({
      next: (user) => {
        this.isLoading = false;

        if (!user) {
          this.alertService.error('Login failed', 'Invalid username or password.');
          return;
        }

        this.alertService.success('Login successful', `Welcome back, ${user.firstName}!`);
        this.router.navigate(['/dashboard']);
      },
      error: () => {
        this.isLoading = false;
        this.alertService.error('Server error', 'Unable to login. Please try again.');
      },
    });
  }
}
