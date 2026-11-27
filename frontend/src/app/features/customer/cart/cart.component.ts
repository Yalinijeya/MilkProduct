import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartService, maxQuantity } from '../../../core/services/cart.service';
import { SettingsService } from '../../../core/services/settings.service';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';

@Component({
  selector: 'app-cart',
  imports: [RouterLink, ImageUrlPipe, MoneyPipe],
  template: `
    <h1 class="mb-5 text-2xl font-bold text-slate-900">Your cart</h1>

    @if (cart.isEmpty()) {
      <div class="card text-center">
        <p class="text-4xl" aria-hidden="true">🛒</p>
        <p class="mt-2 text-slate-600">Your cart is empty.</p>
        <a routerLink="/" class="btn-primary mt-4">Browse products</a>
      </div>
    } @else {
      <div class="grid gap-6 lg:grid-cols-3">
        <ul class="space-y-3 lg:col-span-2">
          @for (line of cart.lines(); track line.item.id) {
            <li class="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div class="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                @if (line.item.imageUrl) {
                  <img [src]="line.item.imageUrl | imageUrl" [alt]="line.item.name" class="h-full w-full object-cover" />
                } @else {
                  <div class="flex h-full items-center justify-center text-2xl" aria-hidden="true">🥛</div>
                }
              </div>
              <div class="flex min-w-0 flex-1 flex-col">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="truncate font-semibold text-slate-900">{{ line.item.name }}</p>
                    <p class="text-xs text-slate-500">{{ line.item.price | money }}{{ line.item.unit ? ' / ' + line.item.unit : '' }}</p>
                  </div>
                  <button type="button" class="text-sm text-red-600 hover:underline" (click)="cart.remove(line.item.id)">Remove</button>
                </div>
                <div class="mt-auto flex items-center justify-between pt-2">
                  <div class="flex items-center gap-2">
                    <button type="button" class="qty-btn" (click)="cart.setQuantity(line.item.id, line.quantity - 1)" aria-label="Decrease quantity">−</button>
                    <span class="w-6 text-center font-semibold">{{ line.quantity }}</span>
                    <button type="button" class="qty-btn" (click)="cart.setQuantity(line.item.id, line.quantity + 1)" aria-label="Increase quantity" [disabled]="line.quantity >= maxQuantity(line.item)">+</button>
                    @if (line.item.stock !== null && line.quantity >= line.item.stock) {
                      <span class="text-xs text-amber-700">Only {{ line.item.stock }} left</span>
                    }
                  </div>
                  <span class="font-semibold">{{ line.item.price * line.quantity | money }}</span>
                </div>
              </div>
            </li>
          }
        </ul>

        <aside class="card h-fit space-y-3">
          <h2 class="font-semibold text-slate-900">Summary</h2>
          <div class="flex justify-between text-sm">
            <span class="text-slate-500">Items ({{ cart.count() }})</span>
            <span>{{ cart.itemTotal() | money }}</span>
          </div>
          <p class="text-xs text-slate-500">
            Delivery is free within {{ settings.settings()?.freeKm ?? 5 }} km, then
            {{ settings.settings()?.chargePerKm ?? 50 | money }} per extra km. Calculated at checkout.
          </p>
          @if (settings.isOpen()) {
            <a routerLink="/checkout" class="btn-primary w-full">Proceed to checkout</a>
          } @else {
            <p class="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">🔒 {{ settings.status()?.message }}</p>
            <button type="button" class="btn-primary w-full" disabled>Proceed to checkout</button>
          }
          <a routerLink="/" class="btn-secondary w-full">Continue shopping</a>
        </aside>
      </div>
    }
  `,
})
export class CartComponent {
  protected readonly cart = inject(CartService);
  protected readonly settings = inject(SettingsService);
  protected readonly maxQuantity = maxQuantity;
}
