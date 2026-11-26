import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NotificationStatus, ShopSettings, TestNotificationResult } from '../models/models';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/api/settings`;

  /** Latest settings loaded from the API (null until loaded). */
  readonly settings = signal<ShopSettings | null>(null);

  load(): Observable<ShopSettings> {
    return this.http.get<ShopSettings>(this.url).pipe(tap((s) => this.settings.set(s)));
  }

  update(value: Partial<ShopSettings>): Observable<ShopSettings> {
    return this.http.put<ShopSettings>(this.url, value).pipe(tap((s) => this.settings.set(s)));
  }

  /** Which automatic notifications (WhatsApp / email) are set up on the server. */
  notificationStatus(): Observable<NotificationStatus> {
    return this.http.get<NotificationStatus>(`${environment.apiUrl}/api/admin/notifications`);
  }

  /** Sends a test WhatsApp message and email right now. */
  sendTestNotification(): Observable<TestNotificationResult> {
    return this.http.post<TestNotificationResult>(`${environment.apiUrl}/api/admin/notifications/test`, {});
  }
}
