import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Router } from '@angular/router';

import { db } from '../../../firebase.config';
import { AuthService } from '../../../services/auth.service';
import { User } from '../../../models/user.model';

type NotificationType =
  | 'attendance'
  | 'request'
  | 'system'
  | 'message'
  | 'report'
  | 'account'
  | 'info'
  | 'success'
  | 'warning'
  | 'error';

type NotificationFilter =
  | 'all'
  | 'unread'
  | 'attendance'
  | 'request'
  | 'message'
  | 'system'
  | 'report'
  | 'account';

interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  isRead?: boolean;
  createdAt: string;
  targetUserId: string;
  targetRole?: string;
  actorUserId?: string;
  actorName?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './notifications.html',
  styleUrl: './notifications.scss',
})
export class Notifications implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  private readonly collectionName = 'notifications';
  private unsubscribeNotifications: (() => void) | null = null;

  currentUser: User | null = null;

  notifications: AppNotification[] = [];
  isLoading = true;
  searchTerm = '';
  activeFilter: NotificationFilter = 'all';
  processingId = '';

  readonly filters: { label: string; value: NotificationFilter; icon: string }[] = [
    { label: 'All', value: 'all', icon: 'pi pi-inbox' },
    { label: 'Unread', value: 'unread', icon: 'pi pi-envelope' },
    { label: 'Attendance', value: 'attendance', icon: 'pi pi-calendar-check' },
    { label: 'Requests', value: 'request', icon: 'pi pi-clock' },
    { label: 'Messages', value: 'message', icon: 'pi pi-comments' },
    { label: 'System', value: 'system', icon: 'pi pi-cog' },
    { label: 'Reports', value: 'report', icon: 'pi pi-chart-bar' },
    { label: 'Account', value: 'account', icon: 'pi pi-user' },
  ];

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadNotifications();
  }

  ngOnDestroy(): void {
    if (this.unsubscribeNotifications) {
      this.unsubscribeNotifications();
      this.unsubscribeNotifications = null;
    }
  }

  get unreadCount(): number {
    return this.notifications.filter((notification) => !notification.read).length;
  }

  get totalCount(): number {
    return this.notifications.length;
  }

  get filteredNotifications(): AppNotification[] {
    const search = this.searchTerm.trim().toLowerCase();

    return this.notifications.filter((notification) => {
      const matchesFilter =
        this.activeFilter === 'all' ||
        (this.activeFilter === 'unread' && !notification.read) ||
        notification.type === this.activeFilter;

      const matchesSearch =
        !search ||
        notification.title.toLowerCase().includes(search) ||
        notification.message.toLowerCase().includes(search) ||
        this.getTypeLabel(notification.type).toLowerCase().includes(search) ||
        String(notification.actorName || '')
          .toLowerCase()
          .includes(search);

      return matchesFilter && matchesSearch;
    });
  }

  get roleLabel(): string {
    const role = String(this.currentUser?.role || '').toLowerCase();

    if (role === 'admin') return 'Admin';
    if (role === 'teacher') return 'Faculty';
    if (role === 'student') return 'Student';
    if (role === 'parent') return 'Parent';

    return 'User';
  }

  get roleDescription(): string {
    const role = String(this.currentUser?.role || '').toLowerCase();

    if (role === 'admin') {
      return 'System-wide alerts, account activity, reports, and important administration updates.';
    }

    if (role === 'teacher') {
      return 'Class attendance updates, student submissions, pending approval requests, and messages.';
    }

    if (role === 'student') {
      return 'Attendance results, teacher updates, messages, and account-related notices.';
    }

    if (role === 'parent') {
      return 'Linked child attendance updates, late or absent alerts, and monitoring notices.';
    }

    return 'Personal system updates and account notices.';
  }

  get roleIcon(): string {
    const role = String(this.currentUser?.role || '').toLowerCase();

    if (role === 'admin') return 'pi pi-shield';
    if (role === 'teacher') return 'pi pi-briefcase';
    if (role === 'student') return 'pi pi-graduation-cap';
    if (role === 'parent') return 'pi pi-users';

    return 'pi pi-user';
  }

  loadNotifications(): void {
    if (this.unsubscribeNotifications) {
      this.unsubscribeNotifications();
      this.unsubscribeNotifications = null;
    }

    this.currentUser = this.authService.getCurrentUser();

    if (!this.currentUser?.id) {
      this.notifications = [];
      this.isLoading = false;
      return;
    }

    this.isLoading = true;

    const notificationsQuery = query(
      collection(db, this.collectionName),
      where('targetUserId', '==', String(this.currentUser.id)),
    );

    this.unsubscribeNotifications = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        this.notifications = snapshot.docs
          .map((documentSnapshot) => {
            const data = documentSnapshot.data() as Partial<AppNotification> & {
              isRead?: boolean;
            };

            const readValue = Boolean(data.read ?? data.isRead ?? false);

            return {
              id: documentSnapshot.id,
              title: String(data.title || 'Notification'),
              message: String(data.message || ''),
              type: (data.type || 'info') as NotificationType,
              read: readValue,
              isRead: readValue,
              createdAt: String(data.createdAt || new Date().toISOString()),
              targetUserId: String(data.targetUserId || ''),
              targetRole: String(data.targetRole || ''),
              actorUserId: String(data.actorUserId || ''),
              actorName: String(data.actorName || ''),
              link: String(data.link || ''),
              entityType: String(data.entityType || ''),
              entityId: String(data.entityId || ''),
            };
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        this.isLoading = false;
      },
      (error) => {
        console.error('LOAD NOTIFICATIONS ERROR:', error);
        this.notifications = [];
        this.isLoading = false;
      },
    );
  }

  setFilter(filter: NotificationFilter): void {
    this.activeFilter = filter;
  }

  clearSearch(): void {
    this.searchTerm = '';
  }

  async openNotification(notification: AppNotification): Promise<void> {
    await this.markAsRead(notification);

    if (notification.link) {
      this.router.navigateByUrl(notification.link);
    }
  }

  async markAsRead(notification: AppNotification): Promise<void> {
    if (notification.read || !notification.id) return;

    notification.read = true;
    notification.isRead = true;

    try {
      await updateDoc(doc(db, this.collectionName, notification.id), {
        read: true,
        isRead: true,
        readAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('MARK NOTIFICATION READ ERROR:', error);
      notification.read = false;
      notification.isRead = false;
    }
  }

  async markAllRead(): Promise<void> {
    const unreadNotifications = this.notifications.filter((notification) => !notification.read);

    if (unreadNotifications.length === 0) return;

    try {
      const batch = writeBatch(db);
      const nowIso = new Date().toISOString();

      unreadNotifications.forEach((notification) => {
        notification.read = true;
        notification.isRead = true;

        batch.update(doc(db, this.collectionName, notification.id), {
          read: true,
          isRead: true,
          readAt: nowIso,
        });
      });

      await batch.commit();
    } catch (error) {
      console.error('MARK ALL NOTIFICATIONS READ ERROR:', error);
      this.loadNotifications();
    }
  }

  async deleteNotification(notification: AppNotification, event: Event): Promise<void> {
    event.stopPropagation();

    if (!notification.id || this.processingId) return;

    this.processingId = notification.id;

    try {
      await deleteDoc(doc(db, this.collectionName, notification.id));
      this.notifications = this.notifications.filter((item) => item.id !== notification.id);
    } catch (error) {
      console.error('DELETE NOTIFICATION ERROR:', error);
    } finally {
      this.processingId = '';
    }
  }

  getFilterCount(filter: NotificationFilter): number {
    if (filter === 'all') return this.totalCount;
    if (filter === 'unread') return this.unreadCount;

    return this.notifications.filter((notification) => notification.type === filter).length;
  }

  getTypeLabel(type: string): string {
    const map: Record<string, string> = {
      attendance: 'Attendance',
      request: 'Request',
      system: 'System',
      message: 'Message',
      report: 'Report',
      account: 'Account',
      success: 'Success',
      warning: 'Warning',
      error: 'Alert',
      info: 'Info',
    };

    return map[type] || 'Notification';
  }

  getTypeColor(type: string): string {
    const map: Record<string, string> = {
      attendance: 'teal',
      request: 'amber',
      system: 'blue',
      message: 'purple',
      report: 'indigo',
      account: 'sky',
      success: 'green',
      warning: 'amber',
      error: 'red',
      info: 'blue',
    };

    return map[type] || 'gray';
  }

  getTypeIcon(type: string): string {
    const map: Record<string, string> = {
      attendance: 'pi pi-calendar-check',
      request: 'pi pi-clock',
      system: 'pi pi-cog',
      message: 'pi pi-comments',
      report: 'pi pi-chart-bar',
      account: 'pi pi-user',
      success: 'pi pi-check-circle',
      warning: 'pi pi-exclamation-triangle',
      error: 'pi pi-times-circle',
      info: 'pi pi-info-circle',
    };

    return map[type] || 'pi pi-bell';
  }

  formatTime(value: string): string {
    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  trackByNotification(_index: number, notification: AppNotification): string {
    return notification.id;
  }
}
