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
  activeTab: 'about' | 'edit' = 'about';
  saving = false;
  showPhotoViewer = false;

  coverColors = [
    'linear-gradient(135deg, #1e3a8a, #3b82f6)',
    'linear-gradient(135deg, #065f46, #10b981)',
    'linear-gradient(135deg, #7c2d12, #f97316)',
    'linear-gradient(135deg, #4c1d95, #8b5cf6)',
    'linear-gradient(135deg, #831843, #ec4899)',
    'linear-gradient(135deg, #0f172a, #334155)',
  ];
  selectedCover = 0;

  formData: Partial<User> = {
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    contactNumber: '',
    address: '',
    photoUrl: '',
  };

  ngOnInit() {
    this.currentUser = this.authService.getCurrentUser();
    const savedCover = localStorage.getItem('sams-cover-' + this.currentUser?.id);
    if (savedCover) this.selectedCover = parseInt(savedCover);
    if (this.currentUser) {
      this.formData = {
        firstName: this.currentUser.firstName || '',
        lastName: this.currentUser.lastName || '',
        email: this.currentUser.email || '',
        username: this.currentUser.username || '',
        contactNumber: this.currentUser.contactNumber || '',
        address: this.currentUser.address || '',
        photoUrl: this.currentUser.photoUrl || '',
      };
    }
  }

  getFullName(): string {
    return (
      `${this.currentUser?.firstName || ''} ${this.currentUser?.lastName || ''}`.trim() || 'User'
    );
  }

  getInitials(): string {
    const f = this.currentUser?.firstName?.charAt(0)?.toUpperCase() || '';
    const l = this.currentUser?.lastName?.charAt(0)?.toUpperCase() || '';
    return `${f}${l}` || 'U';
  }

  getRoleLabel(): string {
    const role = this.currentUser?.role || 'user';
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  getRoleColor(): string {
    const map: Record<string, string> = {
      admin: 'role-admin',
      teacher: 'role-teacher',
      student: 'role-student',
      parent: 'role-parent',
    };
    return map[this.currentUser?.role || ''] || 'role-admin';
  }

  getStatusLabel(): string {
    return this.currentUser?.status === 'inactive' ? 'Inactive' : 'Active';
  }

  getCoverStyle(): string {
    return this.coverColors[this.selectedCover];
  }

  selectCover(index: number) {
    this.selectedCover = index;
    localStorage.setItem('sams-cover-' + this.currentUser?.id, String(index));
  }

  hasPhoto(): boolean {
    return !!this.currentUser?.photoUrl;
  }

  openPhotoViewer() {
    if (!this.hasPhoto()) return;
    this.showPhotoViewer = true;
    document.body.style.overflow = 'hidden';
  }

  closePhotoViewer() {
    this.showPhotoViewer = false;
    document.body.style.overflow = '';
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.showPhotoViewer) this.closePhotoViewer();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      this.alertService.error('Invalid file', 'Please upload a PNG, JPG or WEBP image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.alertService.error('File too large', 'Please upload an image below 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.formData.photoUrl = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  removePhoto() {
    this.formData.photoUrl = '';
  }

  saveProfile() {
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
      photoUrl: this.formData.photoUrl?.trim(),
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
