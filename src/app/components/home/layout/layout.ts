import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidenav } from '../sidenav/sidenav';
import { Topbar } from '../topbar/topbar';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, Sidenav, Topbar],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout implements OnInit {
  readonly mobileBreakpoint = 992;

  isMobile = false;
  sidebarCollapsed = false;
  mobileSidebarOpen = false;

  ngOnInit(): void {
    this.updateViewportState();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateViewportState();
  }

  toggleSidebar(): void {
    if (this.isMobile) {
      this.mobileSidebarOpen = !this.mobileSidebarOpen;
      return;
    }

    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  closeMobileSidebar(): void {
    this.mobileSidebarOpen = false;
  }

  handleSidebarNavigate(): void {
    if (this.isMobile) {
      this.closeMobileSidebar();
    }
  }

  private updateViewportState(): void {
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth < this.mobileBreakpoint;

    if (this.isMobile) {
      this.sidebarCollapsed = false;
      if (!wasMobile) {
        this.mobileSidebarOpen = false;
      }
      return;
    }

    this.mobileSidebarOpen = false;
  }
}
