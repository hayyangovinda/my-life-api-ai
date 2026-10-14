# Billing Setup — My Life

This document covers everything needed to take billing from code-complete to live.

---

## Architecture overview

```
iOS App (StoreKit)  ──┐
                      ├─▶  RevenueCat  ──▶  POST /api/v1/billing/webhook
Android App (Play)  ──┘                       └─▶  Updates User.storagePlanId
```

- **RevenueCat** validates receipts with Apple / Google, manages subscription lifecycle, and fires webhooks for every event.
- The backend is the **authoritative source of truth** for plan entitlements.  Client-side SDK state is never trusted directly.
- `POST /api/v1/billing/restore` lets the frontend sync immediately after a purchase without waiting for the webhook.

---

## Storage plans

| Plan ID  | Storage | Price/month | Product ID (store) |
|----------|---------|-------------|-------------------|
| `free`   | 500 MB  | $0          | *(no product — no payment)* |
| `plus`   | 10 GB   | $1.99       | `mylife_plus_monthly` |
| `premium`| 50 GB   | $4.99       | `mylife_premium_monthly` |
| `vault`  | 200 GB  | $9.99       | `mylife_vault_monthly` |

> **Prices are reference USD values only.** The actual localized price shown to each customer is fetched from the store via `Purchases.getOfferings()` and reflected in `pkg.product.priceString`.

---

## Environment variables

### Backend (`my-life-api-ai/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `REVENUECAT_WEBHOOK_SECRET` | ✅ Yes | Shared secret set in RevenueCat dashboard → Webhooks. Must match the `Authorization: Bearer <secret>` header RevenueCat sends. |
| `REVENUECAT_API_KEY` | ✅ Yes | **Secret** API key from RevenueCat dashboard → Project Settings → API Keys → Secret Keys. Used by `POST /api/v1/billing/restore` to call the RevenueCat REST API. |

Example `.env` additions:

```bash
REVENUECAT_WEBHOOK_SECRET=rc_wh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
REVENUECAT_API_KEY=rcsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Frontend (`my-life-ai/src/app/services/billing.service.ts`)

The two **public** API keys (safe to embed in the app bundle) must be replaced with your project keys:

```typescript
// Line ~55 in billing.service.ts
const RC_IOS_API_KEY     = 'appl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const RC_ANDROID_API_KEY = 'goog_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
```

These are found in RevenueCat dashboard → Project Settings → API Keys → Public Keys.

---

## RevenueCat dashboard configuration

### Step 1 — Create a project

1. Sign in at [app.revenuecat.com](https://app.revenuecat.com)
2. Create a new project named **My Life**
3. Add **Apple App Store** and **Google Play Store** apps
   - iOS app bundle ID: `com.mylife.app`
   - Android package name: `com.mylife.app`

### Step 2 — Configure products

Create one product per store per plan. Use the exact identifiers in the tables below.

**Google Play Console** (Subscriptions → Create subscription):

| Product ID | Base plan | Price |
|-----------|-----------|-------|
| `mylife_plus_monthly` | `monthly` | $1.99/month |
| `mylife_premium_monthly` | `monthly` | $4.99/month |
| `mylife_vault_monthly` | `monthly` | $9.99/month |

**App Store Connect** (In-App Purchases → Create → Auto-Renewable Subscription):

| Product ID | Subscription group | Price |
|-----------|--------------------|-------|
| `mylife_plus_monthly` | My Life Storage | $1.99/month |
| `mylife_premium_monthly` | My Life Storage | $4.99/month |
| `mylife_vault_monthly` | My Life Storage | $9.99/month |

Then in **RevenueCat → Products**, import/add each product and attach to the correct app.

### Step 3 — Create entitlements

In RevenueCat → **Entitlements**, create three entitlements:

| Entitlement ID | Display name | Attached products |
|---------------|-------------|-------------------|
| `plus` | Plus Storage | `mylife_plus_monthly` (both stores) |
| `premium` | Premium Storage | `mylife_premium_monthly` (both stores) |
| `vault` | Vault Storage | `mylife_vault_monthly` (both stores) |

### Step 4 — Create an offering

In RevenueCat → **Offerings**, create a default offering (identifier: `default`).

Add three **packages** with custom identifiers:

| Package identifier | Type | Attached product |
|-------------------|------|-----------------|
| `plus` | Custom | `mylife_plus_monthly` |
| `premium` | Custom | `mylife_premium_monthly` |
| `vault` | Custom | `mylife_vault_monthly` |

Set this offering as the **Current Offering**.

### Step 5 — Configure the webhook

In RevenueCat → **Project Settings** → **Integrations** → **Webhooks**:

1. Click **Add Webhook**
2. **URL**: `https://<your-railway-backend-url>/api/v1/billing/webhook`
3. **API version**: `1.0`
4. **Authorization header**: Create a strong random secret string and enter it here
5. Copy the same secret to `REVENUECAT_WEBHOOK_SECRET` in your Railway environment variables

Test the webhook using the **Send Test Event** button — you should see a 200 response.

### Step 6 — Server credentials

RevenueCat needs credentials to validate receipts with the stores.

**Apple:**
- App Store Connect → Users & Access → Keys → Generate an API key with **Developer** role
- In RevenueCat → App settings → Apple App Store → App Store Connect API Key

