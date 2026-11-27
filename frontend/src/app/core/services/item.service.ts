import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Item } from '../models/models';

export interface ItemFormValue {
  name: string;
  price: number;
  unit: string;
  description: string;
  available: boolean;
  /**
   * Items in stock: a number, null = unlimited (not tracked),
   * undefined = don't change it (so sales made meanwhile aren't undone).
   */
  stock?: number | null;
}

@Injectable({ providedIn: 'root' })
export class ItemService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  /** Public: available items only. */
  getAvailable(): Observable<Item[]> {
    return this.http.get<Item[]>(`${this.api}/api/items`);
  }

  /** Admin: all items. */
  getAll(): Observable<Item[]> {
    return this.http.get<Item[]>(`${this.api}/api/admin/items`);
  }

  create(value: ItemFormValue, photo: File | null): Observable<Item> {
    return this.http.post<Item>(`${this.api}/api/items`, this.toFormData(value, photo));
  }

  update(id: number, value: ItemFormValue, photo: File | null, removePhoto = false): Observable<Item> {
    const fd = this.toFormData(value, photo);
    if (removePhoto && !photo) fd.append('removePhoto', 'true');
    return this.http.put<Item>(`${this.api}/api/items/${id}`, fd);
  }

  /** Quick availability toggle without re-uploading anything. */
  setAvailable(id: number, available: boolean): Observable<Item> {
    const fd = new FormData();
    fd.append('available', String(available));
    return this.http.put<Item>(`${this.api}/api/items/${id}`, fd);
  }

  /** Quick stock change from the item list. null = unlimited (not tracked). */
  setStock(id: number, stock: number | null): Observable<Item> {
    const fd = new FormData();
    fd.append('stock', stock === null ? '' : String(stock));
    return this.http.put<Item>(`${this.api}/api/items/${id}`, fd);
  }

  delete(id: number): Observable<{ message: string; id: number }> {
    return this.http.delete<{ message: string; id: number }>(`${this.api}/api/items/${id}`);
  }

  private toFormData(value: ItemFormValue, photo: File | null): FormData {
    const fd = new FormData();
    fd.append('name', value.name);
    fd.append('price', String(value.price));
    fd.append('unit', value.unit ?? '');
    fd.append('description', value.description ?? '');
    fd.append('available', String(value.available));
    if (value.stock !== undefined) fd.append('stock', value.stock === null ? '' : String(value.stock));
    if (photo) fd.append('photo', photo);
    return fd;
  }
}
