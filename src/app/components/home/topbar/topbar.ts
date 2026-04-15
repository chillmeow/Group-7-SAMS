import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  PLATFORM_ID,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../../../services/auth.service';
import { AlertService } from '../../../services/alert.service';
import { ApiService, Notification } from '../../../services/api.service';
import { User } from '../../../models/user.model';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
})
export class Topbar implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);
  private readonly api = inject(ApiService);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  @ViewChild('notifRef') notifRef!: ElementRef;
  @ViewChild('profileRef') profileRef!: ElementRef;
  @ViewChild('searchRef') searchRef!: ElementRef;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  pageTitle = 'Dashboard';

  isSearchOpen = false;
  isNotifOpen = false;
  isProfileOpen = false;
  isDarkMode = false;

  searchQuery = '';

  currentUser: User | null = null;
  notifications: Notification[] = [];
  unreadCount = 0;
  isLoadingNotifications = false;

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.updatePageTitle(this.router.url);
    this.initializeTheme();
    this.loadNotifications();

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.updatePageTitle(event.urlAfterRedirects);
        this.currentUser = this.authService.getCurrentUser();
      });
  }

  private initializeTheme(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const savedTheme = localStorage.getItem('sams-theme');
    this.isDarkMode = savedTheme === 'dark';
    this.document.body.classList.toggle('dark-mode', this.isDarkMode);
  }

  private updatePageTitle(url: string): void {
    const cleanUrl = url.split('?')[0].split('#')[0];
    const segment = cleanUrl.split('/').filter(Boolean).pop() || 'dashboard';

    const titleMap: Record<string, string> = {
      dashboard: 'Dashboard',
      profile: 'Profile',
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

  loadNotifications(): void {
    if (!this.currentUser?.id) {
      this.notifications = [];
      this.unreadCount = 0;
      return;
    }

    this.isLoadingNotifications = true;

    this.api.getNotificationsByUser(this.currentUser.id).subscribe({
      next: (data) => {
        this.notifications = data;
        this.unreadCount = data.filter((item) => !item.read).length;
        this.isLoadingNotifications = false;
      },
      error: () => {
        this.notifications = [];
        this.unreadCount = 0;
        this.isLoadingNotifications = false;
      },
    });
  }

  toggleSearch(): void {
    this.isSearchOpen = !this.isSearchOpen;

    if (this.isSearchOpen) {
      this.isNotifOpen = false;
      this.isProfileOpen = false;

      if (isPlatformBrowser(this.platformId)) {
        setTimeout(() => this.searchInput?.nativeElement?.focus(), 0);
      }
    } else {
      this.searchQuery = '';
    }
  }

  clearSearch(event?: Event): void {
    event?.stopPropagation();
    this.searchQuery = '';
    this.searchInput?.nativeElement?.focus();
  }

  toggleNotif(event: Event): void {
    event.stopPropagation();
    this.isNotifOpen = !this.isNotifOpen;
    this.isProfileOpen = false;
    this.isSearchOpen = false;
  }

  toggleProfile(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    this.isProfileOpen = !this.isProfileOpen;
    this.isNotifOpen = false;
    this.isSearchOpen = false;
  }

  goToProfile(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    this.isProfileOpen = false;
    this.isNotifOpen = false;
    this.isSearchOpen = false;

    this.router.navigateByUrl('/profile');
  }

  openSettings(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    this.isProfileOpen = false;
    this.isNotifOpen = false;
    this.isSearchOpen = false;

    this.alertService.warning('Settings not ready', 'Settings page is not connected yet.');
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;

    if (!isPlatformBrowser(this.platformId)) return;

    this.document.body.classList.toggle('dark-mode', this.isDarkMode);
    localStorage.setItem('sams-theme', this.isDarkMode ? 'dark' : 'light');
  }

  markAsRead(notification: Notification, event?: Event): void {
    event?.stopPropagation();

    if (notification.read) return;

    this.api.markNotificationAsRead(notification.id).subscribe({
      next: () => {
        notification.read = true;
        this.unreadCount = this.notifications.filter((item) => !item.read).length;
      },
    });
  }

  markAllAsRead(event: Event): void {
    event.stopPropagation();

    const unreadItems = this.notifications.filter((item) => !item.read);

    unreadItems.forEach((item) => {
      this.api.markNotificationAsRead(item.id).subscribe({
        next: () => {
          item.read = true;
          this.unreadCount = this.notifications.filter((notif) => !notif.read).length;
        },
      });
    });
  }

  removeNotification(id: string | number, event: Event): void {
    event.stopPropagation();

    this.api.deleteNotification(id).subscribe({
      next: () => {
        this.notifications = this.notifications.filter((item) => item.id !== id);
        this.unreadCount = this.notifications.filter((item) => !item.read).length;
      },
    });
  }

  getNotificationIcon(type: Notification['type']): string {
    switch (type) {
      case 'success':
        return 'pi pi-check-circle';
      case 'warning':
        return 'pi pi-exclamation-triangle';
      case 'error':
        return 'pi pi-times-circle';
      default:
        return 'pi pi-bell';
    }
  }

  getUserInitial(): string {
    if (!this.currentUser?.firstName) return 'U';
    return this.currentUser.firstName.charAt(0).toUpperCase();
  }

  getUserFullName(): string {
    if (!this.currentUser) return 'User';
    return `${this.currentUser.firstName} ${this.currentUser.lastName}`.trim();
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
      'Are you sure you want to end your session?',
    );

    if (!confirmed) return;

    this.authService.logout();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as Node;

    if (this.notifRef && !this.notifRef.nativeElement.contains(target)) {
      this.isNotifOpen = false;
    }

    if (this.profileRef && !this.profileRef.nativeElement.contains(target)) {
      this.isProfileOpen = false;
    }

    if (this.searchRef && !this.searchRef.nativeElement.contains(target)) {
      this.isSearchOpen = false;
      this.searchQuery = '';
    }
  }
}
