import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';

import { Sidenav } from '../sidenav/sidenav';
import { Topbar } from '../topbar/topbar';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, Sidenav, Topbar],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class Layout implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);

  private routerSubscription?: Subscription;
  private bodyScrollLocked = false;
  private previousBodyOverflow = '';
  private previousBodyTouchAction = '';

  readonly mobileBreakpoint = 992;

  isMobile = false;
  sidebarCollapsed = false;
  mobileSidebarOpen = false;

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.updateViewportState();

    this.routerSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        this.closeMobileSidebar();
      });
  }

  ngOnDestroy(): void {
    this.routerSubscription?.unsubscribe();
    this.unlockBodyScroll();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateViewportState();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.mobileSidebarOpen) {
      this.closeMobileSidebar();
    }
  }

  toggleSidebar(): void {
    if (this.isMobile) {
      this.mobileSidebarOpen = !this.mobileSidebarOpen;
      this.syncBodyScrollLock();
      return;
    }

    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  closeMobileSidebar(): void {
    if (!this.mobileSidebarOpen) {
      return;
    }

    this.mobileSidebarOpen = false;
    this.syncBodyScrollLock();
  }

  handleSidebarNavigate(): void {
    if (this.isMobile) {
      this.closeMobileSidebar();
    }
  }

  private updateViewportState(): void {
    if (!this.isBrowser) {
      return;
    }

    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth < this.mobileBreakpoint;

    if (this.isMobile) {
      this.sidebarCollapsed = false;

      if (!wasMobile) {
        this.mobileSidebarOpen = false;
      }

      this.syncBodyScrollLock();
      return;
    }

    this.mobileSidebarOpen = false;
    this.syncBodyScrollLock();
  }

  private syncBodyScrollLock(): void {
    if (!this.isBrowser) {
      return;
    }

    if (this.isMobile && this.mobileSidebarOpen) {
      this.lockBodyScroll();
      return;
    }

    this.unlockBodyScroll();
  }

  private lockBodyScroll(): void {
    if (this.bodyScrollLocked) {
      return;
    }

    const body = this.document.body;

    this.previousBodyOverflow = body.style.overflow;
    this.previousBodyTouchAction = body.style.touchAction;

    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';

    this.bodyScrollLocked = true;
  }

  private unlockBodyScroll(): void {
    if (!this.bodyScrollLocked) {
      return;
    }

    const body = this.document.body;

    body.style.overflow = this.previousBodyOverflow;
    body.style.touchAction = this.previousBodyTouchAction;

    this.previousBodyOverflow = '';
    this.previousBodyTouchAction = '';
    this.bodyScrollLocked = false;
  }
}
