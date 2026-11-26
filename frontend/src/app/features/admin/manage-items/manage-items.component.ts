import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Item } from '../../../core/models/models';
import { ItemService } from '../../../core/services/item.service';
import { ToastService } from '../../../core/services/toast.service';
import { errorMessage } from '../../../core/utils/http-error';
import { ImageUrlPipe } from '../../../shared/pipes/image-url.pipe';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';

const MAX_PHOTO_MB = 5;

@Component({
  selector: 'app-manage-items',
  imports: [ReactiveFormsModule, ImageUrlPipe, MoneyPipe],
  template: `
    <div class="mb-5 flex items-center justify-between gap-3">
      <h1 class="text-2xl font-bold text-slate-900">Manage items</h1>
      @if (!formOpen()) {
        <button type="button" class="btn-primary" (click)="openNew()">+ Add item</button>
      }
    </div>

    @if (formOpen()) {
      <form [formGroup]="form" (ngSubmit)="save()" class="card mb-6 space-y-4" novalidate>
        <h2 class="font-semibold text-slate-900">{{ editing() ? 'Edit item' : 'New item' }}</h2>

        <div class="grid gap-4 sm:grid-cols-[160px_1fr]">
          <!-- Photo -->
          <div>
            <span class="label">Photo</span>
            <label class="relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:border-sky-400">
              @if (preview()) {
                <img [src]="preview()" alt="Preview" class="h-full w-full object-cover" />
              } @else {
                <span class="px-2 text-center text-xs text-slate-500">Tap to choose a photo</span>
              }
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" class="sr-only" (change)="onPhoto($event)" />
            </label>
            @if (preview()) {
              <button type="button" class="mt-1 text-xs text-red-600 hover:underline" (click)="clearPhoto()">Remove photo</button>
            }
          </div>

          <!-- Fields -->
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label class="label" for="name">Name</label>
              <input id="name" class="input" formControlName="name" />
              @if (form.controls.name.invalid && form.controls.name.touched) { <p class="field-error">Name is required.</p> }
            </div>
            <div>
              <label class="label" for="price">Price</label>
              <input id="price" class="input" type="number" min="0" step="0.01" inputmode="decimal" formControlName="price" />
              @if (form.controls.price.invalid && form.controls.price.touched) { <p class="field-error">Enter a valid price.</p> }
            </div>
            <div>
              <label class="label" for="unit">Unit (optional)</label>
              <input id="unit" class="input" formControlName="unit" placeholder="e.g. 1 L, 500 g" />
            </div>
            <div class="sm:col-span-2">
              <label class="label" for="description">Description (optional)</label>
              <textarea id="description" class="input" rows="2" formControlName="description"></textarea>
            </div>
            <label class="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" class="h-4 w-4 rounded" formControlName="available" />
              Available for customers
            </label>
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <button type="button" class="btn-secondary" (click)="closeForm()" [disabled]="saving()">Cancel</button>
          <button type="submit" class="btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save' }}</button>
        </div>
      </form>
    }

    @if (loading()) {
      <p class="text-slate-500">Loading…</p>
    } @else if (items().length === 0) {
      <div class="card text-center text-slate-500">No items yet. Add your first product.</div>
    } @else {
      <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        @for (item of items(); track item.id) {
          <li class="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm" [class.opacity-60]="!item.available">
            <div class="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
              @if (item.imageUrl) {
                <img [src]="item.imageUrl | imageUrl" [alt]="item.name" class="h-full w-full object-cover" />
              } @else {
                <div class="flex h-full items-center justify-center text-2xl" aria-hidden="true">🥛</div>
              }
            </div>
            <div class="flex min-w-0 flex-1 flex-col">
              <p class="truncate font-semibold text-slate-900">{{ item.name }}</p>
              <p class="text-sm">{{ item.price | money }} <span class="text-slate-500">{{ item.unit }}</span></p>
              <label class="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" [checked]="item.available" (click)="$event.preventDefault(); toggleAvailable(item)" />
                {{ item.available ? 'Available' : 'Hidden' }}
              </label>
              <div class="mt-auto flex gap-3 pt-1 text-sm">
                <button type="button" class="text-sky-700 hover:underline" (click)="openEdit(item)">Edit</button>
                <button type="button" class="text-red-600 hover:underline" (click)="remove(item)">Delete</button>
              </div>
            </div>
          </li>
        }
      </ul>
    }
  `,
})
export class ManageItemsComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly itemService = inject(ItemService);
  private readonly toast = inject(ToastService);

  protected readonly items = signal<Item[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Item | null>(null);
  protected readonly preview = signal<string | null>(null);

  private photo: File | null = null;
  private removePhoto = false;
  private objectUrl: string | null = null;

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    price: [0, [Validators.required, Validators.min(0)]],
    unit: [''],
    description: ['', Validators.maxLength(500)],
    available: [true],
  });

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  protected openNew(): void {
    this.editing.set(null);
    this.form.reset({ name: '', price: 0, unit: '', description: '', available: true });
    this.resetPhoto(null);
    this.formOpen.set(true);
  }

  protected openEdit(item: Item): void {
    this.editing.set(item);
    this.form.reset({
      name: item.name,
      price: item.price,
      unit: item.unit,
      description: item.description,
      available: item.available,
    });
    this.resetPhoto(item.imageUrl ? new ImageUrlPipe().transform(item.imageUrl) : null);
    this.formOpen.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected closeForm(): void {
    this.formOpen.set(false);
    this.editing.set(null);
    this.resetPhoto(null);
  }

  protected onPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.toast.error('Please choose an image file.');
      return;
    }
    if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
      this.toast.error(`Image must be under ${MAX_PHOTO_MB} MB.`);
      return;
    }
    this.revokePreview();
    this.photo = file;
    this.removePhoto = false;
    this.objectUrl = URL.createObjectURL(file);
    this.preview.set(this.objectUrl);
  }

  protected clearPhoto(): void {
    this.resetPhoto(null);
    this.removePhoto = !!this.editing()?.imageUrl;
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const editing = this.editing();
    this.saving.set(true);

    const request = editing
      ? this.itemService.update(editing.id, value, this.photo, this.removePhoto)
      : this.itemService.create(value, this.photo);

    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.items.update((list) =>
          editing ? list.map((i) => (i.id === saved.id ? saved : i)) : [saved, ...list],
        );
        this.toast.success(editing ? 'Item updated' : 'Item added');
        this.closeForm();
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(errorMessage(err, 'Could not save item.'));
      },
    });
  }

  protected toggleAvailable(item: Item): void {
    this.itemService.setAvailable(item.id, !item.available).subscribe({
      next: (saved) => this.items.update((list) => list.map((i) => (i.id === saved.id ? saved : i))),
      error: (err) => {
        this.toast.error(errorMessage(err, 'Could not update item.'));
      },
    });
  }

  protected remove(item: Item): void {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    this.itemService.delete(item.id).subscribe({
      next: () => {
        this.items.update((list) => list.filter((i) => i.id !== item.id));
        if (this.editing()?.id === item.id) this.closeForm();
        this.toast.success('Item deleted');
      },
      error: (err) => this.toast.error(errorMessage(err, 'Could not delete item.')),
    });
  }

  private load(): void {
    this.loading.set(true);
    this.itemService.getAll().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error(errorMessage(err, 'Could not load items.'));
      },
    });
  }

  private resetPhoto(previewUrl: string | null): void {
    this.revokePreview();
    this.photo = null;
    this.removePhoto = false;
    this.preview.set(previewUrl);
  }

  private revokePreview(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }
}
