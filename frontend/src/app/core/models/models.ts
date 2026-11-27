import type { DayHours } from '../utils/shop-hours';

export interface Item {
  id: number;
  name: string;
  description: string;
  price: number;
  unit: string;
  imageUrl: string;
  available: boolean;
  /** Items in stock; null = not tracked (unlimited). */
  stock: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CartLine {
  item: Item;
  quantity: number;
}

export interface ShopSettings {
  shopName: string;
  whatsappNumber: string;
  notifyEmail: string;
  shopAddress: string;
  shopLat: number;
  shopLng: number;
  freeKm: number;
  chargePerKm: number;
  /** Opening hours per day: index 0 = Sunday … 6 = Saturday */
  weeklyHours: DayHours[];
  /** Closed dates, "YYYY-MM-DD" */
  holidays: string[];
  /** false = online orders switched off by the admin */
  acceptingOrders: boolean;
  /** Time zone of the opening hours (read-only, set on the server) */
  timezone: string;
}

export const ORDER_STATUSES = ['new', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'New',
  confirmed: 'Confirmed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export interface OrderLine {
  itemId: number;
  name: string;
  price: number;
  quantity: number;
  lineTotal: number;
}

export interface Customer {
  name: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
}

export interface Order {
  id: number;
  orderNumber: string;
  customer: Customer;
  notes: string;
  items: OrderLine[];
  itemTotal: number;
  distanceKm: number;
  deliveryCharge: number;
  grandTotal: number;
  status: OrderStatus;
  mapLink: string;
  whatsapp: { link: string; sent: boolean; error: string };
  email: { sent: boolean; error: string };
  createdAt: string;
  updatedAt: string;
}

export interface PlaceOrderRequest {
  customer: Customer;
  notes: string;
  items: { itemId: number; quantity: number }[];
}

export interface PlaceOrderResponse {
  order: Order;
  whatsappLink: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  admin: { id: number; username: string };
}

export interface ApiError {
  message: string;
  details?: Record<string, unknown>;
}

export interface NotificationChannelStatus {
  configured: boolean;
  provider: string;
  recipient: string;
}

export interface NotificationStatus {
  whatsapp: NotificationChannelStatus;
  email: NotificationChannelStatus;
}

export interface SendResult {
  sent: boolean;
  error: string;
}

export interface TestNotificationResult {
  whatsapp: SendResult | null;
  email: SendResult | null;
}
