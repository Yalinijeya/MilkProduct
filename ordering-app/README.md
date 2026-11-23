# Online Ordering App

**Frontend:** Angular 22 (standalone components, signals, Reactive Forms, Tailwind CSS v4)
**Backend:** C# / ASP.NET Core 10 Web API + JSON file storage (no database) + SignalR

```
ordering-app/
├── backend/                         ASP.NET Core Web API (OrderingApi.csproj)
│   ├── Program.cs                   DI, JWT auth, CORS, rate limiting, SignalR, static files, seeding
│   ├── Controllers/                 Auth, Items (+ AdminItems), Orders, Settings
│   ├── Models/                      Admin, Item, Order, OrderItem, ShopSettings
│   ├── Dtos/                        Request/response records
│   ├── Data/                        JsonDataStore (saves JSON files), DataSeeder
│   ├── App_Data/                    The data: admins/items/orders/settings .json (back this up!)
│   ├── Services/                    OrderService, DeliveryCalculator, TokenService,
│   │                                FileStorageService, WhatsAppService (+ background sender)
│   ├── Hubs/OrdersHub.cs            SignalR hub for real-time admin alerts
│   ├── Infrastructure/              Options classes, ApiException, GlobalExceptionHandler
│   ├── wwwroot/uploads/             Item photos (served at /uploads/...)
│   ├── appsettings.json             Non-secret defaults
│   └── .env.example                 Secrets template (copy to .env)
├── frontend/                        Angular app
│   └── src/app/
│       ├── core/services/           ItemService, OrderService, AuthService, SettingsService,
│       │                            CartService, RealtimeService (SignalR), SoundService, ToastService
│       ├── core/guards/             authGuard (AuthGuard for /admin routes)
│       ├── core/interceptors/       authInterceptor (adds the JWT, logs out on 401)
│       ├── core/utils/delivery.ts   Same delivery rule as the backend (live preview)
│       ├── shared/                  OrderCard, toasts, imageUrl & money pipes
│       └── features/customer|admin  Item list, Cart, Checkout, Order success |
│                                    Login, Dashboard, Manage items, Orders, Settings
└── backend-node/                    Previous Node/Express version (not used — safe to delete)
```

## Prerequisites

- **.NET 10 SDK** — `dotnet --version`
- **Node.js 20+** for Angular — `node -v`

## 1. Backend (C#)

```powershell
cd backend
Copy-Item .env.example .env        # then edit .env (JWT secret, admin login, shop location)
dotnet restore
dotnet run                         # http://localhost:5000
```

On startup the API automatically:
1. creates the `App_Data` folder with the JSON data files,
2. creates the admin user from `.env`,
3. creates default shop settings and 5 sample products (only if empty).

Useful commands:

| Command | What it does |
|---|---|
| `dotnet run` | Run the API on http://localhost:5000 |
| `dotnet watch` | Run with hot reload |
| `dotnet run -- --reset-admin` | Reset the admin password to the one in `.env` |
| `dotnet publish -c Release -o publish` | Build for deployment (IIS / Windows service / Linux) |

OpenAPI document (development only): http://localhost:5000/openapi/v1.json

## 2. Frontend (Angular)

```powershell
cd frontend
npm install
npm start                          # http://localhost:4200
npm run build                      # production build → dist/frontend/browser
```

The API address is in `src/environments/environment.development.ts` (dev) and
`src/environments/environment.ts` (production build).

## Shop

| | |
|---|---|
| Name | Uthaya Milk Products Industry (Pvt) Ltd Online Shopping Center |
| Address | Urumpirai East, Jaffna, Sri Lanka |
| WhatsApp | 077 079 8107 (stored as `94770798107`) |
| Currency | Sri Lankan Rupee — `Rs.` (frontend: `src/environments/*.ts`, backend: `Shop__CurrencySymbol`) |

Shop details live in `App_Data/settings.json` — change them any time in **Admin → Settings**. Local numbers such as `0770798107` are converted to international format automatically (country code `Shop__DefaultCountryCode=94`).

## Admin login

| | |
|---|---|
| URL | http://localhost:4200/admin |
| Username | `Uthaya2026` |
| Password | `Uthaya2026@` |

Stored as a bcrypt hash. To change it: edit `Admin__Password` in `.env`, then run `dotnet run -- --reset-admin` once.

## Sample `.env`

```env
ASPNETCORE_ENVIRONMENT=Development
ASPNETCORE_URLS=http://localhost:5000
Cors__Origins=http://localhost:4200

# JSON data files (relative = inside backend/)
Storage__DataFolder=App_Data

# At least 32 characters — keep secret
Jwt__Secret=change-me-to-a-long-random-secret-at-least-32-chars
Jwt__ExpiresHours=12

Admin__Username=Uthaya2026
Admin__Password=Uthaya2026@

# Defaults used only the first time (then edit in Admin → Settings)
Shop__Name="Uthaya Milk Products Industry (Pvt) Ltd Online Shopping Center"
Shop__WhatsApp=94770798107
Shop__Address=Urumpirai East, Jaffna
Shop__Lat=9.72
Shop__Lng=80.04
Shop__FreeKm=5
Shop__ChargePerKm=50
Shop__CurrencySymbol="Rs. "
Shop__DefaultCountryCode=94

Uploads__MaxMb=5

# Automatic WhatsApp to the shop (pick one; blank = off) — see "Notifications"
WhatsApp__CallMeBotApiKey=
WhatsApp__Token=
WhatsApp__PhoneNumberId=
WhatsApp__ApiVersion=v21.0

# Automatic email to the shop (recipient set in Admin → Settings)
Email__Host=smtp.gmail.com
Email__Port=587
Email__Username=yourshop@gmail.com
Email__Password=your16charapppassword
Email__FromName=Milk Shop Orders

TrustProxy=false
```

