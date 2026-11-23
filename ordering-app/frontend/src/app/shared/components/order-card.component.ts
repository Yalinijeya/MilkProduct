import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { ORDER_STATUSES, Order, OrderStatus, STATUS_LABELS } from '../../core/models/models';
import { MoneyPipe } from '../pipes/money.pipe';

/** Order details card used by the admin dashboard and orders list. */
@Component({
  selector: 'app-order-card',
  imports: [DatePipe, MoneyPipe],
  template: `
    @let o = order();
    <article
      class="rounded-xl border bg-white p-4 shadow-sm transition"
      [class.border-amber-400]="highlight()"
      [class.ring-2]="highlight()"
      [class.ring-amber-300]="highlight()"
      [class.border-slate-200]="!highlight()"
    >
      <header class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 class="text-base font-semibold text-slate-900">{{ o.orderNumber }}</h3>
          <p class="text-xs text-slate-500">{{ o.createdAt | date: 'medium' }}</p>
        </div>
        <span class="rounded-full px-2.5 py-0.5 text-xs font-medium" [class]="badgeClass(o.status)">
          {{ labels[o.status] }}
        </span>
      </header>

      <div class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div class="space-y-0.5">
          <p class="font-medium text-slate-900">{{ o.customer.name }}</p>
          <p><a class="text-sky-700 hover:underline" [href]="'tel:' + o.customer.phone">{{ o.customer.phone }}</a></p>
          <p class="text-slate-600">{{ o.customer.address }}</p>
          <p>
            <a class="text-sky-700 hover:underline" [href]="o.mapLink" target="_blank" rel="noopener">📍 Open in Maps</a>
            <span class="text-slate-500"> · {{ o.distanceKm }} km</span>
          </p>
          @if (o.notes) {
            <p class="mt-1 rounded bg-amber-50 px-2 py-1 text-amber-900">📝 {{ o.notes }}</p>
          }
        </div>

        <div>
          <ul class="divide-y divide-slate-100">
            @for (line of o.items; track line.itemId) {
              <li class="flex justify-between py-1">
                <span>{{ line.name }} × {{ line.quantity }}</span>
                <span>{{ line.lineTotal | money }}</span>
              </li>
            }
          </ul>
          <dl class="mt-2 space-y-0.5 border-t border-slate-200 pt-2">
            <div class="flex justify-between"><dt class="text-slate-500">Items</dt><dd>{{ o.itemTotal | money }}</dd></div>
            <div class="flex justify-between">
              <dt class="text-slate-500">Delivery</dt>
              <dd>{{ o.deliveryCharge === 0 ? 'Free' : (o.deliveryCharge | money) }}</dd>
            </div>
            <div class="flex justify-between font-semibold"><dt>Total</dt><dd>{{ o.grandTotal | money }}</dd></div>
          </dl>
        </div>
      </div>

      <footer class="mt-4 flex flex-wrap items-center gap-2">
        <label class="sr-only" [for]="'status-' + o.id">Status</label>
        <select
          [id]="'status-' + o.id"
          class="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          [value]="o.status"
          [disabled]="busy()"
          (change)="onStatus($event)"
        >
          @for (s of statuses; track s) {
            <option [value]="s">{{ labels[s] }}</option>
          }
        </select>
        @if (o.status === 'new') {
          <button type="button" class="btn-primary" [disabled]="busy()" (click)="statusChange.emit('confirmed')">Accept</button>
          <button type="button" class="btn-danger" [disabled]="busy()" (click)="statusChange.emit('cancelled')">Reject</button>
        }
        <span class="ml-auto flex flex-wrap gap-1 text-xs">
          @if (o.whatsapp.sent) {
            <span class="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">✓ WhatsApp sent</span>
          } @else if (o.whatsapp.error) {
            <span class="rounded-full bg-red-100 px-2 py-0.5 text-red-800" [title]="o.whatsapp.error">⚠ WhatsApp failed</span>
          }
          @if (o.email.sent) {
            <span class="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">✓ Email sent</span>
          } @else if (o.email.error) {
            <span class="rounded-full bg-red-100 px-2 py-0.5 text-red-800" [title]="o.email.error">⚠ Email failed</span>
          }
        </span>
        @if (o.whatsapp.link) {
          <a class="btn-secondary" [href]="o.whatsapp.link" target="_blank" rel="noopener">WhatsApp</a>
        }
      </footer>
    </article>
  `,
})
export class OrderCardComponent {
  readonly order = input.required<Order>();
  readonly highlight = input(false);
  readonly busy = input(false);
  readonly statusChange = output<OrderStatus>();

  protected readonly statuses = ORDER_STATUSES;
  protected readonly labels = STATUS_LABELS;

  protected onStatus(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as OrderStatus;
    if (value !== this.order().status) this.statusChange.emit(value);
  }

  protected badgeClass(status: OrderStatus): string {
    return {
      new: 'bg-amber-100 text-amber-800',
      confirmed: 'bg-sky-100 text-sky-800',
      out_for_delivery: 'bg-indigo-100 text-indigo-800',
      delivered: 'bg-emerald-100 text-emerald-800',
      cancelled: 'bg-slate-200 text-slate-600',
    }[status];
  }
}
