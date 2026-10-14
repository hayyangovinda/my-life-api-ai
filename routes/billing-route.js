const express = require('express');
const router = express.Router();
const authenticateUser = require('../middlewares/auth-middleware');
const { handleWebhook, getBillingStatus, restorePurchases } = require('../controllers/billing-controller');

/**
 * POST /api/v1/billing/webhook
 *
 * RevenueCat webhook endpoint.  Authentication is handled inside the controller
 * via the REVENUECAT_WEBHOOK_SECRET environment variable — no JWT required.
 *
 * Configure in RevenueCat dashboard:
 *   Project Settings → Integrations → Webhooks
 *   URL:     https://<your-api-host>/api/v1/billing/webhook
 *   Secret:  <REVENUECAT_WEBHOOK_SECRET value>
 */
router.post('/webhook', handleWebhook);

/**
 * GET /api/v1/billing/status
 * Returns the authenticated user's current plan and subscription state.
 */
router.get('/status', authenticateUser, getBillingStatus);

/**
 * POST /api/v1/billing/restore
 * Syncs the user's plan by querying RevenueCat's REST API directly.
 * Call this from the client after a successful in-app purchase to apply
 * entitlements immediately without waiting for the webhook.
 */
router.post('/restore', authenticateUser, restorePurchases);

module.exports = router;
