import { Injectable, computed, effect, signal } from '@angular/core';
import { CartLine, Item } from '../models/models';

const CART_KEY = 'cart';
const MAX_QTY = 100;

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly _lines = signal<CartLine[]>(this.restore());

  readonly lines = this._lines.asReadonly();
  readonly count = computed(() => this._lines().reduce((n, l) => n + l.quantity, 0));
  readonly itemTotal = computed(() =>
    Math.round(this._lines().reduce((sum, l) => sum + l.item.price * l.quantity, 0) * 100) / 100,
  );
  readonly isEmpty = computed(() => this._lines().length === 0);

  constructor() {
    effect(() => {
      const lines = this._lines();
      try {
        localStorage.setItem(CART_KEY, JSON.stringify(lines));
      } catch {
        /* storage unavailable */
      }
    });
  }

  quantityOf(itemId: number): number {
    return this._lines().find((l) => l.item.id === itemId)?.quantity ?? 0;
  }

  add(item: Item, qty = 1): void {
    this._lines.update((lines) => {
      const existing = lines.find((l) => l.item.id === item.id);
      if (existing) {
        return lines.map((l) =>
          l.item.id === item.id ? { item, quantity: Math.min(MAX_QTY, l.quantity + qty) } : l,
        );
      }
      return [...lines, { item, quantity: Math.min(MAX_QTY, qty) }];
    });
  }

  setQuantity(itemId: number, quantity: number): void {
    if (quantity <= 0) return this.remove(itemId);
    this._lines.update((lines) =>
      lines.map((l) => (l.item.id === itemId ? { ...l, quantity: Math.min(MAX_QTY, Math.floor(quantity)) } : l)),
    );
  }

  remove(itemId: number): void {
    this._lines.update((lines) => lines.filter((l) => l.item.id !== itemId));
  }

  clear(): void {
    this._lines.set([]);
  }

  /** Refresh prices/names from the latest catalogue and drop items that are no longer available. */
  syncWithCatalogue(available: Item[]): string[] {
    const byId = new Map(available.map((i) => [i.id, i]));
    const removed: string[] = [];
    this._lines.update((lines) =>
      lines.flatMap((l) => {
        const fresh = byId.get(l.item.id);
        if (!fresh) {
          removed.push(l.item.name);
          return [];
        }
        return [{ item: fresh, quantity: l.quantity }];
      }),
    );
    return removed;
  }

  private restore(): CartLine[] {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((l) => typeof l?.item?.id === 'number' && l.quantity > 0) : [];
    } catch {
      return [];
    }
  }
}
