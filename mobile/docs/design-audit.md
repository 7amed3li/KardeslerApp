# Kardeşler Cihangir — Mobile App Design Audit & Redesign Contract

**Date:** 2026-11-13  
**Scope:** `mobile/` customer ordering app (Expo / React Native + Expo Router)  
**Source of Truth:** `C:\Users\Hp\OneDrive\Desktop\Kardesler_Cihangir` (`logo.webp`, `BRAND_GUIDELINES.md`, `src/app/globals.css`, `src/data/menuData.js`) + `backend/` OpenAPI contract.

---

## 1. Visual & UX Audit of Current Implementation

### Environment Note (Screenshots & Runtime)
- Local host (`Windows`) has **no Android SDK / `adb` / `emulator`** and **no iOS simulator**, so native device screenshots cannot be captured directly on this machine.
- Expo Web (`http://localhost:8081`) + live NestJS backend (`http://127.0.0.1:4000`) are running and used for 390×844 mobile-viewport visual verification, paired with React Native Testing Library (`jest-expo`) component tests for native primitives.

### Recorded Defects in Current Codebase

1. **Navigation & Tab Architecture (`app/(tabs)/_layout.tsx`)**
   - Current tabs are `Menü`, `Sepet`, `Siparişler`, `Profil` — missing a dedicated **Ana Sayfa** (Home) discovery screen.
   - No **Persistent Active Basket Bar** when items are in the cart while browsing Home, Menu, or Product Detail; users must switch tabs to see cart total or item count.
   - Tab bar uses `fontWeight: '600'` text labels without crisp vector icons (`lucide-react-native` is installed but unused).

2. **Home & Menu Discovery (`app/(tabs)/index.tsx`)**
   - Home and Menu are collapsed into one dense list: a giant hero banner (`heroBg`) sits above the menu, pushing dish discovery down, followed by a plain `TextInput` and raw category pills.
   - Language switcher is hidden inside `Profil` instead of being immediately accessible on first use / Home.
   - Service context (Delivery vs Pickup, selected address/zone, open/closed/paused state, confirmed ETA/minimum) is missing from the top of the experience.
   - Product cards lack consistent image aspect ratio/cropping, clear availability/sold-out messaging, and dietary/allergen scanning cues; `resolveDishImage` only maps ~30 keys out of 145 `.webp` assets in `mobile/assets/images/`.
   - Empty search/filter state has no one-tap recovery action ("Filtreleri temizle").

3. **Brand Palette & Visual Hierarchy (`src/ui/tokens/colors.ts`, `typography.ts`, `spacing.ts`)**
   - Current primary color is olive `#4E5F4C`, whereas the redesign brief + actual `logo.webp` top arc call for a **deep burgundy/terracotta-plum** ownable brand action color (`#7E2726`), keeping `#EDE3CE` warm wheat canvas, `#F7F2E7`/`#FFFFFF` clean card surfaces, `#2B2620` charcoal ink, `#9C7A3F` saffron/bronze highlights, and `#3D5A3C` green reserved for vegetarian/open/positive states.
   - Typography scale (`24/19/16/15/13/12`) does not follow the requested `32/24/20/16/14/12` scale or specify `Inter` (TR/EN) / `IBM Plex Sans Arabic` / `Noto Sans Arabic` (AR) font families.
   - Loading states use a plain spinner (`StateView`) instead of layout-matched **Skeleton** placeholders.
   - Missing `minAppVersion` gate and `@react-native-community/netinfo` offline banner in `app/_layout.tsx`.
   - Missing `mobile/assets/{icon,adaptive-icon,splash}.png` referenced in `app.config.ts`.

4. **Product Details (`app/menu/[id].tsx`)**
   - Required modifier groups and optional extras are rendered in a flat list without clear visual separation, selection limit badges, or missing-requirement guidance.
   - Note input (`maxLength={100}`) lacks an explicit disclaimer that free-text notes do not guarantee allergen safety.
   - Displayed total is not labeled as a **provisional estimate** pending server quote.

5. **Basket & Checkout (`app/(tabs)/cart.tsx`, `app/checkout/index.tsx`, `app/addresses/index.tsx`)**
   - Basket lacks **remove + Undo toast** feedback, **coupon replacement confirmation**, and a clear **minimum-order progress bar**.
   - Checkout (`app/checkout/index.tsx`) shows everything in one long form rather than a calm, stepped flow; pickup mode still needs crisp hiding of address & delivery fee; inline OTP auth works via `/auth/verify` but needs clear preservation notice.
   - Payment return (`app/payment-return/index.tsx`) needs calm server-verification messaging without implying success prematurely.

6. **Orders & Profile (`app/(tabs)/orders.tsx`, `app/orders/[id].tsx`, `app/(tabs)/profile.tsx`)**
   - Order tracking (`app/orders/[id].tsx`) lacks a clean step timeline, pickup `"Hazır"` label distinction (instead of `"Yolda"`), call-restaurant fallback alongside cancel eligibility, and a **reorder reconciliation sheet** when prices or availability changed.
   - Profile (`app/(tabs)/profile.tsx`) mixes account, preferences, and destructive actions without clean grouped rows; push notification toggles need explicit **OS permission status + system settings link** and clear separation between transactional & marketing push (marketing starts `false`).

