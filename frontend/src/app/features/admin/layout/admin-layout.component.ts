import { Component, DestroyRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Order } from '../../../core/models/models';
import { AuthService } from '../../../core/services/auth.service';
import { RealtimeService } from '../../../core/services/realtime.service';
import { SoundService } from '../../../core/services/sound.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  host: { '(document:click)': 'sound.unlock()', '(document:keydown)': 'sound.unlock()' },
  template: `
    <div class="min-h-screen bg-slate-100">
      <header class="sticky top-0 z-30 bg-slate-900 text-white">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <a routerLink="/admin" class="flex items-center gap-2 font-bold">
            <img src="logo-icon.png" alt="" width="32" height="32" class="h-8 w-8 rounded-full bg-white" />
            <span>Uthaya Admin</span>
          </a>
          <div class="flex items-center gap-2 text-sm">
            <span class="flex items-center gap-1.5" [title]="realtime.connected() ? 'Live updates on' : 'Reconnecting…'">
              <span class="h-2.5 w-2.5 rounded-full" [class.bg-emerald-400]="realtime.connected()" [class.bg-red-400]="!realtime.connected()"></span>
              <span class="hidden sm:inline">{{ realtime.connected() ? 'Live' : 'Offline' }}</span>
            </span>
            <button type="button" class="rounded-md px-2 py-1 hover:bg-slate-700" (click)="sound.toggle()"
                    [attr.aria-label]="sound.enabled() ? 'Mute alerts' : 'Unmute alerts'">
              {{ sound.enabled() ? '🔔' : '🔕' }}
            </button>
            <button type="button" class="rounded-md px-2 py-1 hover:bg-slate-700" (click)="logout()">Logout</button>
          </div>
        </div>
        <nav class="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-2 text-sm">
          @for (link of links; track link.path) {
            <a [routerLink]="link.path" routerLinkActive="bg-white text-slate-900"
               class="whitespace-nowrap rounded-md px-3 py-1.5 text-slate-200 hover:bg-slate-700 hover:text-white">
              {{ link.label }}
              @if (link.path === 'dashboard' && unseen() > 0) {
                <span class="ml-1 rounded-full bg-amber-400 px-1.5 text-xs font-bold text-slate-900">{{ unseen() }}</span>
              }
            </a>
          }
        </nav>
      </header>

      @if (sound.enabled() && !sound.unlocked()) {
        <div class="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          Click anywhere on the page to enable sound alerts for new orders.
        </div>
      }

      <main class="mx-auto max-w-6xl px-4 py-6">
        <router-outlet (activate)="onActivate()" />
      </main>
    </div>
  `,
})
export class AdminLayoutComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly titleService = inject(Title);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly realtime = inject(RealtimeService);
  protected readonly sound = inject(SoundService);

  protected readonly links = [
    { path: 'dashboard', label: 'Dashboard' },
    { path: 'orders', label: 'Orders' },
    { path: 'items', label: 'Manage items' },
    { path: 'settings', label: 'Settings' },
  ];

  /** New orders received since the admin last opened a page. */
  protected readonly unseen = signal(0);
  private originalTitle = '';
  private flashTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.realtime.connect();
    this.realtime.newOrder$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((order) => this.onNewOrder(order));
  }

  ngOnDestroy(): void {
    this.stopTitleFlash();
    this.realtime.disconnect();
  }

  protected onActivate(): void {
    this.unseen.set(0);
    this.stopTitleFlash();
  }

  protected logout(): void {
    this.realtime.disconnect();
    this.auth.logout();
  }

  private onNewOrder(order: Order): void {
    this.unseen.update((n) => n + 1);
    this.sound.playNewOrder();
    this.toast.show(`🛎️ New order ${order.orderNumber} from ${order.customer.name}`, 'success', 8000);
    this.startTitleFlash(order.orderNumber);
  }

  /** Flashes the browser tab title so the alert is visible even in a background tab. */
  private startTitleFlash(orderNumber: string): void {
    this.stopTitleFlash();
    this.originalTitle = this.titleService.getTitle();
    let on = false;
    this.flashTimer = setInterval(() => {
      on = !on;
      this.titleService.setTitle(on ? `🛎️ New order ${orderNumber}` : this.originalTitle);
    }, 1000);
    // Stop automatically when the admin comes back to the tab
    const stopOnFocus = () => {
      if (document.visibilityState === 'visible') {
        setTimeout(() => this.stopTitleFlash(), 3000);
        document.removeEventListener('visibilitychange', stopOnFocus);
      }
    };
    if (document.visibilityState === 'visible') setTimeout(() => this.stopTitleFlash(), 6000);
    else document.addEventListener('visibilitychange', stopOnFocus);
  }

  private stopTitleFlash(): void {
    if (this.flashTimer) {
      clearInterval(this.flashTimer);
      this.flashTimer = null;
      this.titleService.setTitle(this.originalTitle);
    }
  }
}
