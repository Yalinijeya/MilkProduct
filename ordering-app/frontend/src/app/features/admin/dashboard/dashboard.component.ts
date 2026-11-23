import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Order, OrderStatus, STATUS_LABELS } from '../../../core/models/models';
import { OrderService } from '../../../core/services/order.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/services/toast.service';
import { errorMessage } from '../../../core/utils/http-error';
import { OrderCardComponent } from '../../../shared/components/order-card.component';

const ACTIVE: OrderStatus[] = ['confirmed', 'out_for_delivery'];

@Component({
  selector: 'app-dashboard',
  imports: [OrderCardComponent, RouterLink],
  template: `
    <div class="mb-5 flex items-center justify-between gap-3">
      <h1 class="text-2xl font-bold text-slate-900">Dashboard</h1>
      <button type="button" class="btn-secondary" (click)="load()" [disabled]="loading()">Refresh</button>
    </div>

    <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div class="card">
        <p class="text-sm text-slate-500">New orders</p>
        <p class="mt-1 text-3xl font-bold text-amber-600">{{ newOrders().length }}</p>
      </div>
      <div class="card">
        <p class="text-sm text-slate-500">In progress</p>
        <p class="mt-1 text-3xl font-bold text-sky-700">{{ activeCount() }}</p>
      </div>
      <a routerLink="/admin/orders" class="card col-span-2 flex items-center justify-between hover:bg-slate-50 sm:col-span-1">
        <span class="text-sm text-slate-500">All orders</span>
        <span class="text-slate-400">→</span>
      </a>
    </div>

    <h2 class="mb-3 text-lg font-semibold text-slate-900">New orders</h2>
    @if (loading() && newOrders().length === 0) {
      <p class="text-slate-500">Loading…</p>
    } @else if (newOrders().length === 0) {
      <div class="card text-center text-slate-500">No new orders. New orders will appear here instantly with a sound alert.</div>
    } @else {
      <div class="grid gap-4 lg:grid-cols-2">
        @for (order of newOrders(); track order.id) {
          <app-order-card
            [order]="order"
            [highlight]="fresh().has(order.id)"
            [busy]="busyId() === order.id"
            (statusChange)="changeStatus(order, $event)"
          />
        }
      </div>
    }
  `,
})
export class DashboardComponent implements OnInit {
  private readonly orders = inject(OrderService);
  private readonly realtime = inject(RealtimeService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly newOrders = signal<Order[]>([]);
  protected readonly activeCount = signal(0);
  protected readonly loading = signal(false);
  protected readonly busyId = signal<number | null>(null);
  /** Orders that arrived live (highlighted until handled). */
  protected readonly fresh = signal(new Set<number>());

  ngOnInit(): void {
    this.load();

    this.realtime.newOrder$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((order) => {
      if (this.newOrders().some((o) => o.id === order.id)) return;
      this.newOrders.update((list) => [order, ...list]);
      this.fresh.update((s) => new Set(s).add(order.id));
    });

    this.realtime.orderUpdated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((order) => this.applyUpdate(order));
  }

  protected load(): void {
    this.loading.set(true);
    forkJoin({
      fresh: this.orders.list({ status: 'new', limit: 100 }),
      active: this.orders.list({ status: ACTIVE, limit: 1 }),
    }).subscribe({
      next: ({ fresh, active }) => {
        this.newOrders.set(fresh.data);
        this.activeCount.set(active.total);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error(errorMessage(err, 'Could not load orders.'));
      },
    });
  }

  protected changeStatus(order: Order, status: OrderStatus): void {
    this.busyId.set(order.id);
    this.orders.updateStatus(order.id, status).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.applyUpdate(updated);
        this.toast.success(`${updated.orderNumber} → ${STATUS_LABELS[updated.status]}`);
      },
      error: (err) => {
        this.busyId.set(null);
        this.toast.error(errorMessage(err, 'Could not update status.'));
      },
    });
  }

  /** Keeps the list in sync after a status change (from this tab or another admin). */
  private applyUpdate(updated: Order): void {
    const wasNew = this.newOrders().some((o) => o.id === updated.id);
    if (updated.status === 'new') {
      this.newOrders.update((list) => list.map((o) => (o.id === updated.id ? updated : o)));
      return;
    }
    if (wasNew) {
      this.newOrders.update((list) => list.filter((o) => o.id !== updated.id));
      this.fresh.update((s) => {
        const next = new Set(s);
        next.delete(updated.id);
        return next;
      });
    }
    // Refresh the in-progress counter
    this.orders.list({ status: ACTIVE, limit: 1 }).subscribe({ next: (r) => this.activeCount.set(r.total), error: () => {} });
  }
}
