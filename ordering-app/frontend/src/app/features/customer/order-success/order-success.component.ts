import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OrderService } from '../../../core/services/order.service';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';

@Component({
  selector: 'app-order-success',
  imports: [RouterLink, MoneyPipe],
  template: `
    @if (orders.lastOrder(); as result) {
      @let o = result.order;
      <div class="mx-auto max-w-lg">
        <div class="card text-center">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl" aria-hidden="true">✓</div>
          <h1 class="mt-4 text-2xl font-bold text-slate-900">Order placed!</h1>
          <p class="mt-1 text-slate-600">Thank you, {{ o.customer.name }}. We've received your order.</p>
          <p class="mt-3 inline-block rounded-lg bg-slate-100 px-3 py-1 font-mono text-lg font-semibold">{{ o.orderNumber }}</p>
        </div>

        <div class="card mt-4">
          <ul class="divide-y divide-slate-100 text-sm">
            @for (line of o.items; track line.itemId) {
              <li class="flex justify-between py-1.5">
                <span>{{ line.name }} × {{ line.quantity }}</span>
                <span>{{ line.lineTotal | money }}</span>
              </li>
            }
          </ul>
          <dl class="mt-2 space-y-1 border-t border-slate-200 pt-3 text-sm">
            <div class="flex justify-between"><dt class="text-slate-500">Item total</dt><dd>{{ o.itemTotal | money }}</dd></div>
            <div class="flex justify-between">
              <dt class="text-slate-500">Delivery ({{ o.distanceKm }} km)</dt>
              <dd>{{ o.deliveryCharge === 0 ? 'Free' : (o.deliveryCharge | money) }}</dd>
            </div>
            <div class="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
              <dt>Grand total</dt><dd>{{ o.grandTotal | money }}</dd>
            </div>
          </dl>
          <p class="mt-3 text-sm text-slate-600">Delivering to: {{ o.customer.address }}</p>
        </div>

        @if (result.whatsappLink) {
          <a class="btn-whatsapp mt-4 w-full py-3 text-base" [href]="result.whatsappLink" target="_blank" rel="noopener">
            Send order details on WhatsApp
          </a>
          <p class="mt-1 text-center text-xs text-slate-500">Optional — the shop has already been notified.</p>
        }
        <a routerLink="/" class="btn-secondary mt-3 w-full">Continue shopping</a>
      </div>
    } @else {
      <div class="card mx-auto max-w-lg text-center">
        <p class="text-slate-600">No recent order found.</p>
        <a routerLink="/" class="btn-primary mt-4">Go to shop</a>
      </div>
    }
  `,
})
export class OrderSuccessComponent {
  protected readonly orders = inject(OrderService);
}
