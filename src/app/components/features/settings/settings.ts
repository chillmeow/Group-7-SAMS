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

  activeTab: 'login' | 'appearance' | 'account' = 'login';

  isDarkMode = false;
  savingUsername = false;
  savingPassword = false;

  usernameForm = {
    newUsername: '',
    currentPassword: '',
  };

  passwordForm = {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  };

  showUsernamePassword = false;
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();

    this.usernameForm.newUsername = this.currentUser?.username || '';

    const savedTheme = localStorage.getItem('sams-theme');
    this.isDarkMode = savedTheme === 'dark';

    document.body.classList.toggle('dark-mode', this.isDarkMode);
  }

  setTab(tab: 'login' | 'appearance' | 'account'): void {
    this.activeTab = tab;
  }

  getFullName(): string {
    return (
      `${this.currentUser?.firstName || ''} ${this.currentUser?.lastName || ''}`.trim() || 'User'
    );
  }

  getInitials(): string {
    const firstInitial = this.currentUser?.firstName?.charAt(0)?.toUpperCase() || '';
    const lastInitial = this.currentUser?.lastName?.charAt(0)?.toUpperCase() || '';

    return `${firstInitial}${lastInitial}` || 'U';
  }

  getRoleLabel(): string {
    const role = String(this.currentUser?.role || 'user').toLowerCase();

    if (role === 'admin') return 'Admin';
    if (role === 'teacher') return 'Teacher';
    if (role === 'student') return 'Student';
    if (role === 'parent') return 'Parent';

    return 'User';
  }

  getRoleIcon(): string {
    const role = String(this.currentUser?.role || '').toLowerCase();

    if (role === 'admin') return 'pi pi-shield';
    if (role === 'teacher') return 'pi pi-briefcase';
    if (role === 'student') return 'pi pi-graduation-cap';
    if (role === 'parent') return 'pi pi-users';

    return 'pi pi-user';
  }

  getRoleClass(): string {
    const role = String(this.currentUser?.role || '').toLowerCase();

    if (role === 'admin') return 'role-admin';
    if (role === 'teacher') return 'role-teacher';
    if (role === 'student') return 'role-student';
    if (role === 'parent') return 'role-parent';

    return 'role-user';
  }

  getStatusLabel(): string {
    return this.currentUser?.status === 'inactive' ? 'Inactive' : 'Active';
  }

  getUsernameLabel(): string {
    const role = String(this.currentUser?.role || '').toLowerCase();

    if (role === 'student') return 'Student Login Username';
    if (role === 'teacher') return 'Faculty Login Username';
    if (role === 'parent') return 'Parent Login Username';
    if (role === 'admin') return 'Admin Login Username';

    return 'Login Username';
  }

  getPortalAccessLabel(): string {
    const role = String(this.currentUser?.role || '').toLowerCase();

    if (role === 'admin') return 'Administrative access';
    if (role === 'teacher') return 'Faculty portal access';
    if (role === 'student') return 'Student portal access';
    if (role === 'parent') return 'Parent monitoring access';

    return 'System access';
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;

    document.body.classList.toggle('dark-mode', this.isDarkMode);
    localStorage.setItem('sams-theme', this.isDarkMode ? 'dark' : 'light');

    this.alertService.success(
      'Appearance updated',
      `SAMS is now using ${this.isDarkMode ? 'dark' : 'light'} mode.`,
    );
  }

  updateUsername(): void {
    if (!this.currentUser?.id) return;

    const newUsername = this.usernameForm.newUsername.trim();
    const currentPassword = this.usernameForm.currentPassword.trim();

    if (!newUsername || !currentPassword) {
      this.alertService.warning(
        'Missing fields',
        'Please enter your new username and current password.',
      );
      return;
    }

    if (newUsername.length < 4) {
      this.alertService.warning('Username too short', 'Username must be at least 4 characters.');
      return;
    }

    if (/\s/.test(newUsername)) {
      this.alertService.warning('Invalid username', 'Username must not contain spaces.');
      return;
    }

    if (currentPassword !== this.currentUser.defaultPassword) {
      this.alertService.error('Wrong password', 'Your current password is incorrect.');
      return;
    }

    if (newUsername === this.currentUser.username) {
      this.alertService.warning('No changes made', 'This is already your current username.');
      return;
    }

    this.savingUsername = true;

    this.api.updateUser(this.currentUser.id, { username: newUsername }).subscribe({
      next: (updatedUser) => {
        this.currentUser = this.authService.updateCurrentUser({
          username: newUsername,
          ...updatedUser,
        });

        this.usernameForm.currentPassword = '';
        this.savingUsername = false;

        this.alertService.success(
          'Username updated',
          'Your login username has been updated successfully.',
        );
      },
      error: () => {
        this.currentUser = this.authService.updateCurrentUser({ username: newUsername });
        this.usernameForm.currentPassword = '';
        this.savingUsername = false;

        this.alertService.warning(
          'Saved locally',
          'Username was updated in your current session only.',
        );
      },
    });
  }

  changePassword(): void {
    const currentPassword = this.passwordForm.currentPassword.trim();
    const newPassword = this.passwordForm.newPassword.trim();
    const confirmPassword = this.passwordForm.confirmPassword.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      this.alertService.warning('Missing fields', 'Please fill in all password fields.');
      return;
    }

    if (newPassword.length < 6) {
      this.alertService.warning(
        'Password too short',
        'New password must be at least 6 characters.',
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      this.alertService.error(
        'Password mismatch',
        'New password and confirm password do not match.',
      );
      return;
    }

    if (!this.currentUser?.id) return;

    if (currentPassword !== this.currentUser.defaultPassword) {
      this.alertService.error('Wrong password', 'Your current password is incorrect.');
      return;
    }

    if (newPassword === this.currentUser.defaultPassword) {
      this.alertService.warning(
        'No changes made',
        'Your new password must be different from your current password.',
      );
      return;
    }

    this.savingPassword = true;

    this.api
      .updateUser(this.currentUser.id, {
        defaultPassword: newPassword,
        mustChangePassword: false,
      })
      .subscribe({
        next: (updatedUser) => {
          this.currentUser = this.authService.updateCurrentUser({
            defaultPassword: newPassword,
            mustChangePassword: false,
            ...updatedUser,
          });

          this.savingPassword = false;
          this.passwordForm = {
            currentPassword: '',
            newPassword: '',
            confirmPassword: '',
          };

          this.alertService.success(
            'Password changed',
            'Your password has been updated successfully.',
          );
        },
        error: () => {
          this.savingPassword = false;
          this.alertService.error('Update failed', 'Could not update password. Please try again.');
        },
      });
  }
}
