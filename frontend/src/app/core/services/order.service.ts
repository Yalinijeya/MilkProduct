import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Order, OrderStatus, Paginated, PlaceOrderRequest, PlaceOrderResponse } from '../models/models';

const LAST_ORDER_KEY = 'last_order';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  /** The order the customer just placed (kept in sessionStorage so the success page survives a refresh). */
  readonly lastOrder = signal<PlaceOrderResponse | null>(this.readLastOrder());

  place(request: PlaceOrderRequest): Observable<PlaceOrderResponse> {
    return this.http.post<PlaceOrderResponse>(`${this.api}/api/orders`, request).pipe(
      tap((res) => {
        this.lastOrder.set(res);
        try {
          sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(res));
        } catch {
          /* ignore */
        }
      }),
    );
  }

  list(options: { status?: OrderStatus | OrderStatus[]; page?: number; limit?: number } = {}): Observable<Paginated<Order>> {
    let params = new HttpParams();
    if (options.status) {
      params = params.set('status', Array.isArray(options.status) ? options.status.join(',') : options.status);
    }
    if (options.page) params = params.set('page', options.page);
    if (options.limit) params = params.set('limit', options.limit);
    return this.http.get<Paginated<Order>>(`${this.api}/api/orders`, { params });
  }

  updateStatus(id: number, status: OrderStatus): Observable<Order> {
    return this.http.patch<Order>(`${this.api}/api/orders/${id}/status`, { status });
  }

  private readLastOrder(): PlaceOrderResponse | null {
    try {
      const raw = sessionStorage.getItem(LAST_ORDER_KEY);
      return raw ? (JSON.parse(raw) as PlaceOrderResponse) : null;
    } catch {
      return null;
    }
  }
}
