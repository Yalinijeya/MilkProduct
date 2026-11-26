import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Order } from '../models/models';
import { AuthService } from './auth.service';

/** Response of GET /api/admin/orders/changes */
interface OrderChanges {
  /** Pass this back as `since` on the next call. */
  cursor: string;
  /** Orders created or changed after `since` (oldest first). */
  orders: Order[];
}

/** How often the admin panel asks the server for new / changed orders. */
const POLL_MS = 10_000;

/**
 * Live updates for the admin panel: new-order alerts and status changes.
 *
 * Cloudflare Workers can't host a SignalR hub, so this asks the server every 10 seconds
 * which orders changed. Components use it exactly like before (`newOrder$`, `orderUpdated$`,
 * `connected`).
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly connected = signal(false);
  readonly newOrder$ = new Subject<Order>();
  readonly orderUpdated$ = new Subject<Order>();

  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cursor: string | null = null;
  /** id → updatedAt of orders already announced, so overlapping polls don't repeat an alert. */
  private readonly seen = new Map<number, string>();

  connect(): void {
    if (this.running || !this.auth.token()) return;
    this.running = true;
    this.cursor = null;
    this.seen.clear();
    this.poll();
  }

  disconnect(): void {
    this.running = false;
    this.connected.set(false);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private poll(): void {
    if (!this.running) return;
    if (!this.auth.hasValidToken()) {
      this.disconnect();
      this.auth.logout();
      return;
    }

    const since = this.cursor;
    let params = new HttpParams();
    if (since) params = params.set('since', since);

    this.http.get<OrderChanges>(`${environment.apiUrl}/api/admin/orders/changes`, { params }).subscribe({
      next: (res) => {
        if (!this.running) return;
        this.connected.set(true);
        this.cursor = res.cursor;
        if (since) this.announce(res.orders, since);
        else res.orders.forEach((o) => this.seen.set(o.id, o.updatedAt));
        this.forgetOld(res.cursor);
        this.schedule();
      },
      error: (err: unknown) => {
        this.connected.set(false);
        // 401 is handled by the auth interceptor (logs out); stop polling in that case.
        if (err instanceof HttpErrorResponse && err.status === 401) this.disconnect();
        else this.schedule();
      },
    });
  }

  private announce(orders: Order[], since: string): void {
    for (const order of orders) {
      const previous = this.seen.get(order.id);
      if (previous === order.updatedAt) continue; // already handled in an earlier poll
      this.seen.set(order.id, order.updatedAt);
      if (previous === undefined && order.createdAt > since) this.newOrder$.next(order);
      else this.orderUpdated$.next(order);
    }
  }

  /** Orders older than the polling overlap can't come back, so stop remembering them. */
  private forgetOld(cursor: string): void {
    for (const [id, updatedAt] of this.seen) {
      if (updatedAt < cursor) this.seen.delete(id);
    }
  }

  private schedule(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => this.poll(), POLL_MS);
  }
}
