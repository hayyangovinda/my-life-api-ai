/**
 * Billing controller — RevenueCat webhook processing and subscription management.
 *
 * Architecture
 * ─────────────
 * All subscription state changes flow through this single path:
 *
 *   Store (Google Play / App Store)
 *     └─▶ RevenueCat (validates receipt, manages lifecycle)
 *           └─▶ POST /api/v1/billing/webhook  ← this controller
 *                 └─▶ Updates User.storagePlanId + subscription fields
 *
 * Clients never update their own plan.  The frontend calls POST /restore after
 * a purchase to immediately sync state via RevenueCat REST API, but the webhook
 * is the authoritative signal for all ongoing lifecycle events.
 *
 * Webhook security
 * ─────────────────
 * Every inbound request must carry:
 *   Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>
 *
 * Set this shared secret in RevenueCat dashboard → Project → Webhooks.
 *
 * Idempotency
 * ───────────
 * Each RevenueCat event has a unique `event.id` (UUID).  Before processing,
 * we attempt to insert this ID into the WebhookEvent collection.  A duplicate-
 * key error means the event was already processed and we return 200 immediately.
 *
 * Handled event types
 * ────────────────────
 *   INITIAL_PURCHASE  → grant plan, set status = active
 *   RENEWAL           → refresh expiry, keep plan active
 *   UNCANCELLATION    → user re-enabled; set status = active
 *   PRODUCT_CHANGE    → switch plan (new_product_id / new entitlement_id)
 *   CANCELLATION      → set status = cancelled; keep plan until expiry
 *   BILLING_ISSUE     → set status = billing_retry; store handles grace period
 *   EXPIRATION        → downgrade to free; clear subscription fields
 *   REFUND            → immediate downgrade to free
 *   TRANSFER          → acknowledged but not acted upon (complex case)
 *   (others)          → acknowledged without action
 */

const User = require('../models/user-model');
const WebhookEvent = require('../models/webhook-event-model');
const {
  planIdFromProductId,
  planIdFromEntitlementId,
  platformFromStore,
} = require('../config/revenuecat-products');
const { getPlanById } = require('../config/storage-plans');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Human-readable date label for storageNextRenewalDate.
 * @param {Date|null} date
 * @returns {string|null}
 */
