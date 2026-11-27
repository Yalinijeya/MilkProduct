import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { NotificationStatus, ShopSettings, TestNotificationResult } from '../models/models';
import { ShopStatus, shopStatus, upcomingHolidays, weeklySummary } from '../utils/shop-hours';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/api/settings`;

  /** Latest settings loaded from the API (null until loaded). */
  readonly settings = signal<ShopSettings | null>(null);

  /** Ticks every 30 s so the open/closed status changes by itself at opening and closing time. */
  private readonly now = signal(new Date());

  /** Open or closed right now (null until the settings are loaded). */
  readonly status = computed<ShopStatus | null>(() => {
    const s = this.settings();
    return s ? shopStatus(s, this.now()) : null;
  });

  /** True unless the shop is known to be closed. */
  readonly isOpen = computed(() => this.status()?.open ?? true);

  /** Weekly timetable for display, e.g. [{ days: 'Mon – Sat', hours: '7:00 AM – 8:00 PM' }, { days: 'Sun', hours: 'Closed' }] */
  readonly hours = computed(() => {
    const s = this.settings();
    return s ? weeklySummary(s) : [];
  });

  /** Holiday dates in the next 30 days ("YYYY-MM-DD"). */
  readonly upcomingHolidays = computed(() => {
    const s = this.settings();
    return s ? upcomingHolidays(s, this.now(), 30) : [];
  });

  constructor() {
    setInterval(() => this.now.set(new Date()), 30_000);
  }

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
