import { Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  template: `
    <div class="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div
          class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg px-4 py-3 text-sm text-white shadow-lg"
          [class.bg-emerald-600]="t.type === 'success'"
          [class.bg-red-600]="t.type === 'error'"
          [class.bg-slate-800]="t.type === 'info'"
          role="status"
        >
          <span class="flex-1">{{ t.message }}</span>
          <button type="button" class="opacity-80 hover:opacity-100" (click)="toast.dismiss(t.id)" aria-label="Dismiss">✕</button>
        </div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  protected readonly toast = inject(ToastService);
}
