import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CartService } from '../../../core/services/cart.service';
import { OrderService } from '../../../core/services/order.service';
import { SettingsService } from '../../../core/services/settings.service';
import { quoteDelivery } from '../../../core/utils/delivery';
import { getCurrentPosition } from '../../../core/utils/geo';
import { errorMessage } from '../../../core/utils/http-error';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';

const CUSTOMER_KEY = 'customer_details';

@Component({
  selector: 'app-checkout',
  imports: [ReactiveFormsModule, RouterLink, MoneyPipe],
  template: `
    <a routerLink="/cart" class="text-sm text-sky-700 hover:underline">← Back to cart</a>
    <h1 class="mb-5 mt-2 text-2xl font-bold text-slate-900">Checkout</h1>

    <form [formGroup]="form" (ngSubmit)="submit()" class="grid gap-6 lg:grid-cols-3" novalidate>
      <section class="card space-y-4 lg:col-span-2">
        <h2 class="font-semibold text-slate-900">Delivery details</h2>

        <div>
          <label class="label" for="name">Full name</label>
          <input id="name" class="input" formControlName="name" autocomplete="name" />
          @if (showError('name')) { <p class="field-error">Please enter your name.</p> }
        </div>

        <div>
          <label class="label" for="phone">Phone number</label>
          <input id="phone" class="input" formControlName="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="e.g. 0771234567" />
          @if (showError('phone')) { <p class="field-error">Please enter a valid phone number.</p> }
        </div>

        <div>
          <label class="label" for="address">Address</label>
          <textarea id="address" class="input" rows="3" formControlName="address" autocomplete="street-address" placeholder="House no, street, landmark, area"></textarea>
          @if (showError('address')) { <p class="field-error">Please enter your address.</p> }
        </div>

        <div class="rounded-lg border border-dashed border-slate-300 p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-sm font-medium text-slate-700">Delivery location</p>
              @if (hasLocation()) {
                <p class="text-xs text-emerald-700">
                  ✓ Location set ({{ form.value.lat?.toFixed(5) }}, {{ form.value.lng?.toFixed(5) }})
                  · <a class="underline" [href]="mapLink()" target="_blank" rel="noopener">check on map</a>
                </p>
              } @else {
                <p class="text-xs text-slate-500">Needed to calculate the delivery charge.</p>
              }
            </div>
            <button type="button" class="btn-secondary" (click)="useMyLocation()" [disabled]="locating()">
              {{ locating() ? 'Locating…' : '📍 Use my current location' }}
            </button>
          </div>
          @if (locationError()) { <p class="field-error">{{ locationError() }}</p> }

          <button type="button" class="mt-2 text-xs text-sky-700 hover:underline" (click)="manual.set(!manual())">
            {{ manual() ? 'Hide manual entry' : 'Enter coordinates manually' }}
          </button>
          @if (manual()) {
            <div class="mt-2 grid grid-cols-2 gap-3">
              <div>
                <label class="label" for="lat">Latitude</label>
                <input id="lat" class="input" type="number" step="any" formControlName="lat" />
              </div>
              <div>
                <label class="label" for="lng">Longitude</label>
                <input id="lng" class="input" type="number" step="any" formControlName="lng" />
              </div>
            </div>
          }
          @if (showError('lat') || showError('lng')) {
            <p class="field-error">Please share your location so we can deliver to you.</p>
          }
        </div>

        <div>
          <label class="label" for="notes">Notes (optional)</label>
          <input id="notes" class="input" formControlName="notes" maxlength="500" placeholder="e.g. Ring the bell twice" />
        </div>
      </section>

      <aside class="card h-fit space-y-3">
        <h2 class="font-semibold text-slate-900">Order summary</h2>
        <ul class="divide-y divide-slate-100 text-sm">
          @for (line of cart.lines(); track line.item.id) {
            <li class="flex justify-between gap-2 py-1.5">
              <span class="min-w-0 truncate">{{ line.item.name }} × {{ line.quantity }}</span>
              <span>{{ line.item.price * line.quantity | money }}</span>
            </li>
          }
        </ul>
        <dl class="space-y-1 border-t border-slate-200 pt-3 text-sm">
          <div class="flex justify-between"><dt class="text-slate-500">Item total</dt><dd>{{ cart.itemTotal() | money }}</dd></div>
          <div class="flex justify-between">
            <dt class="text-slate-500">
              Delivery
              @if (quote(); as q) { <span class="text-xs">({{ q.distanceKm }} km)</span> }
            </dt>
            <dd>
              @if (quote(); as q) {
                {{ q.deliveryCharge === 0 ? 'Free' : (q.deliveryCharge | money) }}
              } @else {
                <span class="text-slate-400">Set location</span>
              }
            </dd>
          </div>
          <div class="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
            <dt>Grand total</dt><dd>{{ grandTotal() | money }}</dd>
          </div>
        </dl>
        @if (settings.settings(); as s) {
          <p class="text-xs text-slate-500">Free within {{ s.freeKm }} km · {{ s.chargePerKm | money }} per extra km (rounded up).</p>
        }
        @if (submitError()) {
          <p class="rounded-lg bg-red-50 p-2 text-sm text-red-700">{{ submitError() }}</p>
        }
        <button type="submit" class="btn-primary w-full py-3 text-base" [disabled]="submitting() || cart.isEmpty()">
          {{ submitting() ? 'Placing order…' : 'Place order' }}
        </button>
        <p class="text-center text-xs text-slate-500">Pay on delivery</p>
      </aside>
    </form>
  `,
})
export class CheckoutComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly orders = inject(OrderService);
  protected readonly cart = inject(CartService);
  protected readonly settings = inject(SettingsService);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    phone: ['', [Validators.required, Validators.pattern(/^\+?[0-9][0-9\s-]{6,18}$/)]],
    address: ['', [Validators.required, Validators.maxLength(500)]],
    lat: [null as number | null, [Validators.required, Validators.min(-90), Validators.max(90)]],
    lng: [null as number | null, [Validators.required, Validators.min(-180), Validators.max(180)]],
    notes: ['', Validators.maxLength(500)],
  });

  protected readonly locating = signal(false);
  protected readonly locationError = signal('');
  protected readonly manual = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal('');

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly hasLocation = computed(() => {
    const { lat, lng } = this.formValue();
    return isValidCoord(lat, 90) && isValidCoord(lng, 180);
  });

  /** Live delivery preview — the backend recalculates the real charge. */
  protected readonly quote = computed(() => {
    const s = this.settings.settings();
    const { lat, lng } = this.formValue();
    if (!s || !this.hasLocation()) return null;
    return quoteDelivery(s, Number(lat), Number(lng));
  });

  protected readonly grandTotal = computed(() => this.cart.itemTotal() + (this.quote()?.deliveryCharge ?? 0));

  protected readonly mapLink = computed(() => {
    const { lat, lng } = this.formValue();
    return `https://www.google.com/maps?q=${lat},${lng}`;
  });

  ngOnInit(): void {
    if (this.cart.isEmpty()) {
      this.router.navigate(['/cart']);
      return;
    }
    if (!this.settings.settings()) this.settings.load().subscribe({ error: () => {} });
    this.restoreCustomer();
  }

  protected showError(name: 'name' | 'phone' | 'address' | 'lat' | 'lng' | 'notes'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  protected async useMyLocation(): Promise<void> {
    this.locating.set(true);
    this.locationError.set('');
    try {
      const { lat, lng } = await getCurrentPosition();
      this.form.patchValue({ lat, lng });
    } catch (e) {
      this.locationError.set((e as Error).message);
      this.manual.set(true);
    } finally {
      this.locating.set(false);
    }
  }

  protected submit(): void {
    this.submitError.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (!this.hasLocation()) this.locationError.set('Please share your delivery location.');
      return;
    }

    const v = this.form.getRawValue();
    const customer = {
      name: v.name!.trim(),
      phone: v.phone!.trim(),
      address: v.address!.trim(),
      lat: Number(v.lat),
      lng: Number(v.lng),
    };

    this.submitting.set(true);
    this.orders
      .place({
        customer,
        notes: v.notes?.trim() ?? '',
        items: this.cart.lines().map((l) => ({ itemId: l.item.id, quantity: l.quantity })),
      })
      .subscribe({
        next: () => {
          this.saveCustomer(customer);
          this.cart.clear();
          this.router.navigate(['/order-success']);
        },
        error: (err) => {
          this.submitting.set(false);
          this.submitError.set(errorMessage(err, 'Could not place your order. Please try again.'));
        },
      });
  }

  /** Remember name/phone/address on this device for the next order. */
  private saveCustomer(c: { name: string; phone: string; address: string; lat: number; lng: number }): void {
    try {
      localStorage.setItem(CUSTOMER_KEY, JSON.stringify(c));
    } catch {
      /* ignore */
    }
  }

  private restoreCustomer(): void {
    try {
      const raw = localStorage.getItem(CUSTOMER_KEY);
      if (raw) this.form.patchValue(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }
}

function isValidCoord(v: unknown, limit: number): boolean {
  if (v === null || v === undefined || v === '') return false;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= limit;
}
