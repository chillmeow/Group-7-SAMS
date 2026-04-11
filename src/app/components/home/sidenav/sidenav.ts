import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
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
export class Sidenav implements OnInit {
  private readonly authService = inject(AuthService);

  currentRole: UserRole | null = null;
  menuItems: NavItem[] = [];

  ngOnInit(): void {
    this.currentRole = this.authService.getUserRole();
    this.menuItems = this.getMenuByRole(this.currentRole);
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
          { label: 'Attendance', icon: 'pi pi-calendar-clock', route: '/attendance' },
          { label: 'Reports', icon: 'pi pi-chart-bar', route: '/reports' },
        ];
      case 'teacher':
        return [
          ...baseMenu,
          { label: 'Subjects', icon: 'pi pi-book', route: '/subjects' },
          { label: 'Attendance', icon: 'pi pi-calendar', route: '/attendance' },
          { label: 'Reports', icon: 'pi pi-chart-bar', route: '/reports' },
          { label: 'Notifications', icon: 'pi pi-bell', route: '/notifications' },
          { label: 'Messages', icon: 'pi pi-envelope', route: '/messages' },
        ];

      case 'student':
        return [
          ...baseMenu,
          { label: 'Subjects', icon: 'pi pi-book', route: '/subjects' },
          { label: 'Attendance', icon: 'pi pi-calendar', route: '/attendance' },
          { label: 'Notifications', icon: 'pi pi-bell', route: '/notifications' },
        ];

      case 'parent':
        return [
          ...baseMenu,
          { label: 'Attendance', icon: 'pi pi-calendar', route: '/attendance' },
          { label: 'Reports', icon: 'pi pi-chart-bar', route: '/reports' },
          { label: 'Notifications', icon: 'pi pi-bell', route: '/notifications' },
        ];

      default:
        return baseMenu;
    }
  }
}
