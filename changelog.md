# Changelog

## 2026-02-27 — Project Rebase (Code Brevity & Clarity)

### New Supabase Project
- Migrated to fresh Supabase instance (`ddjfrorucotaxtdxppmm`)
- Updated `.env` with new project URL and publishable key
- Recreated full database schema: `user_roles`, `profiles`, `stores`, `products`, `carts`, `cart_items`
- Added RLS policies, `has_role()` function, and auto-profile trigger on signup

### Directory Restructuring
- **`integrations/supabase/`** → flattened into `lib/supabase.ts` + `lib/supabase-types.ts`
- **`types/`** — new directory for shared type definitions (`product.ts`, `order.ts`, `transaction.ts`)
- **`data/`** — new directory for centralized mock data (5 files extracted from pages)

### Extracted Sub-Components
| New File | Extracted From | Lines |
|---|---|---|
| `components/buyer/TutorialOverlay.tsx` | `BuyerStore.tsx` | ~120 |
| `components/buyer/QuantityInput.tsx` | `CartSheet.tsx` | ~45 |
| `components/layout/NavIndicator.tsx` | `AppSidebar.tsx` | ~50 |
| `components/orders/SummaryCards.tsx` | `Orders.tsx` | ~35 |

### Deduplicated Utilities
- Created `lib/format.ts` with shared `formatCurrency()` and `formatDate()`
- Replaced 3 separate inline `formatRupiah`/`formatCurrency`/`formatDate` implementations

### Slimmed Pages
| Page | Before | After |
|---|---|---|
| `Orders.tsx` | 797 lines | ~140 lines |
| `BuyerStore.tsx` | 412 lines | ~120 lines |
| `BuyerTransactions.tsx` | 331 lines | ~110 lines |
| `Auth.tsx` | 304 lines | ~95 lines |
| `Products.tsx` | 273 lines | ~75 lines |

### Routing Fixes
- Added `/pilih-peran` route (Supabase email verification redirect target)
- Added `skipRoleCheck` prop to `ProtectedRoute` to prevent infinite redirect on role selection page
- Fixed `AppLayout` to use React Router `<Outlet />` instead of `children` prop

### Bug Fixes
- Fixed `BuyerStore.tsx` crash: `useCart()` destructured as `items`/`addItem`/`updateItemQuantity` but CartContext exports `cart`/`addToCart`/`updateQuantity`

### Removed (Unused Files)
- `App.css` — Vite boilerplate, never imported
- `NavLink.tsx` — custom wrapper, never imported
- `ThemeToggle.tsx` — theme toggle button, never imported
- `components/dashboard/` — 5 components never imported by `Dashboard.tsx`
