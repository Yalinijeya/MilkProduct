import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NotificationStatus, SendResult } from '../../../core/models/models';
import { SettingsService } from '../../../core/services/settings.service';
import { ToastService } from '../../../core/services/toast.service';
import { calculateDeliveryCharge } from '../../../core/utils/delivery';
import { getCurrentPosition } from '../../../core/utils/geo';
import { errorMessage } from '../../../core/utils/http-error';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, MoneyPipe],
  template: `
    <h1 class="mb-5 text-2xl font-bold text-slate-900">Settings</h1>

    @if (loading()) {
      <p class="text-slate-500">Loading…</p>
    } @else {
      <form [formGroup]="form" (ngSubmit)="save()" class="grid gap-6 lg:grid-cols-3" novalidate>
        <div class="space-y-6 lg:col-span-2">
          <section class="card space-y-4">
            <h2 class="font-semibold text-slate-900">Shop</h2>
            <div>
              <label class="label" for="shopName">Shop name</label>
              <input id="shopName" class="input" formControlName="shopName" />
            </div>
            <div>
              <label class="label" for="whatsappNumber">Shop WhatsApp number</label>
              <input id="whatsappNumber" class="input" formControlName="whatsappNumber" inputmode="tel" placeholder="0770798107" />
              <p class="mt-1 text-xs text-slate-500">Local (0770798107) or international (94770798107) format. Order details are sent to this WhatsApp number.</p>
              @if (form.controls.whatsappNumber.invalid && form.controls.whatsappNumber.touched) {
                <p class="field-error">Enter a valid phone number, e.g. 0770798107.</p>
              }
            </div>
            <div>
              <label class="label" for="notifyEmail">Order notification email</label>
              <input id="notifyEmail" class="input" formControlName="notifyEmail" type="text" inputmode="email" placeholder="owner@gmail.com" />
              <p class="mt-1 text-xs text-slate-500">New orders are emailed here. Separate several addresses with commas.</p>
              @if (form.controls.notifyEmail.invalid && form.controls.notifyEmail.touched) {
                <p class="field-error">Enter valid email address(es), e.g. owner&#64;gmail.com.</p>
              }
            </div>
            <div>
              <label class="label" for="shopAddress">Shop address</label>
              <textarea id="shopAddress" class="input" rows="2" formControlName="shopAddress"></textarea>
            </div>
          </section>

          <section class="card space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-semibold text-slate-900">Shop location</h2>
              <button type="button" class="btn-secondary" (click)="useMyLocation()" [disabled]="locating()">
                {{ locating() ? 'Locating…' : '📍 Use my current location' }}
              </button>
            </div>
            <p class="text-xs text-slate-500">Delivery distance is measured from this point. Tip: in Google Maps, long-press your shop and copy the coordinates.</p>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label" for="shopLat">Latitude</label>
                <input id="shopLat" class="input" type="number" step="any" formControlName="shopLat" />
              </div>
              <div>
                <label class="label" for="shopLng">Longitude</label>
                <input id="shopLng" class="input" type="number" step="any" formControlName="shopLng" />
              </div>
            </div>
            @if (form.controls.shopLat.invalid || form.controls.shopLng.invalid) {
              <p class="field-error">Latitude must be −90…90 and longitude −180…180.</p>
            }
            <a class="text-sm text-sky-700 hover:underline" target="_blank" rel="noopener"
               [href]="'https://www.google.com/maps?q=' + form.value.shopLat + ',' + form.value.shopLng">Check on Google Maps ↗</a>
          </section>

          <section class="card space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-semibold text-slate-900">Automatic order notifications</h2>
              <button type="button" class="btn-secondary" (click)="sendTest()" [disabled]="testing() || form.dirty">
                {{ testing() ? 'Sending…' : 'Send test' }}
              </button>
            </div>
            <p class="text-xs text-slate-500">Every new order is sent automatically to the shop's WhatsApp number and notification email.</p>
            @if (notifications(); as n) {
              <ul class="space-y-2 text-sm">
                <li class="flex flex-wrap items-center gap-2">
                  <span class="w-20 font-medium">WhatsApp</span>
                  @if (n.whatsapp.configured) {
                    <span class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">On ({{ n.whatsapp.provider }})</span>
                    <span class="text-slate-600">→ {{ n.whatsapp.recipient || 'no number set' }}</span>
                  } @else {
                    <span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">Off</span>
                    <span class="text-xs text-slate-500">Set the CALLMEBOT_API_KEY secret in Cloudflare</span>
                  }
                </li>
                <li class="flex flex-wrap items-center gap-2">
                  <span class="w-20 font-medium">Email</span>
                  @if (n.email.configured) {
                    <span class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">On</span>
                    <span class="text-slate-600">→ {{ n.email.recipient || 'no email set' }}</span>
                  } @else {
                    <span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">Off</span>
                    <span class="text-xs text-slate-500">Set EMAIL_HOST and the EMAIL_USERNAME / EMAIL_PASSWORD secrets in Cloudflare</span>
                  }
                </li>
              </ul>
            }
            @if (form.dirty) {
              <p class="text-xs text-amber-700">Save your changes before sending a test.</p>
            }
          </section>

          <section class="card space-y-4">
            <h2 class="font-semibold text-slate-900">Delivery charges</h2>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label" for="freeKm">Free delivery up to (km)</label>
                <input id="freeKm" class="input" type="number" min="0" step="0.1" formControlName="freeKm" />
              </div>
              <div>
                <label class="label" for="chargePerKm">Charge per extra km</label>
                <input id="chargePerKm" class="input" type="number" min="0" step="1" formControlName="chargePerKm" />
              </div>
            </div>
          </section>
        </div>

        <aside class="card h-fit space-y-3">
          <h2 class="font-semibold text-slate-900">Delivery charge preview</h2>
          <table class="w-full text-sm">
            <thead><tr class="text-left text-slate-500"><th class="py-1 font-normal">Distance</th><th class="py-1 text-right font-normal">Charge</th></tr></thead>
            <tbody>
              @for (row of examples(); track row.km) {
                <tr class="border-t border-slate-100">
                  <td class="py-1">{{ row.km }} km</td>
                  <td class="py-1 text-right">{{ row.charge === 0 ? 'Free' : (row.charge | money) }}</td>
                </tr>
              }
            </tbody>
          </table>
          <button type="submit" class="btn-primary w-full" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save settings' }}</button>
        </aside>
      </form>
    }
  `,
})
export class SettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly locating = signal(false);
  protected readonly testing = signal(false);
  protected readonly notifications = signal<NotificationStatus | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    shopName: [''],
    whatsappNumber: ['', Validators.pattern(/^\+?[\d\s-]{8,20}$/)],
    notifyEmail: ['', Validators.pattern(/^\s*([^@\s,;]+@[^@\s,;]+\.[^@\s,;]+\s*[,;]?\s*)*$/)],
    shopAddress: [''],
    shopLat: [0, [Validators.required, Validators.min(-90), Validators.max(90)]],
    shopLng: [0, [Validators.required, Validators.min(-180), Validators.max(180)]],
    freeKm: [5, [Validators.required, Validators.min(0)]],
    chargePerKm: [50, [Validators.required, Validators.min(0)]],
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  protected readonly examples = computed(() => {
    const free = Number(this.value().freeKm) || 0;
    const rate = Number(this.value().chargePerKm) || 0;
    return [free, free + 0.3, free + 1, free + 2.5, free + 5].map((km) => ({
      km: Math.round(km * 10) / 10,
      charge: calculateDeliveryCharge(km, free, rate),
    }));
  });

  ngOnInit(): void {
    this.settingsService.load().subscribe({
      next: (s) => {
        this.form.reset(s);
        this.loading.set(false);
        this.loadNotificationStatus();
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error(errorMessage(err, 'Could not load settings.'));
      },
    });
  }

  protected async useMyLocation(): Promise<void> {
    this.locating.set(true);
    try {
      const { lat, lng } = await getCurrentPosition();
      this.form.patchValue({ shopLat: Number(lat.toFixed(6)), shopLng: Number(lng.toFixed(6)) });
      this.form.markAsDirty();
    } catch (e) {
      this.toast.error((e as Error).message);
    } finally {
      this.locating.set(false);
    }
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Please fix the highlighted fields.');
      return;
    }
    this.saving.set(true);
    this.settingsService.update(this.form.getRawValue()).subscribe({
      next: (s) => {
        this.form.reset(s);
        this.saving.set(false);
        this.toast.success('Settings saved');
        this.loadNotificationStatus();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(errorMessage(err, 'Could not save settings.'));
      },
    });
  }

  private loadNotificationStatus(): void {
    this.settingsService.notificationStatus().subscribe({
      next: (n) => this.notifications.set(n),
      error: () => this.notifications.set(null),
    });
  }

  protected sendTest(): void {
    this.testing.set(true);
    this.settingsService.sendTestNotification().subscribe({
      next: (r) => {
        this.testing.set(false);
        if (!r.whatsapp && !r.email) {
          this.toast.error('No notifications are set up yet (see the Cloudflare secrets in README).');
          return;
        }
        this.report('WhatsApp', r.whatsapp);
        this.report('Email', r.email);
      },
      error: (err) => {
        this.testing.set(false);
        this.toast.error(errorMessage(err, 'Could not send the test.'));
      },
    });
  }

  private report(channel: string, result: SendResult | null): void {
    if (!result) return;
    if (result.sent) this.toast.success(`${channel} test sent`);
    else this.toast.error(`${channel} test failed: ${result.error}`);
  }
}