`__` means a nested setting (`Jwt__Secret` = `Jwt:Secret`). Real environment variables override `.env`;
non-secret defaults live in `appsettings.json`.
Generate a JWT secret in PowerShell: `[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 }))`

## API

| Method | Endpoint | Access | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | public | `{ username, password }` → `{ token, expiresAt, admin }` · 10 tries / 15 min / IP |
| GET | `/api/items` | public | available items only |
| GET | `/api/admin/items` | admin | all items |
| POST | `/api/items` | admin | `multipart/form-data`: `name, price, unit, description, available, photo` |
| PUT | `/api/items/{id}` | admin | same fields, all optional; `removePhoto=true` clears the photo |
| DELETE | `/api/items/{id}` | admin | also deletes the photo file |
| POST | `/api/orders` | public | `{ customer:{name,phone,address,lat,lng}, notes, items:[{itemId,quantity}] }` · 10 / min / IP |
| GET | `/api/orders` | admin | `?status=new,confirmed&page=1&limit=20` |
| PATCH | `/api/orders/{id}/status` | admin | `{ status }`: `new, confirmed, out_for_delivery, delivered, cancelled` |
| GET | `/api/settings` | public | shop name, WhatsApp, notifyEmail, location, freeKm, chargePerKm |
| PUT | `/api/settings` | admin | any subset of the above |
| GET | `/api/admin/notifications` | admin | which notification channels are on, and their recipients |
| POST | `/api/admin/notifications/test` | admin | sends a test WhatsApp + email now |
| WS | `/hubs/orders` | admin | SignalR: `orderNew`, `orderUpdated` |

Admin endpoints need `Authorization: Bearer <token>` (added by the Angular interceptor).
Errors always look like `{ "message": "...", "details": { "field": "..." } }`.

## Delivery charge

`distance = Haversine(shop, customer)` → free up to `FreeKm` (5) → beyond that `ChargePerKm` (50) × extra km **rounded up**.
Example: 7.34 km → 2.34 extra km → 3 × Rs. 50 = **Rs. 150**.

The checkout shows a live preview (`frontend/src/app/core/utils/delivery.ts`), but the API ignores any
prices or charges sent by the browser: it reloads prices from the saved items and recalculates the
distance and delivery charge in `Services/DeliveryCalculator.cs`.
Haversine is straight-line distance; for road distance replace `DeliveryCalculator.Quote` with a
Google Distance Matrix call.

## Notifications

When an order is placed the API:

1. **Saves it** — the order is added to `App_Data/orders.json` with the next number: `ORD-1001`, `ORD-1002`, …
2. **Real-time alert** — broadcasts `orderNew` over **SignalR** (ASP.NET Core's equivalent of Socket.IO).
   The admin panel plays a chime, shows a toast, flashes the tab title, and adds the order to the
   Dashboard instantly. Browsers only allow sound after one click on the page (a banner reminds you);
   🔔 mutes/unmutes.
3. **Automatic WhatsApp + email to the shop** — a background worker (`Services/NotificationService.cs`)
   sends the full order to the shop's WhatsApp number and notification email (both set in
   **Admin → Settings**). Failed sends are retried twice (after 5 s and 30 s). Each order card shows
   ✓ sent / ⚠ failed (hover for the reason). Use **Admin → Settings → Send test** to check your setup.
   - **WhatsApp via CallMeBot (free, easiest):** on the shop's phone save `+34 644 31 95 65` as a
     contact, send it `I allow callmebot to send me messages`, and put the API key it replies with in
     `WhatsApp__CallMeBotApiKey`. It can only message the phone that registered the key, and the
     free API is intended for personal use.
   - **WhatsApp Cloud API (official):** set `WhatsApp__Token` and `WhatsApp__PhoneNumberId` instead.
     ⚠️ Meta delivers free-form text only within 24 hours after the shop's number last messaged your
     business number; otherwise an approved **template** message is required (change `SendMetaAsync`
     in `Services/WhatsAppService.cs` to send `type: "template"`).
   - **Email (SMTP):** set `Email__Host`, `Email__Port`, `Email__Username`, `Email__Password`.
     For Gmail use port 587 and an **App Password** (Google account → Security → 2-Step Verification →
     App passwords), not your normal password.
4. **Click-to-Chat (always on):** a `wa.me` link with the pre-filled message is shown on the
   customer's success page and on every order card in the admin panel.

Message format:

```
🛒 *New Order - Uthaya Milk Products Industry (Pvt) Ltd Online Shopping Center*
*Order ID:* ORD-1001

*Customer:* Ravi
*Phone:* 9876543210
*Address:* 12 Main St
*Map:* https://www.google.com/maps?q=9.7863,80.04

*Items:*
• Curd x 3 = Rs. 135.00
• Full Cream Milk x 1 = Rs. 68.00

*Item total:* Rs. 203.00
*Delivery (7.34 km):* Rs. 150.00
*Grand total:* Rs. 353.00
```

## Deployment notes

- Use a strong `Jwt__Secret`, back up `backend/App_Data` regularly, and set `Cors__Origins` to your real site.
- Change the admin password before going live (see *Admin login*).
- Behind IIS / nginx / a load balancer, set `TrustProxy=true` so rate limiting sees real client IPs.
- "Use my current location" requires **HTTPS** (or localhost).
- Photos are stored on local disk in `wwwroot/uploads`; keep that folder on persistent storage
  (or switch `FileStorageService` to Azure Blob / S3).
- Host the Angular `dist/frontend/browser` folder on any static host with an SPA fallback to `index.html`.
