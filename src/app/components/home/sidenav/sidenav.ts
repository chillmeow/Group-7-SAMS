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

import { AuthService } from '../../../services/auth.service';
import { UserRole } from '../../../models/user.model';

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
