# SnackTrack — Change Summary

---------

## April 16, 2026

### Midtrans Payment Gateway Integration

Integrated [Midtrans Snap](https://docs.midtrans.com/) payment gateway for real payment processing. Buyers selecting "Bayar Online" at checkout see a Midtrans Snap popup with all available payment methods (QRIS, bank transfer, e-wallet, credit card). Payment status is confirmed via server-to-server webhook notification.

#### How It Works

1. Buyer clicks "Bayar Sekarang" → frontend calls Vercel proxy → Python backend creates a Snap token via `midtransclient`
2. Snap.js popup opens with all payment options (QRIS, VA, GoPay, OVO, etc.)
3. Buyer completes payment in the popup → Midtrans sends a webhook to `/api/payment/callback`
4. Backend verifies SHA512 signature, updates Supabase (`transactions` + `orders`), notifies seller

#### Backend Endpoints (`snacktrackbackend.py`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/payment/create-transaction` | Creates a Midtrans Snap token. Returns `snap_token`, `redirect_url`, and `client_key`. |
| `POST` | `/api/payment/callback` | **Notification URL** — Midtrans POSTs JSON here when payment status changes. Validates SHA512 signature, updates Supabase. Must return HTTP 200. |
| `POST` | `/api/payment/check-status` | Polls Midtrans for a transaction's current status via Core API. |

#### Midtrans Notification URL

Set this in the [Midtrans Dashboard](https://dashboard.sandbox.midtrans.com/settings/vtweb_configuration) → Settings → Configuration → Payment Notification URL:

```
http://game-1.sapphire-cloud.org:25612/api/payment/callback
```

#### Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `MIDTRANS_SERVER_KEY` | Backend (Pterodactyl) | Your Midtrans Server Key (starts with `SB-Mid-server-` for sandbox) |
| `MIDTRANS_CLIENT_KEY` | Backend (Pterodactyl) | Your Midtrans Client Key (starts with `SB-Mid-client-` for sandbox) |
| `MIDTRANS_IS_PRODUCTION` | Backend (Pterodactyl) | `false` for sandbox, `true` for production |
| `PYTHON_API_URL` | Frontend (Vercel) | URL to the Python backend |

#### Database Migration

Run `dbschema_duitku.sql` in Supabase SQL editor. Adds to `transactions` table:
- `duitku_reference` — Reused for Midtrans snap token
- `duitku_payment_url` — Reused for Midtrans redirect URL
- `payment_code` — Midtrans payment type (e.g. `qris`, `bank_transfer`, `gopay`)

#### Signature Verification

| Action | Hash | Formula |
|--------|------|---------|
| Callback validation | SHA512 | `SHA512(order_id + status_code + gross_amount + server_key)` |

#### Frontend Changes

- **CheckoutDialog** — Simplified to "Bayar Online" (opens Midtrans Snap popup) and "COD". Midtrans handles payment method selection.
- **Snap.js** — Loaded dynamically from `https://app.sandbox.midtrans.com/snap/snap.js` with the client key.
- **PaymentResult page** (`/payment/result`) — Fallback page for redirect flow.
- **Vercel Edge proxy** (`api/payment.ts`) — Authenticates user JWT, forwards to Python backend.

#### Testing (Sandbox)

1. Get sandbox credentials from [Midtrans Dashboard](https://dashboard.sandbox.midtrans.com/settings/config_info)
2. Set `MIDTRANS_IS_PRODUCTION=false` with sandbox keys
3. Complete a checkout → Snap popup appears with test payment methods
4. Use test card `4811 1111 1111 1114` (any CVV, any future expiry) for credit card testing
5. QRIS and VA payments auto-succeed in sandbox


---------



## March 3, 2026

### Theme Color Update
- **Amber red theme** — Changed site-wide primary color from warm orange (`hsl(24, 95%, 53%)`) to amber red `#B91900` (`hsl(7, 100%, 36%)`) for better contrast and readability, especially for older users. Updated all CSS custom properties in `index.css` across light mode, dark mode, ring, chart, and sidebar variables.

### Profile Dropdown Menu
- **Clickable profile area** — The user profile section at the bottom of the sidebar is now a dropdown trigger. Clicking it opens a menu with **Profil Saya** (navigate to onboarding/profile), **Pengaturan** (settings), and **Keluar** (sign out, styled in red). Works in both expanded and collapsed sidebar states. Uses Radix `DropdownMenu` component.

### Responsive Mobile Layout
- **Bottom navigation bar** — On phone-sized screens (`< md`), the sidebar is hidden and replaced with a fixed bottom navigation bar showing nav items as icon + label buttons, cart with badge (buyer), and a profile dropdown. (`AppSidebar.tsx`)
- **Layout padding** — `AppLayout.tsx` adjusted: no left padding on mobile, bottom padding to clear the nav bar, slightly smaller content padding.
- **Compact product cards** — Product grid changed to **2 columns on mobile** with tighter gaps. `BuyerProductCard` is more compact on small screens: smaller text, reduced padding, 1-line description, hidden store name, smaller badges.

---------

## 1. Bug Fixes & Stability

- **"Memuat..." infinite hang** — Rewrote `AuthContext.tsx` with `Promise.race` timeouts on all Supabase calls (`fetchRoles` 4s, `signIn`/`signUp` 10s, `getSession` 6s failsafe). Added `initDone` ref to prevent React StrictMode double-init.
- **"Memproses..." login hang** — `signIn`/`signUp` now have 10s timeout; `Auth.tsx` catches errors and shows "Kesalahan jaringan" toast instead of freezing.
- **Logout failing offline** — `signOut()` clears local state before calling `supabase.auth.signOut()`.
- **React Router v7 warnings** — Added `v7_startTransition` and `v7_relativeSplatPath` future flags in `App.tsx`.

---------

## 2. Visual Changes

- **Sticky headers** on 4 pages (`Products`, `Orders`, `BuyerStore`, `BuyerTransactions`) — title, search, filters, tabs stick to top while content scrolls behind. Uses `-mx-6 px-6` trick for edge-to-edge background + subtle shadow separator.
- **Sliding active indicator** on sidebar — white pill animates between nav items, persists via localStorage.
- **Sidebar collapse persists** across navigation via localStorage.
- **Role-based sidebar** — Buyer sees Shop/Transaksi/Keranjang; Seller sees Ringkasan/Produk/Transaksi/Prediksi Penjualan.
- **Tutorial overlay** — Full-screen guided highlight on first product card when cart is empty (SVG mask cutout, smart tooltip positioning).
- **Cart controls on product cards** — Hover "Tambah" button, +/− quantity controls, stock limit, quantity badge.
- **Cart sheet polish** — Editable quantity input, stock limit warning, delete popover with confirmation.

---------

## 3. Function Changes

- **Seller Orders page** (`Orders.tsx`) — Full management page with 8 mock orders, summary cards (revenue/pending/processing/total), 6 status tabs, search + date filter, expandable rows with buyer info/items/pricing breakdown, and status actions (advance/cancel/manual set).
- **Product Quick View modal** (`ProductQuickViewModal.tsx`) — Two-column modal (image + form) for editing product name, category, price, stock, description, and image upload.
- **Buyer Transactions page** (`BuyerTransactions.tsx`) — Status tabs, search, date filter, expandable transaction cards with item breakdown. 6 mock transactions.
- **Per-user cart system** (`CartContext.tsx`) — Cart stored in localStorage keyed by user ID. Smart Keranjang sidebar button (empty → tutorial, has items → auto-open cart).
- **Session expiry** — Login timestamp in localStorage, 24-hour max age (`SESSION_MAX_AGE_MS`), auto-logout timer in background.

---------

## 4. Database Connections (Need Attention)

> [!IMPORTANT]
> These features use **mock data or localStorage** and need Supabase integration.

| Feature | Current State | Needs |
|---|---|---|
| Products / Store | Hardcoded arrays in `BuyerStore.tsx`, `Products.tsx` | Supabase `products` table |
| Cart | localStorage per user | Supabase `cart_items` table |
| Buyer Transactions | Mock data in `BuyerTransactions.tsx` | Supabase `orders` table |
| Seller Orders | Mock data in `Orders.tsx` | Supabase `orders` table (seller filter) |
| Dashboard Stats | Hardcoded in `Dashboard.tsx` | Aggregate from order/product data |
| Analytics | Data source unknown | Supabase analytics/order data |
| Store Map | Mock locations in `NearestStoreDialog.tsx` | Supabase `stores` table |
| Checkout | Button only, no logic | Full checkout flow + payment |
| Stock | Hardcoded values | Real-time stock with purchase decrement |
| User Roles | Fetched with 4s timeout fallback | Verify persistence server-side |
| Auth | Working with timeout protection | Verify token refresh handling |
