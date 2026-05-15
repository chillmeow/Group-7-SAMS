import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  OnDestroy,
  OnInit,
  Output,
  QueryList,
  ViewChildren,
  inject,
} from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';

import { AuthService } from '../../../services/auth.service';
import { UserRole } from '../../../models/user.model';
import { db } from '../../../firebase.config';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

interface AdminManagementItem {
  label: string;
  icon: string;
  route?: string;
}

@Component({
  selector: 'app-sidenav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidenav.html',
  styleUrl: './sidenav.scss',
})
export class Sidenav implements OnInit, AfterViewInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  private routerSubscription?: Subscription;
  private unsubscribeMessageBadge?: () => void;

  @Input() collapsed = false;
  @Input() isMobile = false;
  @Input() mobileOpen = false;

  @Output() navigateItem = new EventEmitter<void>();
  @Output() requestClose = new EventEmitter<void>();
  @Output() toggleCollapse = new EventEmitter<void>();

  @ViewChildren('navLink') navLinks!: QueryList<ElementRef<HTMLAnchorElement>>;

  @HostBinding('class.host-collapsed')
  get hostCollapsed(): boolean {
    return this.collapsed && !this.isMobile;
  }

  @HostBinding('class.host-mobile')
  get hostMobile(): boolean {
    return this.isMobile;
  }

  @HostBinding('class.host-mobile-open')
  get hostMobileOpen(): boolean {
    return this.isMobile && this.mobileOpen;
  }

  currentRole: UserRole | null = null;
  menuItems: NavItem[] = [];
  focusedIndex = 0;

  unreadMessageCount = 0;
  private currentMessageProfileId = '';

  readonly adminManagementItems: AdminManagementItem[] = [
    {
      label: 'Manage Users',
      icon: 'pi pi-users',
      route: '/admin-management/manage-users',
    },
    {
      label: 'Manage Students',
      icon: 'pi pi-graduation-cap',
      route: '/admin-management/manage-students',
    },
    {
      label: 'Manage Instructors',
      icon: 'pi pi-briefcase',
      route: '/admin-management/manage-instructors',
    },
    {
      label: 'Manage Parents',
      icon: 'pi pi-user-plus',
      route: '/admin-management/manage-parents',
    },
    {
      label: 'Manage Sections',
      icon: 'pi pi-sitemap',
      route: '/admin-management/manage-sections',
    },
    {
      label: 'Reports & Analytics',
      icon: 'pi pi-chart-bar',
      route: '/admin-management/reports-analytics',
    },
  ];

  ngOnInit(): void {
    this.currentRole = this.authService.getUserRole();
    this.menuItems = this.getMenuByRole(this.currentRole);

    void this.initializeMessageUnreadBadge();

    this.routerSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        this.syncFocusedIndexWithRoute();
      });
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => this.syncFocusedIndexWithRoute());
  }

  ngOnDestroy(): void {
    this.routerSubscription?.unsubscribe();

    if (this.unsubscribeMessageBadge) {
      this.unsubscribeMessageBadge();
      this.unsubscribeMessageBadge = undefined;
    }
  }

  onToggleCollapse(): void {
    if (this.isMobile) {
      return;
    }

    this.toggleCollapse.emit();
  }

  handleItemClick(): void {
    this.navigateItem.emit();

    if (this.isMobile) {
      this.requestClose.emit();
    }
  }

  onNavKeydown(event: KeyboardEvent): void {
    /*
     * The nav container receives keyboard events from child links.
     * If the focused target is already a link, let onItemKeydown handle it
     * to avoid double movement when pressing ArrowUp or ArrowDown.
     */
    if (this.isNavigationLinkTarget(event.target)) {
      return;
    }

    if (!this.isSidebarNavigationKey(event.key)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.handleSidebarNavigationKey(event);
  }

  onItemKeydown(event: KeyboardEvent, index: number): void {
    this.focusedIndex = index;

    /*
     * Do not block Enter.
     * Browser/routerLink should handle Enter naturally like a real link.
     */
    if (!this.isSidebarNavigationKey(event.key)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.handleSidebarNavigationKey(event);
  }

  isMessagesItem(item: NavItem): boolean {
    return item.route === '/messages';
  }

  getUnreadMessageLabel(): string {
    if (this.unreadMessageCount > 99) return '99+';
    return String(this.unreadMessageCount);
  }

  private handleSidebarNavigationKey(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        this.focusLinkByStep(1);
        break;

      case 'ArrowUp':
        this.focusLinkByStep(-1);
        break;

      case 'Home':
        this.focusLinkAtIndex(0);
        break;

      case 'End':
        this.focusLinkAtIndex(this.getNavLinkElements().length - 1);
        break;

      case 'Escape':
        if (this.isMobile && this.mobileOpen) {
          this.requestClose.emit();
        }
        break;
    }
  }

  private focusLinkByStep(step: number): void {
    const links = this.getNavLinkElements();

    if (!links.length) {
      return;
    }

    const safeCurrentIndex =
      this.focusedIndex >= 0 && this.focusedIndex < links.length ? this.focusedIndex : 0;

    const nextIndex = (safeCurrentIndex + step + links.length) % links.length;

    this.focusLinkAtIndex(nextIndex);
  }

  private focusLinkAtIndex(index: number): void {
    const links = this.getNavLinkElements();

    if (!links.length || !links[index]) {
      return;
    }

    this.focusedIndex = index;

    queueMicrotask(() => {
      links[index]?.focus();
    });
  }

  private getNavLinkElements(): HTMLAnchorElement[] {
    return this.navLinks?.toArray().map((link) => link.nativeElement) ?? [];
  }

  private syncFocusedIndexWithRoute(): void {
    const currentIndex = this.menuItems.findIndex(
      (item) => this.router.url === item.route || this.router.url.startsWith(item.route + '/'),
    );

    this.focusedIndex = currentIndex >= 0 ? currentIndex : 0;
  }

  private isSidebarNavigationKey(key: string): boolean {
    return (
      key === 'ArrowDown' ||
      key === 'ArrowUp' ||
      key === 'Home' ||
      key === 'End' ||
      key === 'Escape'
    );
  }

  private isNavigationLinkTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return !!target.closest('a');
  }

  private async initializeMessageUnreadBadge(): Promise<void> {
    this.unreadMessageCount = 0;

    if (this.currentRole !== 'teacher' && this.currentRole !== 'student') {
      this.stopMessageUnreadBadge();
      return;
    }

    const profileId = await this.resolveMessageProfileId();

    if (!profileId) {
      this.stopMessageUnreadBadge();
      return;
    }

    this.currentMessageProfileId = profileId;
    this.listenToMessageUnreadCount(profileId);
  }

  private stopMessageUnreadBadge(): void {
    if (this.unsubscribeMessageBadge) {
      this.unsubscribeMessageBadge();
      this.unsubscribeMessageBadge = undefined;
    }

    this.currentMessageProfileId = '';
    this.unreadMessageCount = 0;
  }

  private listenToMessageUnreadCount(profileId: string): void {
    if (this.unsubscribeMessageBadge) {
      this.unsubscribeMessageBadge();
      this.unsubscribeMessageBadge = undefined;
    }

    const chatThreadsRef = collection(db, 'chatThreads');
    const chatThreadsQuery = query(
      chatThreadsRef,
      where('participantIds', 'array-contains', profileId),
    );

    this.unsubscribeMessageBadge = onSnapshot(
      chatThreadsQuery,
      (snapshot) => {
        let totalUnread = 0;

        snapshot.docs.forEach((documentSnapshot) => {
          const data = documentSnapshot.data() as {
            unreadCounts?: Record<string, number>;
          };

          const unreadValue = Number(data.unreadCounts?.[profileId] || 0);

          if (Number.isFinite(unreadValue) && unreadValue > 0) {
            totalUnread += unreadValue;
          }
        });

        this.unreadMessageCount = totalUnread;
      },
      (error) => {
        console.error('SIDEBAR MESSAGE UNREAD LISTENER ERROR:', error);
        this.unreadMessageCount = 0;
      },
    );
  }

  private async resolveMessageProfileId(): Promise<string> {
    const currentUser = this.authService.getCurrentUser();
    const currentUserId = String(currentUser?.id || '').trim();
    const currentEmail = String(currentUser?.email || '')
      .trim()
      .toLowerCase();

    if (this.currentRole === 'student') {
      const studentProfileId = await this.findProfileIdByUserOrEmail(
        'students',
        currentUserId,
        currentEmail,
      );

      return studentProfileId || currentUserId;
    }

    if (this.currentRole === 'teacher') {
      const teacherProfileId = await this.findProfileIdByUserOrEmail(
        'teachers',
        currentUserId,
        currentEmail,
      );

      return teacherProfileId || currentUserId;
    }

    return currentUserId;
  }

  private async findProfileIdByUserOrEmail(
    collectionName: 'students' | 'teachers',
    userId: string,
    email: string,
  ): Promise<string> {
    const profileCollection = collection(db, collectionName);

    if (userId) {
      const userQuery = query(profileCollection, where('userId', '==', userId));
      const userSnapshot = await getDocs(userQuery);

      if (!userSnapshot.empty) {
        return userSnapshot.docs[0].id;
      }
    }

    if (email) {
      const emailQuery = query(profileCollection, where('email', '==', email));
      const emailSnapshot = await getDocs(emailQuery);

      if (!emailSnapshot.empty) {
        return emailSnapshot.docs[0].id;
      }
    }

    return '';
  }

  private getMenuByRole(role: UserRole | null): NavItem[] {
    const baseMenu: NavItem[] = [{ label: 'Dashboard', icon: 'pi pi-home', route: '/dashboard' }];

    switch (role) {
      case 'admin':
        return [
          ...baseMenu,
          { label: 'Subjects', icon: 'pi pi-book', route: '/subjects' },
          { label: 'Class Offerings', icon: 'pi pi-calendar', route: '/offerings' },
          { label: 'Attendance', icon: 'pi pi-calendar-clock', route: '/admin-attendance' },
        ];

      case 'teacher':
        return [
          ...baseMenu,
          { label: 'My Subjects', icon: 'pi pi-book', route: '/teacher-subjects' },
          { label: 'Attendance', icon: 'pi pi-calendar', route: '/attendance' },
          { label: 'Reports', icon: 'pi pi-chart-bar', route: '/reports' },
          { label: 'Messages', icon: 'pi pi-envelope', route: '/messages' },
        ];

      case 'student':
        return [
          ...baseMenu,
          { label: 'My Subjects', icon: 'pi pi-book', route: '/student-subjects' },
          { label: 'Attendance', icon: 'pi pi-calendar-clock', route: '/student-attendance' },
          { label: 'Messages', icon: 'pi pi-envelope', route: '/messages' },
        ];

      case 'parent':
        return [
          ...baseMenu,
          { label: 'Child Attendance', icon: 'pi pi-calendar', route: '/parent-attendance' },
        ];

      default:
        return baseMenu;
    }
  }
}
