import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { ApiService } from '../../../services/api.service';
import { AlertService } from '../../../services/alert.service';
import { User } from '../../../models/user.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly alertService = inject(AlertService);

  currentUser: User | null = null;
  activeTab: 'password' | 'appearance' | 'account' = 'password';

  isDarkMode = false;
  saving = false;

  passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  };

  showCurrent = false;
  showNew = false;
  showConfirm = false;

  ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();
    const saved = localStorage.getItem('sams-theme');
    this.isDarkMode = saved === 'dark';
  }

  setTab(tab: 'password' | 'appearance' | 'account') {
    this.activeTab = tab;
  }

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    document.body.classList.toggle('dark-mode', this.isDarkMode);
    localStorage.setItem('sams-theme', this.isDarkMode ? 'dark' : 'light');
    this.alertService.success(
      'Theme updated',
      `Switched to ${this.isDarkMode ? 'dark' : 'light'} mode.`,
    );
  }

  async changePassword() {
    const { currentPassword, newPassword, confirmPassword } = this.passwordForm;

    if (!currentPassword || !newPassword || !confirmPassword) {
      this.alertService.warning('Missing fields', 'Please fill in all password fields.');
      return;
    }

    if (newPassword.length < 6) {
      this.alertService.warning('Too short', 'New password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      this.alertService.error('Mismatch', 'New password and confirm password do not match.');
      return;
    }

    if (!this.currentUser?.id) return;

    if (currentPassword !== this.currentUser.defaultPassword) {
      this.alertService.error('Wrong password', 'Your current password is incorrect.');
      return;
    }

    this.saving = true;

    this.api
      .updateUser(this.currentUser.id, {
        defaultPassword: newPassword,
        mustChangePassword: false,
      })
      .subscribe({
        next: () => {
          this.authService.updateCurrentUser({
            defaultPassword: newPassword,
            mustChangePassword: false,
          });
          this.currentUser = this.authService.getCurrentUser();
          this.saving = false;
          this.passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
          this.alertService.success(
            'Password changed',
            'Your password has been updated successfully.',
          );
        },
        error: () => {
          this.saving = false;
          this.alertService.error('Failed', 'Could not update password. Please try again.');
        },
      });
  }

  async deactivateAccount() {
    const confirmed = await this.alertService.confirm(
      'Deactivate Account?',
      'This will mark your account as inactive. You will be logged out.',
    );
    if (!confirmed || !this.currentUser?.id) return;

    this.api.updateUser(this.currentUser.id, { status: 'inactive' }).subscribe({
      next: () => {
        this.alertService.success('Account deactivated', 'Your account has been deactivated.');
        setTimeout(() => this.authService.logout(), 1500);
      },
      error: () => {
        this.alertService.error('Failed', 'Could not deactivate account. Please try again.');
      },
    });
  }

  getRoleLabel(): string {
    const role = this.currentUser?.role || 'user';
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  getStatusLabel(): string {
    return this.currentUser?.status === 'inactive' ? 'Inactive' : 'Active';
  }
}
