import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { collection, query, where, orderBy, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../../firebase.config';
import { AuthService } from '../../../services/auth.service';

interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'attendance' | 'request' | 'system' | 'message';
  isRead: boolean;
  createdAt: string;
  targetUserId: string;
}

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notifications.html',
  styleUrl: './notifications.scss',
})
export class Notifications implements OnInit {
  private readonly authService = inject(AuthService);

  notifications: AppNotification[] = [];
  isLoading = true;
  currentUser = this.authService.getCurrentUser();

  async ngOnInit() {
    await this.loadNotifications();
  }

  async loadNotifications() {
    this.isLoading = true;
    try {
      if (!this.currentUser?.id) return;

      const q = query(
        collection(db, 'notifications'),
        where('targetUserId', '==', this.currentUser.id),
      );

      const snapshot = await getDocs(q);
      this.notifications = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AppNotification, 'id'>),
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (e) {
      console.error(e);
      this.notifications = [];
    } finally {
      this.isLoading = false;
    }
  }

  async markAsRead(notif: AppNotification) {
    if (notif.isRead) return;
    notif.isRead = true;
    await updateDoc(doc(db, 'notifications', notif.id), { isRead: true });
  }

  async markAllRead() {
    for (const n of this.notifications.filter((n) => !n.isRead)) {
      n.isRead = true;
      await updateDoc(doc(db, 'notifications', n.id), { isRead: true });
    }
  }

  get unreadCount() {
    return this.notifications.filter((n) => !n.isRead).length;
  }

  getTypeLabel(type: string): string {
    const map: Record<string, string> = {
      attendance: 'Attendance',
      request: 'Request',
      system: 'System',
      message: 'Message',
    };
    return map[type] || 'Notification';
  }

  getTypeColor(type: string): string {
    const map: Record<string, string> = {
      attendance: 'teal',
      request: 'amber',
      system: 'blue',
      message: 'purple',
    };
    return map[type] || 'gray';
  }
}
