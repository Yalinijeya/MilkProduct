import { Injectable, computed, effect, signal } from '@angular/core';
import { CartLine, Item } from '../models/models';

const CART_KEY = 'cart';
const MAX_QTY = 100;

/** Most of this item a customer can order: 100, or less if the stock is lower. */
export function maxQuantity(item: Item): number {
  return item.stock === null || item.stock === undefined ? MAX_QTY : Math.max(0, Math.min(MAX_QTY, item.stock));
}

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
    const max = maxQuantity(item);
    if (max === 0) return;
    this._lines.update((lines) => {
      const existing = lines.find((l) => l.item.id === item.id);
      if (existing) {
        return lines.map((l) => (l.item.id === item.id ? { item, quantity: Math.min(max, l.quantity + qty) } : l));
      }
      return [...lines, { item, quantity: Math.min(max, qty) }];
    });
  }

  setQuantity(itemId: number, quantity: number): void {
    if (quantity <= 0) return this.remove(itemId);
    this._lines.update((lines) =>
      lines.map((l) =>
        l.item.id === itemId ? { ...l, quantity: Math.min(maxQuantity(l.item), Math.floor(quantity)) } : l,
      ),
    );
  }

  remove(itemId: number): void {
    this._lines.update((lines) => lines.filter((l) => l.item.id !== itemId));
  }

  clear(): void {
    this._lines.set([]);
  }

  /**
   * Refresh prices/names/stock from the latest catalogue: drops items that are no longer available or
   * out of stock, and lowers quantities above the stock. Returns messages describing the changes.
   */
  syncWithCatalogue(available: Item[]): string[] {
    const byId = new Map(available.map((i) => [i.id, i]));
    const changes: string[] = [];
    this._lines.update((lines) =>
      lines.flatMap((l) => {
        const fresh = byId.get(l.item.id);
        if (!fresh) {
          changes.push(`${l.item.name} is no longer available`);
          return [];
        }
        const max = maxQuantity(fresh);
        if (max === 0) {
          changes.push(`${fresh.name} is out of stock`);
          return [];
        }
        if (l.quantity > max) {
          changes.push(`only ${max} ${fresh.name} left`);
          return [{ item: fresh, quantity: max }];
        }
        return [{ item: fresh, quantity: l.quantity }];
      }),
    );
    return changes;
  }

  private restore(): CartLine[] {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed
            .filter((l) => typeof l?.item?.id === 'number' && l.quantity > 0)
            // Carts saved before stock existed have no stock field: treat as not tracked.
            .map((l) => ({ ...l, item: { ...l.item, stock: l.item.stock ?? null } }))
        : [];
    } catch {
      return [];
    }
  }
}
