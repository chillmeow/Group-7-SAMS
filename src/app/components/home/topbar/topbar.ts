import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  PLATFORM_ID,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';

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
export class Topbar implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly alertService = inject(AlertService);
  private readonly api = inject(ApiService);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private notificationsSubscription: Subscription | null = null;

  @Input() isSidebarCollapsed = false;
  @Input() isMobile = false;
  @Input() isMobileSidebarOpen = false;

  @Output() menuToggle = new EventEmitter<void>();

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
        this.loadNotifications();
      });
  }

  ngOnDestroy(): void {
    this.notificationsSubscription?.unsubscribe();
    this.notificationsSubscription = null;
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
      teachers: 'Instructors',
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
      faqs: 'FAQs',
    };

    this.pageTitle = titleMap[segment] || this.toTitleCase(segment);
  }

  private toTitleCase(value: string): string {
    return value.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  onMenuToggle(): void {
    this.menuToggle.emit();
  }

  getMenuButtonLabel(): string {
    if (this.isMobile) {
      return this.isMobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu';
    }

    return this.isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
  }

  getMenuIconClass(): string {
    if (this.isMobile) {
      return this.isMobileSidebarOpen ? 'pi-times' : 'pi-bars';
    }

    return this.isSidebarCollapsed ? 'pi-bars' : 'pi-angle-left';
  }

  loadNotifications(): void {
    this.notificationsSubscription?.unsubscribe();
    this.notificationsSubscription = null;

    if (!this.currentUser?.id) {
      this.notifications = [];
      this.unreadCount = 0;
      return;
    }

    this.isLoadingNotifications = true;

    this.notificationsSubscription = this.api
      .getNotificationsByUser(this.currentUser.id)
      .subscribe({
        next: (data) => {
          this.notifications = data ?? [];
          this.unreadCount = this.notifications.filter((item) => !item.read).length;
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

    this.closeAllDropdowns();
    this.router.navigateByUrl('/profile');
  }

  openSettings(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    this.closeAllDropdowns();
    this.router.navigateByUrl('/settings');
  }

  openFaqs(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();

    this.closeAllDropdowns();
    this.router.navigateByUrl('/faqs');
  }

  private closeAllDropdowns(): void {
    this.isProfileOpen = false;
    this.isNotifOpen = false;
    this.isSearchOpen = false;
    this.searchQuery = '';
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;

    if (!isPlatformBrowser(this.platformId)) return;

    this.document.body.classList.toggle('dark-mode', this.isDarkMode);
    localStorage.setItem('sams-theme', this.isDarkMode ? 'dark' : 'light');
  }

  markAsRead(notification: Notification, event?: Event): void {
    event?.stopPropagation();

    if (notification.read || !notification.id) return;

    this.api.markNotificationAsRead(notification.id).subscribe({
      next: (updated) => {
        notification.read = updated.read;
        notification.isRead = updated.isRead;
        this.unreadCount = this.notifications.filter((item) => !item.read).length;
      },
      error: () => {
        this.alertService.warning(
          'Notification update failed',
          'Unable to mark as read right now.',
        );
      },
    });
  }

  openNotification(notification: Notification, event?: Event): void {
    event?.stopPropagation();

    if (!notification.read && notification.id) {
      this.markAsRead(notification);
    }

    this.closeAllDropdowns();

    if (notification.link) {
      this.router.navigateByUrl(notification.link);
      return;
    }

    this.router.navigateByUrl('/notifications');
  }

  viewAllNotifications(event: Event): void {
    event.stopPropagation();
    this.closeAllDropdowns();
    this.router.navigateByUrl('/notifications');
  }

  markAllAsRead(event: Event): void {
    event.stopPropagation();

    const unreadItems = this.notifications.filter((item) => !item.read && item.id);

    unreadItems.forEach((item) => {
      this.api.markNotificationAsRead(item.id!).subscribe({
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
      error: () => {
        this.alertService.warning('Delete failed', 'Unable to remove notification right now.');
      },
    });
  }

  getNotificationIcon(type: Notification['type'] | string | undefined): string {
    const normalizedType = this.normalizeNotificationType(type);

    switch (normalizedType) {
      case 'attendance':
        return 'pi pi-check-circle';
      case 'request':
        return 'pi pi-clock';
      case 'report':
        return 'pi pi-chart-bar';
      case 'account':
        return 'pi pi-user';
      case 'system':
        return 'pi pi-cog';
      case 'success':
        return 'pi pi-check-circle';
      case 'warning':
        return 'pi pi-exclamation-triangle';
      case 'error':
        return 'pi pi-times-circle';
      case 'message':
        return 'pi pi-comments';
      case 'info':
        return 'pi pi-info-circle';
      default:
        return 'pi pi-bell';
    }
  }

  getNotificationToneClass(type: Notification['type'] | string | undefined): string {
    const normalizedType = this.normalizeNotificationType(type);

    switch (normalizedType) {
      case 'attendance':
        return 'notif-icon-attendance';
      case 'request':
        return 'notif-icon-request';
      case 'report':
        return 'notif-icon-report';
      case 'account':
        return 'notif-icon-account';
      case 'system':
        return 'notif-icon-system';
      case 'success':
        return 'notif-icon-success';
      case 'warning':
        return 'notif-icon-warning';
      case 'error':
        return 'notif-icon-error';
      case 'message':
        return 'notif-icon-message';
      case 'info':
        return 'notif-icon-info';
      default:
        return 'notif-icon-default';
    }
  }

  getNotificationTypeLabel(type: Notification['type'] | string | undefined): string {
    const normalizedType = this.normalizeNotificationType(type);

    switch (normalizedType) {
      case 'attendance':
        return 'Attendance';
      case 'request':
        return 'Request';
      case 'report':
        return 'Report';
      case 'account':
        return 'Account';
      case 'system':
        return 'System';
      case 'success':
        return 'Success';
      case 'warning':
        return 'Alert';
      case 'error':
        return 'Error';
      case 'message':
        return 'Message';
      case 'info':
        return 'Info';
      default:
        return 'Notification';
    }
  }

  private normalizeNotificationType(type: Notification['type'] | string | undefined): string {
    return String(type || 'info')
      .trim()
      .toLowerCase();
  }

  trackByNotification(_index: number, notification: Notification): string | number {
    return notification.id;
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
    const role = String(this.currentUser?.role || 'user').toLowerCase();

    if (role === 'admin') {
      return 'Administrator';
    }

    if (role === 'teacher') {
      return this.getFacultyTypeLabel();
    }

    if (role === 'student') {
      return 'Student';
    }

    if (role === 'parent') {
      return 'Parent';
    }

    return 'User';
  }

  private getFacultyTypeLabel(): string {
    const userData = this.currentUser as
      | (User & {
          facultyType?: string;
          instructorType?: string;
          teacherType?: string;
          academicRank?: string;
          designation?: string;
          position?: string;
          title?: string;
        })
      | null;

    const possibleFacultyLabel =
      userData?.facultyType ||
      userData?.instructorType ||
      userData?.teacherType ||
      userData?.academicRank ||
      userData?.designation ||
      userData?.position ||
      userData?.title ||
      '';

    const normalized = String(possibleFacultyLabel).trim().toLowerCase();

    if (!normalized) {
      return 'Faculty';
    }

    const labelMap: Record<string, string> = {
      teacher: 'Faculty',
      faculty: 'Faculty',
      instructor: 'Instructor',
      professor: 'Professor',
      'assistant professor': 'Assistant Professor',
      'associate professor': 'Associate Professor',
      lecturer: 'Lecturer',
      adviser: 'Adviser',
      coordinator: 'Coordinator',
    };

    if (labelMap[normalized]) {
      return labelMap[normalized];
    }

    return this.toTitleCase(normalized);
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

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.isProfileOpen = false;
    this.isNotifOpen = false;

    if (this.isSearchOpen) {
      this.isSearchOpen = false;
      this.searchQuery = '';
    }
  }
}
