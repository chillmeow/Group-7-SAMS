import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ApiService } from '../../../services/api.service';
import { AuthService } from '../../../services/auth.service';
import { AlertService } from '../../../services/alert.service';
import { User } from '../../../models/user.model';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfileComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly alertService = inject(AlertService);

  currentUser: User | null = null;
  activeTab: 'about' | 'edit' = 'about';
  saving = false;

  formData: Partial<User> = {
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    contactNumber: '',
    address: '',
  };

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();

    if (this.currentUser) {
      this.formData = {
        firstName: this.currentUser.firstName || '',
        lastName: this.currentUser.lastName || '',
        email: this.currentUser.email || '',
        username: this.currentUser.username || '',
        contactNumber: this.currentUser.contactNumber || '',
        address: this.currentUser.address || '',
      };
    }
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

  getRoleColor(): string {
    const role = String(this.currentUser?.role || '').toLowerCase();

    const map: Record<string, string> = {
      admin: 'role-admin',
      teacher: 'role-teacher',
      student: 'role-student',
      parent: 'role-parent',
    };

    return map[role] || 'role-user';
  }

  getRoleIcon(): string {
    const role = String(this.currentUser?.role || '').toLowerCase();

    if (role === 'admin') return 'pi pi-shield';
    if (role === 'teacher') return 'pi pi-briefcase';
    if (role === 'student') return 'pi pi-graduation-cap';
    if (role === 'parent') return 'pi pi-users';

    return 'pi pi-user';
  }

  getStatusLabel(): string {
    return this.currentUser?.status === 'inactive' ? 'Inactive' : 'Active';
  }

  getIdentifierLabel(): string {
    const role = String(this.currentUser?.role || '').toLowerCase();

    if (role === 'student') return 'Student Number';
    if (role === 'teacher') return 'Faculty Username';
    if (role === 'parent') return 'Parent Username';
    if (role === 'admin') return 'Admin Username';

    return 'Username';
  }

  getRoleDescription(): string {
    const role = String(this.currentUser?.role || '').toLowerCase();

    if (role === 'admin') {
      return 'Manages institutional records, users, sections, reports, and system-wide attendance monitoring.';
    }

    if (role === 'teacher') {
      return 'Handles assigned classes, attendance sessions, student records, and faculty reports.';
    }

    if (role === 'student') {
      return 'Submits attendance, checks class attendance history, and monitors personal attendance records.';
    }

    if (role === 'parent') {
      return 'Monitors linked student attendance records and receives attendance-related updates.';
    }

    return 'Uses the system based on assigned account access.';
  }

  getPortalScope(): string {
    const role = String(this.currentUser?.role || '').toLowerCase();

    if (role === 'admin') return 'Administrative access';
    if (role === 'teacher') return 'Faculty portal access';
    if (role === 'student') return 'Student portal access';
    if (role === 'parent') return 'Parent monitoring access';

    return 'User portal access';
  }

  getCoverStyle(): string {
    const role = String(this.currentUser?.role || '').toLowerCase();

    if (role === 'admin') {
      return 'linear-gradient(135deg, #1e1b4b 0%, #2563eb 55%, #f59e0b 100%)';
    }

    if (role === 'teacher') {
      return 'linear-gradient(135deg, #064e3b 0%, #2563eb 60%, #0ea5e9 100%)';
    }

    if (role === 'student') {
      return 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 58%, #60a5fa 100%)';
    }

    if (role === 'parent') {
      return 'linear-gradient(135deg, #7c2d12 0%, #f59e0b 58%, #2563eb 100%)';
    }

    return 'linear-gradient(135deg, #0f172a 0%, #2563eb 100%)';
  }

  switchToEdit(): void {
    this.activeTab = 'edit';
    this.formData = {
      firstName: this.currentUser?.firstName || '',
      lastName: this.currentUser?.lastName || '',
      email: this.currentUser?.email || '',
      username: this.currentUser?.username || '',
      contactNumber: this.currentUser?.contactNumber || '',
      address: this.currentUser?.address || '',
    };
  }

  cancelEdit(): void {
    this.activeTab = 'about';

    this.formData = {
      firstName: this.currentUser?.firstName || '',
      lastName: this.currentUser?.lastName || '',
      email: this.currentUser?.email || '',
      username: this.currentUser?.username || '',
      contactNumber: this.currentUser?.contactNumber || '',
      address: this.currentUser?.address || '',
    };
  }

  saveProfile(): void {
    if (!this.currentUser?.id) return;

    if (!this.formData.firstName || !this.formData.lastName || !this.formData.email) {
      this.alertService.warning('Missing fields', 'First name, last name, and email are required.');
      return;
    }

    this.saving = true;

    const payload: Partial<User> = {
      firstName: this.formData.firstName?.trim(),
      lastName: this.formData.lastName?.trim(),
      email: this.formData.email?.trim(),
      username: this.formData.username?.trim(),
      contactNumber: this.formData.contactNumber?.trim(),
      address: this.formData.address?.trim(),
    };

    this.api.updateUser(this.currentUser.id, payload).subscribe({
      next: (updatedUser) => {
        this.currentUser = this.authService.updateCurrentUser({ ...payload, ...updatedUser });
        this.saving = false;
        this.activeTab = 'about';
        this.alertService.success('Profile updated', 'Your profile has been saved successfully.');
      },
      error: () => {
        this.currentUser = this.authService.updateCurrentUser(payload);
        this.saving = false;
        this.activeTab = 'about';
        this.alertService.warning('Saved locally', 'Profile updated in session only.');
      },
    });
  }
}