7. **RTL & Accessibility**
   - Some components use `marginLeft`/`marginRight` or `left`/`right` instead of logical `marginStart`/`marginEnd` and `start`/`end` for Arabic RTL.
   - Several touchable pills/steppers are below the **44×44 pt** minimum target size.

---

## 2. Design Contract

### Visual Direction
**Contemporary Istanbul food editorial + refined mobile commerce**: warm wheat editorial canvas, crisp light product cards, appetizing photography, deep burgundy primary CTAs, restrained bronze/saffron highlights, and zero decorative clutter or emoji UI icons.

### Color Tokens (WCAG AA Verified)
| Token | Light | Dark | Role |
|---|---|---|---|
| `background` | `#EDE3CE` | `#171411` | Warm wheat / dark espresso page canvas |
| `surface` | `#F7F2E7` | `#221E1A` | Secondary card / grouped container |
| `surfaceElevated` | `#FFFFFF` | `#2C2722` | Primary product cards, sheets, sticky bars |
| `text` | `#2B2620` | `#F5EFE4` | Charcoal primary ink (>11:1 on `#F7F2E7`) |
| `textSecondary` | `#635B4E` | `#C4BAA8` | Secondary copy (>=5.2:1 on `#F7F2E7`) |
| `textMuted` | `#756C5E` | `#9A9080` | Captions / metadata (>=4.5:1 on `#FFFFFF`) |
| `border` | `#DDD1BA` | `#3B342C` | Crisp 1px hairlines |
| `primary` | `#7E2726` | `#B8423F` | Ownable deep burgundy CTA (>7.5:1 with `#FFFFFF`) |
| `primaryPressed` | `#621D1C` | `#983230` | Pressed CTA state |
| `primarySoft` | `#F5E6E5` | `#3A2020` | Subtle active pill / badge tint |
| `primaryText` | `#FFFFFF` | `#FFFFFF` | On-primary text |
| `accent` | `#9C7A3F` | `#D4AC63` | Saffron/bronze highlights (badges, loyalty) |
| `success` | `#3D5A3C` | `#6E9C6B` | Open status, vegetarian, applied coupon |
| `successSoft` | `#E6EFE5` | `#1F301E` | Positive pill tint |
| `error` | `#B3261E` | `#E0665E` | Errors, closed status, destructive actions |
| `errorSoft` | `#F9E4E2` | `#3D1F1D` | Error banner background |

### Typography Scale
- **Font families**: `Inter` (TR/EN), `IBM Plex Sans Arabic` / `Noto Sans Arabic` (AR) with system fallbacks (`System`).
- **Scale**:
  - `display`: `32 / 38` (700)
  - `titleLg`: `24 / 30` (700)
  - `titleMd`: `20 / 26` (700)
  - `titleSm`: `16 / 22` (600)
  - `body`: `14 / 20` (400)
  - `label`: `14 / 20` (600)
  - `caption`: `12 / 16` (500)

### Spacing & Radii (4/8-pt System)
- **Spacing**: `xxs: 4`, `xs: 8`, `sm: 12`, `md: 16`, `lg: 24`, `xl: 32`.
- **Radii**: `sm: 8`, `md: 12`, `lg: 16`, `xl: 20`, `full: 9999`.
- **Touch targets**: Minimum `44×44 pt` on all interactive buttons, steppers, icon buttons, and chips.

### Navigation & Persistent Basket
- **4 Primary Tabs** (`app/(tabs)/_layout.tsx`):
  1. `index` — **Ana Sayfa** (`Home` icon)
  2. `menu` — **Menü** (`UtensilsCrossed` icon)
  3. `orders` — **Siparişlerim** (`Receipt` icon)
  4. `profile` — **Profil** (`User` icon)
- **Persistent Basket Bar** (`PersistentCartBar`): Appears above the tab bar on `Ana Sayfa`, `Menü`, and `Siparişlerim` (and at bottom of `/menu/[id]`) whenever `cart.items.length > 0`. Shows item count badge, provisional subtotal, and **"Sepete Git"** CTA -> navigates to `/cart` (`app/cart.tsx`). Scrollable lists add bottom padding so content is never obscured.

### Component & Interaction Rules
- **Icons**: `lucide-react-native` only; zero emoji as UI icons.
- **Bottom Sheets**: `BottomSheet` component (`Modal` + backdrop + drag handle + safe-area bottom + keyboard avoidance) for customization, coupon picker, reorder reconciliation, and destructive confirmations.
- **Motion**: `150–250 ms` transitions respecting `AccessibilityInfo.isReduceMotionEnabled()`; never animate before server confirmation.
- **RTL**: Use `marginStart`/`marginEnd`, `paddingStart`/`paddingEnd`, `start`/`end`, and `I18nManager.isRTL` mirrored directional icons.

