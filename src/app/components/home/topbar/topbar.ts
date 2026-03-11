import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, HostListener, PLATFORM_ID, ViewChild, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { AlertService } from '../../../services/alert.service';
import { User } from '../../../models/user.model';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
})
export class Topbar {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  @ViewChild('notifRef') notifRef!: ElementRef;
  @ViewChild('profileRef') profileRef!: ElementRef;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  pageTitle = 'Dashboard';

  isSearchOpen = false;
  isNotifOpen = false;
  isProfileOpen = false;
  isDarkMode = false;

  currentUser: User | null = null;

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.updatePageTitle(this.router.url);

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.updatePageTitle(event.urlAfterRedirects);
      });
  }

  private updatePageTitle(url: string): void {
    const cleanUrl = url.split('?')[0].split('#')[0];
    const segment = cleanUrl.split('/').filter(Boolean).pop() || 'dashboard';

    const titleMap: Record<string, string> = {
      dashboard: 'Dashboard',
      students: 'Students',
      teachers: 'Teachers',
      parents: 'Parents',
      subjects: 'Subjects',
      sections: 'Sections',
      offerings: 'Class Offerings',
      'class-offerings': 'Class Offerings',
      attendance: 'Attendance',
      reports: 'Reports',
      notifications: 'Notifications',
      messages: 'Messages',
      settings: 'Settings',
    };

    this.pageTitle = titleMap[segment] || this.toTitleCase(segment);
  }

  private toTitleCase(value: string): string {
    return value.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  toggleSearch(): void {
    this.isSearchOpen = !this.isSearchOpen;

    if (this.isSearchOpen && isPlatformBrowser(this.platformId)) {
      setTimeout(() => this.searchInput?.nativeElement?.focus(), 0);
    }
  }

  toggleNotif(event: Event): void {
    event.stopPropagation();
    this.isNotifOpen = !this.isNotifOpen;
    this.isProfileOpen = false;
  }

  toggleProfile(event: Event): void {
    event.stopPropagation();
    this.isProfileOpen = !this.isProfileOpen;
    this.isNotifOpen = false;
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;

    if (isPlatformBrowser(this.platformId)) {
      this.document.body.classList.toggle('dark-mode', this.isDarkMode);
    }
  }

  getUserInitial(): string {
    if (!this.currentUser?.firstName) return 'U';
    return this.currentUser.firstName.charAt(0).toUpperCase();
  }

  getUserFullName(): string {
    if (!this.currentUser) return 'User';
    return `${this.currentUser.firstName} ${this.currentUser.lastName}`;
  }

  getUserRoleLabel(): string {
    const role = this.currentUser?.role || 'user';
    return role.charAt(0).toUpperCase() + role.slice(1);
  }

  async logout(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const confirmed = await this.alertService.confirm(
      'Logout?',
      'Are you sure you want to log out of your account?',
    );

    if (!confirmed) return;

    this.authService.logout();
    this.alertService.success('Logged out', 'You have been logged out successfully.');
  }

  @HostListener('document:click', ['$event'])
  handleOutsideClick(event: Event): void {
    const target = event.target as HTMLElement;

    if (this.notifRef && !this.notifRef.nativeElement.contains(target)) {
      this.isNotifOpen = false;
    }

    if (this.profileRef && !this.profileRef.nativeElement.contains(target)) {
      this.isProfileOpen = false;
    }
  }
}
