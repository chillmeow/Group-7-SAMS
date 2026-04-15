import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, inject } from '@angular/core';
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
  saving = false;
  selectedImageName = '';
  showPhotoViewer = false;

  formData: Partial<User> = {
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    contactNumber: '',
    address: '',
    photoUrl: '',
  };

  ngOnInit(): void {
    const user = this.authService.getCurrentUser();
    this.currentUser = user;

    if (user) {
      this.formData = {
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        username: user.username || '',
        contactNumber: user.contactNumber || '',
        address: user.address || '',
        photoUrl: user.photoUrl || '',
      };
    }
  }

  getFullName(): string {
    const first = this.formData.firstName?.trim() || this.currentUser?.firstName || '';
    const last = this.formData.lastName?.trim() || this.currentUser?.lastName || '';
    return `${first} ${last}`.trim() || 'User';
  }

  getRoleLabel(): string {
    const role = this.currentUser?.role || 'user';
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  getStatusLabel(): string {
    return this.currentUser?.status === 'inactive' ? 'Inactive' : 'Active';
  }

  getInitials(): string {
    const first = this.formData.firstName?.charAt(0)?.toUpperCase() || '';
    const last = this.formData.lastName?.charAt(0)?.toUpperCase() || '';
    return `${first}${last}` || 'U';
  }

  hasPhoto(): boolean {
    return !!this.formData.photoUrl;
  }

  openPhotoViewer(): void {
    if (!this.formData.photoUrl) return;
    this.showPhotoViewer = true;
    document.body.style.overflow = 'hidden';
  }

  closePhotoViewer(): void {
    this.showPhotoViewer = false;
    document.body.style.overflow = '';
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showPhotoViewer) {
      this.closePhotoViewer();
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      this.alertService.error('Invalid file', 'Please upload a PNG, JPG, JPEG, or WEBP image.');
      input.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      this.alertService.error('File too large', 'Please upload an image below 2MB.');
      input.value = '';
      return;
    }

    this.selectedImageName = file.name;

    const reader = new FileReader();
    reader.onload = () => {
      this.formData.photoUrl = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  removePhoto(): void {
    this.formData.photoUrl = '';
    this.selectedImageName = '';
  }

  saveProfile(): void {
    if (!this.currentUser?.id) {
      this.alertService.error('Save failed', 'No logged-in user found.');
      return;
    }

    const payload: Partial<User> = {
      firstName: this.formData.firstName?.trim() || '',
      lastName: this.formData.lastName?.trim() || '',
      email: this.formData.email?.trim() || '',
      username: this.formData.username?.trim() || '',
      contactNumber: this.formData.contactNumber?.trim() || '',
      address: this.formData.address?.trim() || '',
      photoUrl: this.formData.photoUrl?.trim() || '',
    };

    if (!payload.firstName || !payload.lastName || !payload.email) {
      this.alertService.warning(
        'Missing required fields',
        'First name, last name, and email are required.',
      );
      return;
    }

    this.saving = true;

    this.api.updateUser(this.currentUser.id, payload).subscribe({
      next: (updatedUser) => {
        const mergedUser = this.authService.updateCurrentUser({
          ...this.currentUser,
          ...payload,
          ...updatedUser,
        });

        this.currentUser = mergedUser;
        this.saving = false;

        this.alertService.success('Profile updated', 'Your profile has been updated successfully.');
      },
      error: () => {
        const mergedUser = this.authService.updateCurrentUser(payload);
        this.currentUser = mergedUser;
        this.saving = false;

        this.alertService.warning(
          'Saved to session only',
          'The profile updated locally, but the database update did not complete.',
        );
      },
    });
  }
}
