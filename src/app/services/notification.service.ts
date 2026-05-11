import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { addDoc, collection, doc, writeBatch } from 'firebase/firestore';

import { db } from '../firebase.config';

export type NotificationType =
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'attendance'
  | 'request'
  | 'system'
  | 'message'
  | 'report'
  | 'account';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: Date;
  read: boolean;
}

export interface FirestoreNotificationPayload {
  targetUserId: string | number;
  targetRole?: string;
  actorUserId?: string | number;
  actorName?: string;
  title: string;
  message: string;
  type?: NotificationType;
  link?: string;
  entityType?: string;
  entityId?: string | number;
  read?: boolean;
  isRead?: boolean;
  createdAt?: string;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly collectionName = 'notifications';
  private readonly notificationsSubject = new BehaviorSubject<AppNotification[]>([]);

  readonly notifications$: Observable<AppNotification[]> = this.notificationsSubject.asObservable();

  get notifications(): AppNotification[] {
    return this.notificationsSubject.value;
  }

  addNotification(type: NotificationType, title: string, message: string): AppNotification {
    const notification: AppNotification = {
      id: this.generateId(),
      type,
      title,
      message,
      createdAt: new Date(),
      read: false,
    };

    this.notificationsSubject.next([notification, ...this.notifications]);

    return notification;
  }

  success(title: string, message: string): AppNotification {
    return this.addNotification('success', title, message);
  }

  error(title: string, message: string): AppNotification {
    return this.addNotification('error', title, message);
  }

  warning(title: string, message: string): AppNotification {
    return this.addNotification('warning', title, message);
  }

  info(title: string, message: string): AppNotification {
    return this.addNotification('info', title, message);
  }

  async createNotification(payload: FirestoreNotificationPayload): Promise<string> {
    const cleanPayload = this.buildFirestorePayload(payload);
    const notificationRef = await addDoc(collection(db, this.collectionName), cleanPayload);

    return notificationRef.id;
  }

  async createManyNotifications(payloads: FirestoreNotificationPayload[]): Promise<string[]> {
    if (!payloads.length) return [];

    const createdIds: string[] = [];
    let batch = writeBatch(db);
    let operationCount = 0;

    for (const payload of payloads) {
      const notificationRef = doc(collection(db, this.collectionName));
      createdIds.push(notificationRef.id);

      batch.set(notificationRef, this.buildFirestorePayload(payload));
      operationCount++;

      if (operationCount >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
      }
    }

    if (operationCount > 0) {
      await batch.commit();
    }

    return createdIds;
  }

  async notifyUser(payload: FirestoreNotificationPayload): Promise<string> {
    return this.createNotification(payload);
  }

  async notifyUsers(payloads: FirestoreNotificationPayload[]): Promise<string[]> {
    return this.createManyNotifications(payloads);
  }

  markAsRead(notificationId: string): void {
    const updatedNotifications = this.notifications.map((notification) =>
      notification.id === notificationId ? { ...notification, read: true } : notification,
    );

    this.notificationsSubject.next(updatedNotifications);
  }

  markAllAsRead(): void {
    const updatedNotifications = this.notifications.map((notification) => ({
      ...notification,
      read: true,
    }));

    this.notificationsSubject.next(updatedNotifications);
  }

  removeNotification(notificationId: string): void {
    const updatedNotifications = this.notifications.filter(
      (notification) => notification.id !== notificationId,
    );

    this.notificationsSubject.next(updatedNotifications);
  }

  clearNotifications(): void {
    this.notificationsSubject.next([]);
  }

  getUnreadCount(): number {
    return this.notifications.filter((notification) => !notification.read).length;
  }

  private buildFirestorePayload(payload: FirestoreNotificationPayload): Record<string, unknown> {
    const readValue = Boolean(payload.read ?? payload.isRead ?? false);
    const nowIso = new Date().toISOString();

    const cleanPayload: Record<string, unknown> = {
      targetUserId: String(payload.targetUserId),
      targetRole: payload.targetRole || '',
      actorUserId: payload.actorUserId ? String(payload.actorUserId) : '',
      actorName: payload.actorName || '',
      title: payload.title,
      message: payload.message,
      type: payload.type || 'info',
      link: payload.link || '',
      entityType: payload.entityType || '',
      entityId: payload.entityId ? String(payload.entityId) : '',
      read: readValue,
      isRead: readValue,
      createdAt: payload.createdAt || nowIso,
    };

    Object.keys(cleanPayload).forEach((key) => {
      if (cleanPayload[key] === undefined) {
        delete cleanPayload[key];
      }
    });

    return cleanPayload;
  }

  private generateId(): string {
    return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
