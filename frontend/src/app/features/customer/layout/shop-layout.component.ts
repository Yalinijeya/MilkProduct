import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { CartService } from '../../../core/services/cart.service';
import { SettingsService } from '../../../core/services/settings.service';
import { formatDate } from '../../../core/utils/shop-hours';

@Component({
  selector: 'app-shop-layout',
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <a routerLink="/" class="flex min-w-0 items-center gap-2 font-bold text-slate-900">
          <img src="logo-icon.png" alt="" width="48" height="48" class="h-10 w-10 shrink-0 rounded-full sm:h-12 sm:w-12" />
          <span class="line-clamp-2 text-sm leading-tight sm:text-lg">{{ settings.settings()?.shopName || 'Our Shop' }}</span>
        </a>
        <a routerLink="/cart" class="relative inline-flex shrink-0 items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">
          <span aria-hidden="true">🛒</span>
          <span>Cart</span>
          @if (cart.count() > 0) {
            <span class="ml-1 rounded-full bg-white px-2 text-xs font-bold text-sky-700">{{ cart.count() }}</span>
          }
        </a>
      </div>
      @if (settings.status(); as st) {
        @if (!st.open) {
          <div class="border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900" role="status">
            🔒 {{ st.message }}
            @if (settings.settings()?.acceptingOrders) {
              <span class="font-normal">You can still browse and fill your cart.</span>
            }
          </div>
        }
      }
    </header>

    <main class="mx-auto max-w-5xl px-4 py-6 pb-28">
      <router-outlet />
    </main>

    <footer class="space-y-1 border-t border-slate-200 px-4 py-6 text-center text-xs text-slate-500">
      <img src="logo.jpg" alt="Uthaya Milk Products" width="112" height="112" class="mx-auto mb-2 h-28 w-28" loading="lazy" />
      @if (settings.settings(); as s) {
        <p class="font-medium text-slate-700">{{ s.shopName }}</p>
        @if (s.shopAddress) {
          <p>📍 {{ s.shopAddress }}</p>
        }
        @if (s.whatsappNumber) {
          <p>
            <a class="text-emerald-700 hover:underline" [href]="'https://wa.me/' + s.whatsappNumber" target="_blank" rel="noopener">
              💬 WhatsApp {{ localNumber(s.whatsappNumber) }}
            </a>
          </p>
        }
        <div class="mx-auto w-fit py-1">
          <p class="font-medium text-slate-700">🕒 Opening hours</p>
          <table class="mx-auto">
            @for (row of settings.hours(); track row.days) {
              <tr>
                <td class="pr-3 text-left">{{ row.days }}</td>
                <td class="text-left" [class.text-red-600]="row.hours === 'Closed'">{{ row.hours }}</td>
              </tr>
            }
          </table>
          @if (settings.upcomingHolidays().length) {
            <p class="mt-1 text-red-600">Holiday (closed): {{ holidayList() }}</p>
          }
        </div>
        <p>Free delivery within {{ s.freeKm }} km</p>
      }
    </footer>
  `,
})
export class ShopLayoutComponent implements OnInit {
  protected readonly cart = inject(CartService);
  protected readonly settings = inject(SettingsService);

  ngOnInit(): void {
    if (!this.settings.settings()) this.settings.load().subscribe({ error: () => {} });
  }

  /** "Thu 25 Dec, Fri 26 Dec" */
  protected holidayList(): string {
    return this.settings.upcomingHolidays().map(formatDate).join(', ');
  }

  /** 94770798107 → 077 079 8107 (Sri Lankan local format for display). */
  protected localNumber(international: string): string {
    const local = international.startsWith('94') ? '0' + international.slice(2) : international;
    return local.length === 10 ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : local;
  }
}
