import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Item } from '../../../core/models/models';
import { CartService, maxQuantity } from '../../../core/services/cart.service';
import { ItemService } from '../../../core/services/item.service';
import { ToastService } from '../../../core/services/toast.service';
import { errorMessage } from '../../../core/utils/http-error';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';

@Component({
  selector: 'app-item-list',
  imports: [RouterLink, FormsModule, ImageUrlPipe, MoneyPipe],
  template: `
    <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 class="text-2xl font-bold text-slate-900">Our products</h1>
      <input
        type="search"
        class="input sm:max-w-xs"
        placeholder="Search products…"
        aria-label="Search products"
        [ngModel]="query()"
        (ngModelChange)="query.set($event)"
      />
    </div>

    @if (loading()) {
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        @for (i of [1, 2, 3, 4, 5, 6, 7, 8]; track i) {
          <div class="h-64 animate-pulse rounded-xl bg-slate-200"></div>
        }
      </div>
    } @else if (error()) {
      <div class="card text-center">
        <p class="text-red-600">{{ error() }}</p>
        <button type="button" class="btn-secondary mt-3" (click)="load()">Try again</button>
      </div>
    } @else if (filtered().length === 0) {
      <p class="card text-center text-slate-500">
        {{ items().length === 0 ? 'No products available right now.' : 'No products match your search.' }}
      </p>
    } @else {
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        @for (item of filtered(); track item.id) {
          @let qty = cart.quantityOf(item.id);
          @let max = maxQuantity(item);
          <article class="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div class="relative aspect-square bg-slate-100">
              @if (item.imageUrl) {
                <img [src]="item.imageUrl | imageUrl" [alt]="item.name" class="h-full w-full object-cover" [class.grayscale]="max === 0" loading="lazy" />
              } @else {
                <div class="flex h-full items-center justify-center text-4xl" aria-hidden="true">🥛</div>
              }
              @if (max === 0) {
                <span class="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Out of stock</span>
              } @else if (item.stock !== null && item.stock <= lowStock) {
                <span class="absolute left-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">Only {{ item.stock }} left</span>
              }
            </div>
            <div class="flex flex-1 flex-col p-3">
              <h2 class="font-semibold leading-tight text-slate-900">{{ item.name }}</h2>
              @if (item.unit) {
                <p class="text-xs text-slate-500">{{ item.unit }}</p>
              }
              @if (item.description) {
                <p class="mt-1 line-clamp-2 text-xs text-slate-500">{{ item.description }}</p>
              }
              <div class="mt-auto flex items-center justify-between gap-2 pt-3">
                <span class="font-bold text-slate-900">{{ item.price | money }}</span>
                @if (max === 0) {
                  <button type="button" class="btn-secondary px-3 py-1.5" disabled>Sold out</button>
                } @else if (qty === 0) {
                  <button type="button" class="btn-primary px-3 py-1.5" (click)="add(item)">Add</button>
                } @else {
                  <div class="flex items-center gap-2">
                    <button type="button" class="qty-btn" (click)="cart.setQuantity(item.id, qty - 1)" [attr.aria-label]="'Remove one ' + item.name">−</button>
                    <span class="w-5 text-center font-semibold">{{ qty }}</span>
                    <button type="button" class="qty-btn" (click)="cart.setQuantity(item.id, qty + 1)" [attr.aria-label]="'Add one ' + item.name" [disabled]="qty >= max">+</button>
                  </div>
                }
              </div>
            </div>
          </article>
        }
      </div>
    }

    @if (cart.count() > 0) {
      <div class="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <div class="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div class="text-sm">
            <span class="font-semibold">{{ cart.count() }} item{{ cart.count() === 1 ? '' : 's' }}</span>
            <span class="text-slate-500"> · {{ cart.itemTotal() | money }}</span>
          </div>
          <a routerLink="/cart" class="btn-primary">View cart →</a>
        </div>
      </div>
    }
  `,
})
export class ItemListComponent implements OnInit {
  private readonly itemService = inject(ItemService);
  private readonly toast = inject(ToastService);
  protected readonly cart = inject(CartService);
  protected readonly maxQuantity = maxQuantity;
  /** "Only N left" is shown at or below this stock. */
  protected readonly lowStock = 5;

  protected readonly items = signal<Item[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.items().filter((i) => i.name.toLowerCase().includes(q)) : this.items();
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.itemService.getAvailable().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
        const changes = this.cart.syncWithCatalogue(items);
        if (changes.length) this.toast.show(`Your cart was updated: ${changes.join(', ')}`);
      },
      error: (err) => {
        this.error.set(errorMessage(err, 'Could not load products.'));
        this.loading.set(false);
      },
    });
  }

  protected add(item: Item): void {
    this.cart.add(item);
  }
}
