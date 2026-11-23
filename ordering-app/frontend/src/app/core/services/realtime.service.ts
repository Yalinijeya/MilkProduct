import { Injectable, inject, signal } from '@angular/core';
import { HttpTransportType, HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Order } from '../models/models';
import { AuthService } from './auth.service';

/**
 * Real-time connection to the ASP.NET Core SignalR hub (/hubs/orders) for admins:
 * new-order alerts and status changes.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);
  private connection: HubConnection | null = null;

  readonly connected = signal(false);
  readonly newOrder$ = new Subject<Order>();
  readonly orderUpdated$ = new Subject<Order>();

  connect(): void {
    if (this.connection || !this.auth.token()) return;

    const connection = new HubConnectionBuilder()
      .withUrl(`${environment.apiUrl}/hubs/orders`, {
        // Read the token on every (re)connect so a fresh login is picked up.
        accessTokenFactory: () => this.auth.token() ?? '',
        transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling,
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 10000, 30000])
      .configureLogging(environment.production ? LogLevel.Error : LogLevel.Warning)
      .build();

    connection.on('orderNew', (order: Order) => this.newOrder$.next(order));
    connection.on('orderUpdated', (order: Order) => this.orderUpdated$.next(order));
    connection.onreconnecting(() => this.connected.set(false));
    connection.onreconnected(() => this.connected.set(true));
    connection.onclose(() => {
      this.connected.set(false);
      // Automatic reconnect gave up — try again in 30s while still logged in.
      if (this.connection === connection) setTimeout(() => this.start(connection), 30000);
    });

    this.connection = connection;
    this.start(connection);
  }

  disconnect(): void {
    const c = this.connection;
    this.connection = null;
    this.connected.set(false);
    void c?.stop();
  }

  private start(connection: HubConnection): void {
    if (this.connection !== connection || connection.state !== HubConnectionState.Disconnected) return;
    if (!this.auth.hasValidToken()) {
      this.disconnect();
      this.auth.logout();
      return;
    }
    connection
      .start()
      .then(() => this.connected.set(true))
      .catch((err: unknown) => {
        this.connected.set(false);
        if (String(err).includes('401')) {
          this.disconnect();
          this.auth.logout();
        } else if (this.connection === connection) {
          setTimeout(() => this.start(connection), 5000);
        }
      });
  }
}