function renewalLabel(date) {
  if (!date) return null;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Build the subscription update payload for active-plan events.
 * @param {string} planId
 * @param {string|null} productId
 * @param {string|null} platform
 * @param {Date|null}   expiresAt
 */
function activePlanUpdate(planId, productId, platform, expiresAt) {
  return {
    storagePlanId: planId,
    subscriptionStatus: 'active',
    subscriptionPlatform: platform,
    subscriptionProductId: productId,
    subscriptionExpiresAt: expiresAt,
    storageNextRenewalDate: renewalLabel(expiresAt),
  };
}

/**
 * Build the payload that downgrades a user to the free plan.
 */
function freePlanUpdate() {
  return {
    storagePlanId: 'free',
    subscriptionStatus: 'expired',
    subscriptionPlatform: null,
    subscriptionProductId: null,
    subscriptionExpiresAt: null,
    storageNextRenewalDate: null,
  };
}

// ── POST /api/v1/billing/webhook ──────────────────────────────────────────────

/**
 * Handle a RevenueCat webhook event.
 *
 * Authentication: Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>
 * Idempotency:    event.id stored in WebhookEvent collection (unique index)
 *
 * Always returns 200 once the event has been acknowledged, so RevenueCat does
 * not retry it unnecessarily.  Returns 4xx only for authentication failures and
 * malformed payloads.
 */
const handleWebhook = async (req, res) => {
  // ── 1. Authenticate ─────────────────────────────────────────────────────────
  const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Billing not configured — reject all webhooks
    return res.status(503).json({ message: 'Billing webhook not configured' });
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${webhookSecret}`) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // ── 2. Validate payload ──────────────────────────────────────────────────────
  const { event } = req.body ?? {};
  if (!event || typeof event.id !== 'string' || !event.type || !event.app_user_id) {
    return res.status(400).json({ message: 'Invalid webhook payload' });
  }

  // ── 3. Idempotency check ─────────────────────────────────────────────────────
  try {
    await WebhookEvent.create({ eventId: event.id });
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key — event already processed
      return res.status(200).json({ message: 'Already processed' });
    }
    throw err;
  }

  // ── 4. Route to handler ───────────────────────────────────────────────────────
  const userId = event.app_user_id;
  const eventType = event.type;
  const platform = platformFromStore(event.store);
  const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;

  // Resolve plan from entitlement (preferred) or product ID
  const planId = planIdFromEntitlementId(event.entitlement_id)
    ?? planIdFromProductId(event.product_id)
    ?? null;

  // Verify the resolved plan actually exists in our config
  const validPlan = planId ? getPlanById(planId) : null;

  switch (eventType) {
    // ── Grant or refresh paid plan ─────────────────────────────────────────────
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION': {
      if (!validPlan) {
        console.warn(`[billing] ${eventType}: unknown plan from product='${event.product_id}' entitlement='${event.entitlement_id}' (event ${event.id})`);
        break;
      }
      await User.findByIdAndUpdate(
        userId,
        activePlanUpdate(validPlan.id, event.product_id, platform, expiresAt),
        { runValidators: true }
      );
      console.log(`[billing] ${eventType}: userId=${userId} → plan=${validPlan.id}`);
      break;
    }

    // ── Plan switch (new product/entitlement in the same event) ────────────────
    case 'PRODUCT_CHANGE': {
      const newPlanId = planIdFromEntitlementId(event.new_entitlement_id)
        ?? planIdFromProductId(event.new_product_id)
        ?? planId; // fall back to old plan if new product unknown
      const newPlan = newPlanId ? getPlanById(newPlanId) : validPlan;
      if (newPlan) {
        const newProductId = event.new_product_id ?? event.product_id;
        await User.findByIdAndUpdate(
          userId,
          activePlanUpdate(newPlan.id, newProductId, platform, expiresAt),
          { runValidators: true }
        );
        console.log(`[billing] PRODUCT_CHANGE: userId=${userId} → plan=${newPlan.id}`);
      }
      break;
    }

    // ── Cancellation — keep access until period end ────────────────────────────
    case 'CANCELLATION': {
      await User.findByIdAndUpdate(userId, {
        subscriptionStatus: 'cancelled',
        subscriptionExpiresAt: expiresAt,
        storageNextRenewalDate: renewalLabel(expiresAt),
      });
      console.log(`[billing] CANCELLATION: userId=${userId}, expires=${expiresAt}`);
      break;
    }

    // ── Payment failure — store manages grace period; keep plan ────────────────
    case 'BILLING_ISSUE': {
      await User.findByIdAndUpdate(userId, {
        subscriptionStatus: 'billing_retry',
      });
      console.log(`[billing] BILLING_ISSUE: userId=${userId}`);
      break;
    }

    // ── Period ended without payment renewal → downgrade to free ──────────────
    case 'EXPIRATION': {
      await User.findByIdAndUpdate(userId, freePlanUpdate());
      console.log(`[billing] EXPIRATION: userId=${userId} → free`);
      break;
    }

    // ── Refund — immediately revoke paid entitlement ───────────────────────────
    case 'REFUND': {
      await User.findByIdAndUpdate(userId, freePlanUpdate());
      console.log(`[billing] REFUND: userId=${userId} → free`);
      break;
    }

    // ── Transfer — acknowledge only ───────────────────────────────────────────
    case 'TRANSFER': {
      console.log(`[billing] TRANSFER acknowledged (event ${event.id})`);
      break;
    }

    // ── Unknown / future event types ──────────────────────────────────────────
    default: {
      console.log(`[billing] Unhandled event type '${eventType}' (event ${event.id})`);
      break;
    }
  }

  return res.status(200).json({ message: 'Processed' });
};

// ── GET /api/v1/billing/status ────────────────────────────────────────────────

/**
 * Return the authenticated user's current subscription state.
 * Used by the frontend after a purchase or restore to confirm plan changes.
 */
const getBillingStatus = async (req, res) => {
  const userId = req.user.userId;

  const user = await User.findById(userId).select(
    'storagePlanId subscriptionStatus subscriptionPlatform subscriptionProductId subscriptionExpiresAt storageNextRenewalDate'
  );

  if (!user) return res.status(404).json({ message: 'User not found' });

  return res.status(200).json({
    planId: user.storagePlanId || 'free',
    subscriptionStatus: user.subscriptionStatus ?? null,
    subscriptionPlatform: user.subscriptionPlatform ?? null,
    subscriptionProductId: user.subscriptionProductId ?? null,
    subscriptionExpiresAt: user.subscriptionExpiresAt ?? null,
    nextRenewalDate: user.storageNextRenewalDate ?? null,
  });
};

// ── POST /api/v1/billing/restore ──────────────────────────────────────────────

/**
 * Sync the user's subscription state by querying RevenueCat's REST API.
 *
 * Called by the frontend immediately after a successful in-app purchase to
 * apply entitlements without waiting for the webhook.  Also useful after a
 * fresh login to restore purchases from a previous device.
 *
 * RevenueCat REST API: GET /v1/subscribers/:app_user_id
 * Requires REVENUECAT_API_KEY (secret key) in environment.
 *
 * The highest-tier active entitlement wins when multiple are active.
 */
const restorePurchases = async (req, res) => {
  const userId = req.user.userId;
  const rcApiKey = process.env.REVENUECAT_API_KEY;

  if (!rcApiKey) {
    return res.status(503).json({
      message: 'Billing service not configured. Set REVENUECAT_API_KEY.',
    });
  }

  // ── Call RevenueCat REST API ───────────────────────────────────────────────
  let rcData;
  try {
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${rcApiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.status === 404) {
      // Unknown subscriber — treat as free (new user)
      rcData = { subscriber: { entitlements: {} } };
    } else if (!response.ok) {
      const text = await response.text();
      console.error(`[billing] RevenueCat API error ${response.status}: ${text}`);
      return res.status(502).json({ message: 'Failed to verify subscription with billing provider' });
    } else {
      rcData = await response.json();
    }
  } catch (err) {
    console.error('[billing] RevenueCat fetch failed:', err.message);
    return res.status(502).json({ message: 'Failed to reach billing provider' });
  }

  // ── Resolve highest-tier active entitlement ───────────────────────────────
  const PLAN_PRIORITY = { vault: 3, premium: 2, plus: 1, free: 0 };
  const entitlements = rcData.subscriber?.entitlements ?? {};
  const now = new Date();

  let bestPlanId = null;
  let bestExpiresAt = null;

  for (const [entitlementId, data] of Object.entries(entitlements)) {
    const planId = planIdFromEntitlementId(entitlementId);
    if (!planId || !getPlanById(planId)) continue;

    // Check if the entitlement is currently active
    const expiresDate = data.expires_date ? new Date(data.expires_date) : null;
    if (expiresDate !== null && expiresDate <= now) continue; // expired

    if ((PLAN_PRIORITY[planId] ?? 0) > (PLAN_PRIORITY[bestPlanId] ?? 0)) {
      bestPlanId = planId;
      bestExpiresAt = expiresDate;
    }
  }

  // ── Apply the resolved entitlement ────────────────────────────────────────
  if (!bestPlanId) {
    // No active entitlement — downgrade to free
    await User.findByIdAndUpdate(userId, freePlanUpdate());
    return res.status(200).json({ planId: 'free', subscriptionStatus: null });
  }

  await User.findByIdAndUpdate(userId, {
    storagePlanId: bestPlanId,
    subscriptionStatus: 'active',
    subscriptionExpiresAt: bestExpiresAt,
    storageNextRenewalDate: renewalLabel(bestExpiresAt),
  });

  return res.status(200).json({
    planId: bestPlanId,
    subscriptionStatus: 'active',
    subscriptionExpiresAt: bestExpiresAt,
    nextRenewalDate: renewalLabel(bestExpiresAt),
  });
};

module.exports = { handleWebhook, getBillingStatus, restorePurchases };
