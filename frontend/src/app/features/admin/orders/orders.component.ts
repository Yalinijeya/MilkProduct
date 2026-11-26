import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ORDER_STATUSES, Order, OrderStatus, STATUS_LABELS } from '../../../core/models/models';
import { OrderService } from '../../../core/services/order.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { ToastService } from '../../../core/services/toast.service';
import { errorMessage } from '../../../core/utils/http-error';
import { OrderCardComponent } from '../../../shared/components/order-card.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-orders',
  imports: [OrderCardComponent],
  template: `
    <h1 class="mb-4 text-2xl font-bold text-slate-900">Orders</h1>

    <div class="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist">
      @for (f of filters; track f.value) {
        <button
          type="button"
          role="tab"
          class="whitespace-nowrap rounded-full border px-3 py-1.5 text-sm"
          [class]="filter() === f.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'"
          [attr.aria-selected]="filter() === f.value"
          (click)="setFilter(f.value)"
        >
          {{ f.label }}
        </button>
      }
    </div>

    @if (loading()) {
      <p class="text-slate-500">Loading…</p>
    } @else if (orders().length === 0) {
      <div class="card text-center text-slate-500">No orders found.</div>
    } @else {
      <p class="mb-3 text-sm text-slate-500">{{ total() }} order{{ total() === 1 ? '' : 's' }}</p>
      <div class="grid gap-4 lg:grid-cols-2">
        @for (order of orders(); track order.id) {
          <app-order-card [order]="order" [busy]="busyId() === order.id" (statusChange)="changeStatus(order, $event)" />
        }
      </div>

      @if (pages() > 1) {
        <div class="mt-6 flex items-center justify-center gap-3">
          <button type="button" class="btn-secondary" [disabled]="page() <= 1" (click)="goTo(page() - 1)">← Prev</button>
          <span class="text-sm text-slate-600">Page {{ page() }} of {{ pages() }}</span>
          <button type="button" class="btn-secondary" [disabled]="page() >= pages()" (click)="goTo(page() + 1)">Next →</button>
        </div>
      }
    }
  `,
})
export class OrdersComponent implements OnInit {
  private readonly orderService = inject(OrderService);
  private readonly realtime = inject(RealtimeService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly filters: { value: OrderStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    ...ORDER_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
  ];

  protected readonly filter = signal<OrderStatus | 'all'>('all');
  protected readonly orders = signal<Order[]>([]);
  protected readonly page = signal(1);
  protected readonly pages = signal(1);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly busyId = signal<number | null>(null);

  ngOnInit(): void {
    this.load();

    this.realtime.newOrder$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((order) => {
      const f = this.filter();
      if (this.page() === 1 && (f === 'all' || f === 'new') && !this.orders().some((o) => o.id === order.id)) {
        this.orders.update((list) => [order, ...list].slice(0, PAGE_SIZE));
        this.total.update((t) => t + 1);
      }
    });

    this.realtime.orderUpdated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((updated) => {
      this.orders.update((list) => list.map((o) => (o.id === updated.id ? updated : o)));
    });
  }

  protected setFilter(value: OrderStatus | 'all'): void {
    this.filter.set(value);
    this.page.set(1);
    this.load();
  }

  protected goTo(page: number): void {
    this.page.set(page);
    this.load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected changeStatus(order: Order, status: OrderStatus): void {
    this.busyId.set(order.id);
    this.orderService.updateStatus(order.id, status).subscribe({
      next: (updated) => {
        this.busyId.set(null);
        this.orders.update((list) => list.map((o) => (o.id === updated.id ? updated : o)));
        this.toast.success(`${updated.orderNumber} → ${STATUS_LABELS[updated.status]}`);
      },
      error: (err) => {
        this.busyId.set(null);
        this.toast.error(errorMessage(err, 'Could not update status.'));
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    const f = this.filter();
    this.orderService
      .list({ status: f === 'all' ? undefined : f, page: this.page(), limit: PAGE_SIZE })
      .subscribe({
        next: (res) => {
          this.orders.set(res.data);
          this.total.set(res.total);
          this.pages.set(Math.max(1, res.pages));
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.toast.error(errorMessage(err, 'Could not load orders.'));
        },
      });
  }
}
