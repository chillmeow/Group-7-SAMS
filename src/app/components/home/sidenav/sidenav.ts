import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  OnInit,
  Output,
  QueryList,
  ViewChildren,
  inject,
} from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../../../services/auth.service';
import { UserRole } from '../../../models/user.model';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-sidenav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidenav.html',
  styleUrl: './sidenav.scss',
})
export class Sidenav implements OnInit, AfterViewInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

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

  ngOnInit(): void {
    this.currentRole = this.authService.getUserRole();
    this.menuItems = this.getMenuByRole(this.currentRole);

    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      this.syncFocusedIndexWithRoute();
    });
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => this.syncFocusedIndexWithRoute());
  }

  onToggleCollapse(): void {
    if (this.isMobile) return;
    this.toggleCollapse.emit();
  }

  handleItemClick(): void {
    this.navigateItem.emit();

    if (this.isMobile) {
      this.requestClose.emit();
    }
  }

  onNavKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.navigateByStep(1);
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.navigateByStep(-1);
        break;

      case 'Home':
        event.preventDefault();
        this.navigateToIndex(0);
        break;

      case 'End':
        event.preventDefault();
        this.navigateToIndex(this.menuItems.length - 1);
        break;

      case 'Enter':
      case ' ':
      case 'Spacebar':
        event.preventDefault();
        break;

      case 'Escape':
        if (this.isMobile && this.mobileOpen) {
          event.preventDefault();
          this.requestClose.emit();
        }
        break;
    }
  }

  onItemKeydown(event: KeyboardEvent, index: number): void {
    this.focusedIndex = index;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.navigateByStep(1);
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.navigateByStep(-1);
        break;

      case 'Home':
        event.preventDefault();
        this.navigateToIndex(0);
        break;

      case 'End':
        event.preventDefault();
        this.navigateToIndex(this.menuItems.length - 1);
        break;

      case 'Enter':
      case ' ':
      case 'Spacebar':
        event.preventDefault();
        break;

      case 'Escape':
        if (this.isMobile && this.mobileOpen) {
          event.preventDefault();
          this.requestClose.emit();
        }
        break;
    }
  }

  private navigateByStep(step: number): void {
    if (!this.menuItems.length) return;

    const nextIndex = (this.focusedIndex + step + this.menuItems.length) % this.menuItems.length;
    this.navigateToIndex(nextIndex);
  }

  private navigateToIndex(index: number): void {
    if (!this.menuItems[index]) return;

    this.focusedIndex = index;
    const targetItem = this.menuItems[index];

    this.router.navigateByUrl(targetItem.route).then(() => {
      queueMicrotask(() => {
        this.navLinks?.get(index)?.nativeElement?.focus();
      });

      this.handleItemClick();
    });
  }

  private syncFocusedIndexWithRoute(): void {
    const currentIndex = this.menuItems.findIndex(
      (item) => this.router.url === item.route || this.router.url.startsWith(item.route + '/'),
    );

    this.focusedIndex = currentIndex >= 0 ? currentIndex : 0;
  }

  private getMenuByRole(role: UserRole | null): NavItem[] {
    const baseMenu: NavItem[] = [{ label: 'Dashboard', icon: 'pi pi-home', route: '/dashboard' }];

    switch (role) {
      case 'admin':
        return [
          ...baseMenu,
          { label: 'Students', icon: 'pi pi-users', route: '/students' },
          { label: 'Teachers', icon: 'pi pi-briefcase', route: '/teachers' },
          { label: 'Parents', icon: 'pi pi-user-plus', route: '/parents' },
          { label: 'Subjects', icon: 'pi pi-book', route: '/subjects' },
          { label: 'Sections', icon: 'pi pi-sitemap', route: '/sections' },
          { label: 'Class Offerings', icon: 'pi pi-calendar', route: '/offerings' },
          { label: 'Attendance', icon: 'pi pi-calendar-clock', route: '/admin-attendance' },
          { label: 'Reports', icon: 'pi pi-chart-bar', route: '/reports' },
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
