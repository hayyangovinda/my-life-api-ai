/**
 * RevenueCat product configuration.
 *
 * Maps store product IDs and RevenueCat entitlement IDs to the internal
 * storage plan IDs defined in config/storage-plans.js.
 *
 * ── How to add a new product ─────────────────────────────────────────────────
 * 1. Add the entry to PRODUCT_PLAN_MAP below.
 * 2. Create the matching product in RevenueCat dashboard → Products.
 * 3. Create the matching subscription in Google Play Console and/or App Store Connect.
 * 4. Attach the product to an Offering Package in RevenueCat.
 *
 * ── Product ID conventions ───────────────────────────────────────────────────
 * Google Play:  mylife_<plan>_monthly   (Subscription product type)
 * App Store:    mylife_<plan>_monthly   (Auto-Renewable Subscription)
 * RevenueCat:   same IDs work for both stores
 *
 * ── Entitlement ID conventions ───────────────────────────────────────────────
 * RevenueCat entitlement ID = internal plan ID (plus / premium / vault).
 * Configure these in RevenueCat dashboard → Entitlements.
 */

// ── Product ID → Plan ID ──────────────────────────────────────────────────────

/**
 * Maps store product identifiers to internal plan IDs.
 * These must exactly match the product IDs configured in:
 *   - Google Play Console  →  Subscriptions
 *   - App Store Connect    →  Subscriptions
 *   - RevenueCat dashboard →  Products
 */
const PRODUCT_PLAN_MAP = {
  mylife_plus_monthly:    'plus',
  mylife_premium_monthly: 'premium',
  mylife_vault_monthly:   'vault',
};

// ── Entitlement ID → Plan ID ──────────────────────────────────────────────────

/**
 * Maps RevenueCat entitlement identifiers to internal plan IDs.
 * These must exactly match the entitlement IDs configured in:
 *   - RevenueCat dashboard → Entitlements
 */
const ENTITLEMENT_PLAN_MAP = {
  plus:    'plus',
  premium: 'premium',
  vault:   'vault',
};

// ── Store → Platform string ───────────────────────────────────────────────────

const STORE_PLATFORM_MAP = {
  PLAY_STORE:  'android',
  APP_STORE:   'ios',
  AMAZON:      'android',
  STRIPE:      'web',
  RC_BILLING:  'web',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Look up the internal plan ID for a store product ID.
 * Returns null if the product is unknown (e.g., not yet mapped here).
 * @param {string|null|undefined} productId
 * @returns {string|null}
 */
function planIdFromProductId(productId) {
  if (!productId) return null;
  return PRODUCT_PLAN_MAP[productId] ?? null;
}

/**
 * Look up the internal plan ID for a RevenueCat entitlement ID.
 * Returns null if the entitlement is unknown.
 * @param {string|null|undefined} entitlementId
 * @returns {string|null}
 */
function planIdFromEntitlementId(entitlementId) {
  if (!entitlementId) return null;
  return ENTITLEMENT_PLAN_MAP[entitlementId] ?? null;
}

/**
 * Map a RevenueCat store name to the internal platform string.
 * @param {string|null|undefined} store  e.g. 'PLAY_STORE'
 * @returns {'android'|'ios'|'web'|null}
 */
function platformFromStore(store) {
  if (!store) return null;
  return STORE_PLATFORM_MAP[store] ?? null;
}

module.exports = {
  PRODUCT_PLAN_MAP,
  ENTITLEMENT_PLAN_MAP,
  planIdFromProductId,
  planIdFromEntitlementId,
  platformFromStore,
};
