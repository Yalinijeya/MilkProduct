import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // ---------- Customer ----------
  {
    path: '',
    loadComponent: () => import('./features/customer/layout/shop-layout.component').then((m) => m.ShopLayoutComponent),
    children: [
      {
        path: '',
        title: 'Menu',
        loadComponent: () => import('./features/customer/item-list/item-list.component').then((m) => m.ItemListComponent),
      },
      {
        path: 'cart',
        title: 'Your cart',
        loadComponent: () => import('./features/customer/cart/cart.component').then((m) => m.CartComponent),
      },
      {
        path: 'checkout',
        title: 'Checkout',
        loadComponent: () => import('./features/customer/checkout/checkout.component').then((m) => m.CheckoutComponent),
      },
      {
        path: 'order-success',
        title: 'Order placed',
        loadComponent: () =>
          import('./features/customer/order-success/order-success.component').then((m) => m.OrderSuccessComponent),
      },
    ],
  },

  // ---------- Admin ----------
  {
    path: 'admin/login',
    title: 'Admin login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/admin/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    loadComponent: () => import('./features/admin/layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () => import('./features/admin/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'items',
        title: 'Manage items',
        loadComponent: () =>
          import('./features/admin/manage-items/manage-items.component').then((m) => m.ManageItemsComponent),
      },
      {
        path: 'orders',
        title: 'Orders',
        loadComponent: () => import('./features/admin/orders/orders.component').then((m) => m.OrdersComponent),
      },
      {
        path: 'settings',
        title: 'Settings',
        loadComponent: () => import('./features/admin/settings/settings.component').then((m) => m.SettingsComponent),
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
