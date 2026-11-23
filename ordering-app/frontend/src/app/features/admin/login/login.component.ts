import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SoundService } from '../../../core/services/sound.service';
import { errorMessage } from '../../../core/utils/http-error';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <form [formGroup]="form" (ngSubmit)="submit()" class="card w-full max-w-sm space-y-4" novalidate>
        <div class="text-center">
          <img src="logo.jpg" alt="Uthaya Milk Products" width="144" height="144" class="mx-auto h-36 w-36" />
          <h1 class="mt-2 text-xl font-bold text-slate-900">Admin login</h1>
        </div>

        <div>
          <label class="label" for="username">Username</label>
          <input id="username" class="input" type="text" formControlName="username" autocomplete="username"
                 autocapitalize="none" spellcheck="false" />
          @if (form.controls.username.invalid && form.controls.username.touched) {
            <p class="field-error">Username is required.</p>
          }
        </div>

        <div>
          <label class="label" for="password">Password</label>
          <input id="password" class="input" type="password" formControlName="password" autocomplete="current-password" />
          @if (form.controls.password.invalid && form.controls.password.touched) {
            <p class="field-error">Password is required.</p>
          }
        </div>

        @if (error()) {
          <p class="rounded-lg bg-red-50 p-2 text-sm text-red-700">{{ error() }}</p>
        }

        <button type="submit" class="btn-primary w-full" [disabled]="loading()">
          {{ loading() ? 'Signing in…' : 'Sign in' }}
        </button>
        <a routerLink="/" class="block text-center text-sm text-slate-500 hover:underline">← Back to shop</a>
      </form>
    </div>
  `,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sound = inject(SoundService);

  /** Bound from the ?returnUrl= query param (withComponentInputBinding). */
  readonly returnUrl = input<string>();

  protected readonly loading = signal(false);
  protected readonly error = signal('');

  protected readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.maxLength(50)]],
    password: ['', Validators.required],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.sound.unlock(); // user gesture → allow alert sounds later
    this.loading.set(true);
    this.error.set('');

    const { username, password } = this.form.getRawValue();
    this.auth.login(username.trim(), password).subscribe({
      next: () => {
        const target = this.returnUrl();
        this.router.navigateByUrl(target && target.startsWith('/admin') ? target : '/admin');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(errorMessage(err, 'Login failed.'));
      },
    });
  }
}
