# Uthaya Milk Products: Online Ordering (Cloudflare version)

Everything runs on **Cloudflare's free plan**. You don't need a server, a database server, or a payment card.

| Part | What it is | Where it lives |
|---|---|---|
| Website | Angular 22 app (shop + admin panel) | `frontend/` |
| Backend API | Cloudflare **Worker** (TypeScript) | `worker/src/` |
| Data | Cloudflare **D1** database (items, orders, settings) | `migrations/` = table definitions |
| Product photos | Cloudflare **KV** storage | served at `/uploads/...` |

The website and the API share one address (for example `https://milkproduct.<your-name>.workers.dev`).

---

## Part 1: One-time setup on your computer

You need **Node.js 20 or newer** (`node -v`). Then, in PowerShell:

```powershell
cd C:\Milk_Product
npm install
npm --prefix frontend install
```

## Part 2: Run it on your computer (optional, for testing)

```powershell
npm run db:migrate:local     # create the local test database (first time only)
npm run import:prepare       # read your old data from C:\Milk product\ordering-app\backend
npm run import:local         # put that data into the local test database
npm run dev                  # build the website and start it
```

Open **http://localhost:8787**. The admin panel is at **http://localhost:8787/admin**.

Local passwords and keys are in the file **`.dev.vars`**. It was filled from your old `backend/.env`. Never share this file.

> If you are changing the Angular code, keep `npm run dev` running and, in a second window, run
> `npm run dev:frontend`. Then open http://localhost:4200, which reloads automatically when you save.

---

## Part 3: Put it on the internet (Cloudflare)

### Step 1: Create a free Cloudflare account
Go to https://dash.cloudflare.com/sign-up and sign up. No card is needed.

### Step 2: Log in from your computer
```powershell
cd C:\Milk_Product
npx wrangler login
```
A browser window opens. Click **Allow**.

### Step 3: Create the database
```powershell
npx wrangler d1 create milkproduct-db
```
It prints a `database_id` such as `a1b2c3d4-....`. Open **`wrangler.jsonc`** and replace
`REPLACE_WITH_YOUR_D1_DATABASE_ID` with that id.
(If Wrangler asks whether to add it to the config for you, answer **No**, because the entry already exists.)

### Step 4: Create the photo storage
```powershell
npx wrangler kv namespace create IMAGES
```
It prints an `id`. In **`wrangler.jsonc`**, replace `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` with it.
(Again, answer **No** if it offers to edit the config.)

### Step 5: Create the tables and copy your existing data
```powershell
npm run db:migrate:remote    # type "y" when asked
npm run import:prepare       # skip if you already ran it in Part 2
npm run import:remote        # your 5 products, 4 orders, shop settings and photos
```

### Step 6: Publish the website
```powershell
npm run deploy
```
At the end it prints your address, for example **https://milkproduct.yourname.workers.dev**.
(The first time, Cloudflare may ask you to choose a free `workers.dev` subdomain name.)

### Step 7: Upload the secret passwords
First, open `.dev.vars` and check the values. To use a different admin password online, change `ADMIN_PASSWORD` here. Then run:
```powershell
npx wrangler secret bulk .dev.vars
```
This sends `JWT_SECRET`, `ADMIN_USERNAME` and `ADMIN_PASSWORD` (and any WhatsApp or email keys) to Cloudflare. They are stored encrypted and are never visible in the website code.

### Step 8: Test it
- Open your `workers.dev` address and place a test order.
- Open `/admin`, log in, and check that the order appears. New orders appear within about 10 seconds, with a sound.

**That's it, the shop is live.**

---

## Changing things later

| I want to… | Do this |
|---|---|
| Change products, prices, photos, shop details, delivery charge | Use the **admin panel**. No code needed |
| Publish code changes | `npm run deploy` |
| Change the admin password | `npx wrangler secret put ADMIN_PASSWORD` |
| See errors or logs | Cloudflare dashboard → Workers & Pages → milkproduct → **Logs** |
| Back up all data | `npx wrangler d1 export milkproduct-db --remote --output backup.sql` |
| Use my own domain (e.g. `uthayamilk.lk`) | Add the domain to Cloudflare, then Workers & Pages → milkproduct → Settings → **Domains & Routes** → Add custom domain |

## Automatic WhatsApp and email for every new order (optional)

These are **off** now, as they were in the old version. To turn them on:

**WhatsApp (free, CallMeBot):**
1. On the shop's phone, save **+34 644 31 95 65** as a contact.
2. Send it this WhatsApp message: `I allow callmebot to send me messages`
3. It replies with an API key. Run `npx wrangler secret put CALLMEBOT_API_KEY` and paste the key.

**Email (Gmail):**
1. In the Google account, turn on 2-Step Verification. Then create an **App Password** at https://myaccount.google.com/apppasswords
2. Run `npx wrangler secret put EMAIL_USERNAME` (your Gmail address)
   and `npx wrangler secret put EMAIL_PASSWORD` (the App Password, without spaces).
3. In the admin panel → **Settings**, enter the email address(es) that should receive orders.

Then use **Admin → Settings → Send test**.
(Server, port and sender name are in `wrangler.jsonc` → `vars`. Port 465 is used. 587 also works.)

---

## Free plan limits (per day, reset at 5:30 AM Sri Lanka time)

| | Free limit | Typical shop use |
|---|---|---|
| Worker requests (`/api` and photos) | 100,000 | A few thousand (website pages themselves are free and unlimited) |
| Database rows read / written | 5,000,000 / 100,000 | Very small |
| Photo uploads (KV writes) | 1,000 | A few |

An open admin page checks for new orders every 10 seconds, which uses about 8,600 requests per day per open tab.
If a limit is ever reached, Cloudflare **does not charge you**. Requests simply fail until the daily reset.

---

## What changed compared to the old C# version

- **Backend:** the C# ASP.NET Core API was rewritten as a Cloudflare Worker (`worker/src/`). All the same URLs and JSON are kept, so the Angular app works the same.
- **Data:** the JSON files in `App_Data` became the D1 database. Uploaded photos moved from `wwwroot/uploads` to KV.
- **Live admin alerts:** SignalR can't run on Workers. The admin panel now checks for new orders every 10 seconds (`frontend/src/app/core/services/realtime.service.ts`). Browsers may check less often in a tab that is hidden for a long time.
- **Admin login:** the username and password are Cloudflare secrets (`ADMIN_USERNAME`, `ADMIN_PASSWORD`) instead of a bcrypt hash in `admins.json`. bcrypt is too slow for the free plan's CPU limit.
- **Unchanged:** order rules (prices and delivery charge calculated on the server), spam protection (10 orders per minute and 10 logins per 15 minutes per IP), the WhatsApp message and email layout, and the order numbers (ORD-1001…).

Your old project in `C:\Milk product\ordering-app` was not changed.

## Project files

```
C:\Milk_Product
├── wrangler.jsonc          Cloudflare settings (database/KV ids, non-secret settings)
├── .dev.vars               Local secrets (passwords) — never share
├── migrations/             Database tables (0001_init.sql)
├── scripts/import-old-data.mjs   Copies the old App_Data + photos into D1/KV
├── worker/src/
│   ├── index.ts            URL routing
│   ├── auth.ts             Admin login + tokens
│   ├── items.ts            Products + photos
│   ├── orders.ts           Place/list orders, delivery charge, live-update feed
│   ├── settings.ts         Shop settings
│   ├── notify.ts           WhatsApp + email notifications
│   ├── smtp.ts             Sends email
│   └── ratelimit.ts        Spam protection
└── frontend/               Angular app (npm run build → frontend/dist)
```