**Google:**
- Google Play Console → Setup → API access → Link to a Google Cloud project → Create service account
- Grant the service account **Financial data viewer** + **Viewer** permissions
- Download the JSON key
- In RevenueCat → App settings → Google Play → Service Account

---

## API endpoints

### `POST /api/v1/billing/webhook`

RevenueCat sends events here. No JWT required.

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer <REVENUECAT_WEBHOOK_SECRET>` |

Handled events: `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `PRODUCT_CHANGE`,
`CANCELLATION`, `BILLING_ISSUE`, `EXPIRATION`, `REFUND`, `TRANSFER`.

Each event is processed idempotently using `event.id` stored in the `WebhookEvent`
collection (TTL: 90 days).

### `GET /api/v1/billing/status`

Returns the authenticated user's subscription state.

```json
{
  "planId": "premium",
  "subscriptionStatus": "active",
  "subscriptionPlatform": "ios",
  "subscriptionProductId": "mylife_premium_monthly",
  "subscriptionExpiresAt": "2026-11-14T00:00:00.000Z",
  "nextRenewalDate": "November 14, 2026"
}
```

### `POST /api/v1/billing/restore`

Calls RevenueCat REST API to sync the user's current entitlements. Returns the
same shape as `/billing/status`. Call this immediately after a successful purchase.

---

## Lifecycle event handling

| RevenueCat event | What happens |
|-----------------|-------------|
| `INITIAL_PURCHASE` | Plan set; `subscriptionStatus = 'active'` |
| `RENEWAL` | Expiry refreshed; plan kept |
| `UNCANCELLATION` | User re-enabled; status back to `'active'` |
| `PRODUCT_CHANGE` | Plan switched to new product/entitlement |
| `CANCELLATION` | `subscriptionStatus = 'cancelled'`; plan unchanged until expiry |
| `BILLING_ISSUE` | `subscriptionStatus = 'billing_retry'`; plan unchanged (store manages grace period) |
| `EXPIRATION` | Plan → `'free'`; all subscription fields cleared |
| `REFUND` | Immediate plan → `'free'`; all subscription fields cleared |

---

## Cancellation flow

Subscriptions must be cancelled through the platform store — there is no in-app API to cancel a subscription directly.

- **iOS**: `itms-apps://apps.apple.com/account/subscriptions`
- **Android**: `https://play.google.com/store/account/subscriptions`

The app redirects users to these URLs when they tap "Cancel Subscription".
Access continues until `EXPIRATION` fires at the end of the billing period.

---

## Testing with sandbox accounts

Before going live:

1. **iOS sandbox**: Create a sandbox tester account in App Store Connect → Users & Access → Sandbox Testers. Use this Apple ID to purchase on a development device.
2. **Android**: Use a licence testing account (added in Google Play Console → Setup → Licence testing). Install via internal testing track.
3. In RevenueCat dashboard → Sandbox tab, confirm events arrive and entitlements are granted correctly.
4. Verify the webhook fires and `storagePlanId` is updated in MongoDB.

---

## What still requires dashboard configuration before going live

The following items cannot be automated by code and must be completed manually:

- [ ] **RevenueCat project created** and both iOS and Android apps added
- [ ] **Products created in Google Play Console** (3 subscriptions, IDs as above)
- [ ] **Products created in App Store Connect** (3 auto-renewable subscriptions, IDs as above)
- [ ] **Products imported into RevenueCat** and attached to entitlements
- [ ] **Default offering configured** in RevenueCat with the 3 custom packages
- [ ] **App Store Connect API key** added to RevenueCat (for receipt validation)
- [ ] **Google Play service account JSON** added to RevenueCat (for receipt validation)
- [ ] **Webhook URL configured** in RevenueCat pointing to the production backend
- [ ] **`REVENUECAT_WEBHOOK_SECRET`** set in Railway environment variables (same value as RevenueCat)
- [ ] **`REVENUECAT_API_KEY`** (secret key) set in Railway environment variables
- [ ] **`RC_IOS_API_KEY`** (public key) replaced in `billing.service.ts` before app build
- [ ] **`RC_ANDROID_API_KEY`** (public key) replaced in `billing.service.ts` before app build
- [ ] **Sandbox tested** on both iOS and Android with test accounts

> ⚠️ Do not publish to the App Store or Google Play with placeholder API keys.
> Purchases will silently fail until RevenueCat is fully configured and the keys are correct.

---

## Relevant source files

| File | Purpose |
|------|---------|
| `my-life-api-ai/config/revenuecat-products.js` | Product ID and entitlement → plan ID mapping |
| `my-life-api-ai/controllers/billing-controller.js` | Webhook handler, status, restore |
| `my-life-api-ai/routes/billing-route.js` | Route registration |
| `my-life-api-ai/models/webhook-event-model.js` | Idempotency store (90-day TTL) |
| `my-life-api-ai/models/user-model.js` | Subscription fields on User |
| `my-life-api-ai/__tests__/billing-webhook.test.js` | 44 unit tests |
| `my-life-ai/src/app/services/billing.service.ts` | RevenueCat Capacitor SDK wrapper |
| `my-life-ai/src/app/services/http.service.ts` | `restorePurchases()`, `getBillingStatus()` |
| `my-life-ai/src/app/storage-upgrade/storage-upgrade.component.ts` | Real purchase flow |
| `my-life-ai/src/app/storage-manage/storage-manage.component.ts` | Cancel → redirect to store |
