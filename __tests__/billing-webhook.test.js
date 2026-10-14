/**
 * Unit tests for billing-controller.js
 *
 * Tests cover:
 *   handleWebhook  — authentication, idempotency, all RevenueCat event types
 *   getBillingStatus — status endpoint
 *   restorePurchases — RevenueCat REST API sync
 */

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('../models/user-model', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock('../models/webhook-event-model', () => ({
  create: jest.fn(),
}));

jest.mock('../config/storage-plans', () => ({
  getPlanById: jest.fn((id) => {
    const plans = {
      free:    { id: 'free',    storageLimitBytes: 500 * 1024 * 1024 },
      plus:    { id: 'plus',    storageLimitBytes: 10  * 1024 * 1024 * 1024 },
      premium: { id: 'premium', storageLimitBytes: 50  * 1024 * 1024 * 1024 },
      vault:   { id: 'vault',   storageLimitBytes: 200 * 1024 * 1024 * 1024 },
    };
    return plans[id] ?? null;
  }),
}));

// Don't mock revenuecat-products — test with real mapping logic

// ── Imports ───────────────────────────────────────────────────────────────────

const { handleWebhook, getBillingStatus, restorePurchases } = require('../controllers/billing-controller');
const User = require('../models/user-model');
const WebhookEvent = require('../models/webhook-event-model');

// ── Helpers ───────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = 'test-webhook-secret-abc';

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function makeWebhookReq(eventOverrides = {}, headerOverrides = {}) {
  return {
    headers: {
      authorization: `Bearer ${WEBHOOK_SECRET}`,
      ...headerOverrides,
    },
    body: {
      event: {
        id: 'evt-' + Math.random().toString(36).slice(2),
        type: 'INITIAL_PURCHASE',
        app_user_id: '507f1f77bcf86cd799439011',
        product_id: 'mylife_premium_monthly',
        entitlement_id: 'premium',
        store: 'PLAY_STORE',
        expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
        environment: 'PRODUCTION',
        ...eventOverrides,
      },
    },
  };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  process.env.REVENUECAT_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.REVENUECAT_API_KEY = 'rc_test_api_key';

  // Default: successful idempotency insert
  WebhookEvent.create.mockResolvedValue({});
  // Default: successful user update
  User.findByIdAndUpdate.mockResolvedValue({});
});

afterEach(() => {
  delete process.env.REVENUECAT_WEBHOOK_SECRET;
  delete process.env.REVENUECAT_API_KEY;
});

// ══════════════════════════════════════════════════════════════════════════════
// handleWebhook
// ══════════════════════════════════════════════════════════════════════════════

describe('handleWebhook()', () => {

  // ── Authentication ──────────────────────────────────────────────────────────

  describe('Authentication', () => {
    test('returns 503 when REVENUECAT_WEBHOOK_SECRET is not set', async () => {
      delete process.env.REVENUECAT_WEBHOOK_SECRET;
      const res = makeRes();
      await handleWebhook(makeWebhookReq(), res);
      expect(res.status).toHaveBeenCalledWith(503);
    });

    test('returns 401 when Authorization header is missing', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({}, { authorization: undefined }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test('returns 401 when Authorization header uses wrong secret', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({}, { authorization: 'Bearer wrong-secret' }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test('returns 401 when Authorization is not a Bearer token', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({}, { authorization: WEBHOOK_SECRET }), res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    test('accepts request with correct Bearer secret', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq(), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ── Payload validation ──────────────────────────────────────────────────────

  describe('Payload validation', () => {
    test('returns 400 when body is empty', async () => {
      const req = { headers: { authorization: `Bearer ${WEBHOOK_SECRET}` }, body: {} };
      const res = makeRes();
      await handleWebhook(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 400 when event.id is missing', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ id: undefined }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 400 when event.type is missing', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ type: undefined }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    test('returns 400 when event.app_user_id is missing', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ app_user_id: undefined }), res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ── Idempotency ─────────────────────────────────────────────────────────────

  describe('Idempotency', () => {
    test('returns 200 with "Already processed" for a duplicate event', async () => {
      WebhookEvent.create.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: 11000 })
      );
      const res = makeRes();
      await handleWebhook(makeWebhookReq(), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Already processed' }));
      // Must NOT update the user again
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test('rethrows non-duplicate WebhookEvent errors', async () => {
      WebhookEvent.create.mockRejectedValue(new Error('DB connection lost'));
      const res = makeRes();
      await expect(handleWebhook(makeWebhookReq(), res)).rejects.toThrow('DB connection lost');
    });
  });

  // ── INITIAL_PURCHASE ────────────────────────────────────────────────────────

  describe('INITIAL_PURCHASE', () => {
    test('grants the correct plan and sets status = active', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ type: 'INITIAL_PURCHASE', product_id: 'mylife_premium_monthly', entitlement_id: 'premium' }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      const [userId, update] = User.findByIdAndUpdate.mock.calls[0];
      expect(userId).toBe('507f1f77bcf86cd799439011');
      expect(update.storagePlanId).toBe('premium');
      expect(update.subscriptionStatus).toBe('active');
      expect(update.subscriptionPlatform).toBe('android');
      expect(update.subscriptionProductId).toBe('mylife_premium_monthly');
      expect(update.subscriptionExpiresAt).toBeInstanceOf(Date);
    });

    test('grants plus plan for plus product', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ type: 'INITIAL_PURCHASE', product_id: 'mylife_plus_monthly', entitlement_id: 'plus' }), res);
      const [, update] = User.findByIdAndUpdate.mock.calls[0];
      expect(update.storagePlanId).toBe('plus');
    });

    test('grants vault plan for vault product', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ type: 'INITIAL_PURCHASE', product_id: 'mylife_vault_monthly', entitlement_id: 'vault' }), res);
      const [, update] = User.findByIdAndUpdate.mock.calls[0];
      expect(update.storagePlanId).toBe('vault');
    });

    test('sets platform = ios for APP_STORE', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ type: 'INITIAL_PURCHASE', store: 'APP_STORE', entitlement_id: 'plus' }), res);
      const [, update] = User.findByIdAndUpdate.mock.calls[0];
      expect(update.subscriptionPlatform).toBe('ios');
    });

    test('does not update user when product is unknown', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ type: 'INITIAL_PURCHASE', product_id: 'unknown_product', entitlement_id: 'unknown' }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test('prefers entitlement_id over product_id for plan resolution', async () => {
      // product_id points to premium but entitlement points to vault
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ type: 'INITIAL_PURCHASE', product_id: 'mylife_premium_monthly', entitlement_id: 'vault' }), res);
      const [, update] = User.findByIdAndUpdate.mock.calls[0];
      expect(update.storagePlanId).toBe('vault');
    });
  });

  // ── RENEWAL ─────────────────────────────────────────────────────────────────

  describe('RENEWAL', () => {
    test('refreshes expiry and keeps plan active', async () => {
      const newExpiry = Date.now() + 60 * 24 * 60 * 60 * 1000;
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ type: 'RENEWAL', entitlement_id: 'premium', expiration_at_ms: newExpiry }), res);
      const [, update] = User.findByIdAndUpdate.mock.calls[0];
      expect(update.subscriptionStatus).toBe('active');
      expect(update.storagePlanId).toBe('premium');
      expect(update.subscriptionExpiresAt.getTime()).toBeCloseTo(newExpiry, -3);
    });
  });

  // ── UNCANCELLATION ──────────────────────────────────────────────────────────

  describe('UNCANCELLATION', () => {
    test('restores active status and plan', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ type: 'UNCANCELLATION', entitlement_id: 'plus' }), res);
      const [, update] = User.findByIdAndUpdate.mock.calls[0];
      expect(update.subscriptionStatus).toBe('active');
      expect(update.storagePlanId).toBe('plus');
    });
  });

  // ── PRODUCT_CHANGE ──────────────────────────────────────────────────────────

  describe('PRODUCT_CHANGE', () => {
    test('switches plan to new_product_id when present', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({
        type: 'PRODUCT_CHANGE',
        product_id: 'mylife_plus_monthly',
        entitlement_id: 'plus',
        new_product_id: 'mylife_vault_monthly',
        new_entitlement_id: 'vault',
      }), res);
      const [, update] = User.findByIdAndUpdate.mock.calls[0];
      expect(update.storagePlanId).toBe('vault');
      expect(update.subscriptionProductId).toBe('mylife_vault_monthly');
    });

    test('keeps old plan when new_product_id is unknown', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({
        type: 'PRODUCT_CHANGE',
        product_id: 'mylife_premium_monthly',
        entitlement_id: 'premium',
        new_product_id: 'unknown_new_product',
        new_entitlement_id: undefined,
      }), res);
      const [, update] = User.findByIdAndUpdate.mock.calls[0];
      expect(update.storagePlanId).toBe('premium');
    });
  });

  // ── CANCELLATION ────────────────────────────────────────────────────────────

  describe('CANCELLATION', () => {
    test('sets status = cancelled but does NOT change plan', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ type: 'CANCELLATION' }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      const [, update] = User.findByIdAndUpdate.mock.calls[0];
      expect(update.subscriptionStatus).toBe('cancelled');
      expect(update.storagePlanId).toBeUndefined();
    });

    test('stores expiry date from the event', async () => {
      const expiryMs = Date.now() + 14 * 24 * 60 * 60 * 1000;
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ type: 'CANCELLATION', expiration_at_ms: expiryMs }), res);
      const [, update] = User.findByIdAndUpdate.mock.calls[0];
      expect(update.subscriptionExpiresAt).toBeInstanceOf(Date);
      expect(update.subscriptionExpiresAt.getTime()).toBeCloseTo(expiryMs, -3);
    });
  });

  // ── BILLING_ISSUE ───────────────────────────────────────────────────────────

  describe('BILLING_ISSUE', () => {
    test('sets status = billing_retry and does NOT change plan', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ type: 'BILLING_ISSUE' }), res);
      const [, update] = User.findByIdAndUpdate.mock.calls[0];
      expect(update.subscriptionStatus).toBe('billing_retry');
      expect(update.storagePlanId).toBeUndefined();
    });
  });

  // ── EXPIRATION ──────────────────────────────────────────────────────────────

  describe('EXPIRATION', () => {
    test('downgrades plan to free and clears all subscription fields', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ type: 'EXPIRATION' }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      const [, update] = User.findByIdAndUpdate.mock.calls[0];
      expect(update.storagePlanId).toBe('free');
      expect(update.subscriptionStatus).toBe('expired');
      expect(update.subscriptionPlatform).toBeNull();
      expect(update.subscriptionProductId).toBeNull();
      expect(update.subscriptionExpiresAt).toBeNull();
      expect(update.storageNextRenewalDate).toBeNull();
    });
  });

  // ── REFUND ──────────────────────────────────────────────────────────────────

  describe('REFUND', () => {
    test('immediately downgrades to free and clears subscription fields', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ type: 'REFUND' }), res);
      const [, update] = User.findByIdAndUpdate.mock.calls[0];
      expect(update.storagePlanId).toBe('free');
      expect(update.subscriptionStatus).toBe('expired');
      expect(update.subscriptionPlatform).toBeNull();
      expect(update.subscriptionProductId).toBeNull();
    });
  });

  // ── TRANSFER ────────────────────────────────────────────────────────────────

  describe('TRANSFER', () => {
    test('returns 200 without updating the user', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ type: 'TRANSFER' }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  // ── Unknown event types ─────────────────────────────────────────────────────

  describe('Unknown event types', () => {
    test('returns 200 and does not update user for unrecognized type', async () => {
      const res = makeRes();
      await handleWebhook(makeWebhookReq({ type: 'FUTURE_EVENT_TYPE' }), res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  // ── Idempotency across multiple calls ───────────────────────────────────────

  describe('Duplicate webhook replay', () => {
    test('second call with same event ID returns 200 without DB update', async () => {
      // First call succeeds
      WebhookEvent.create.mockResolvedValueOnce({});
      const res1 = makeRes();
      await handleWebhook(makeWebhookReq({ id: 'fixed-event-id', type: 'INITIAL_PURCHASE', entitlement_id: 'premium' }), res1);
      expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(1);

      // Second call: duplicate key
      WebhookEvent.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
      const res2 = makeRes();
      await handleWebhook(makeWebhookReq({ id: 'fixed-event-id', type: 'INITIAL_PURCHASE', entitlement_id: 'premium' }), res2);
      // Still only called once from the first request
      expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(1);
      expect(res2.status).toHaveBeenCalledWith(200);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// getBillingStatus
// ══════════════════════════════════════════════════════════════════════════════

describe('getBillingStatus()', () => {
  function makeReq(userId = '507f1f77bcf86cd799439011') {
    return { user: { userId } };
  }

  test('returns 404 when user is not found', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    const res = makeRes();
    await getBillingStatus(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 200 with free plan defaults for a new user', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        storagePlanId: 'free',
        subscriptionStatus: null,
        subscriptionPlatform: null,
        subscriptionProductId: null,
        subscriptionExpiresAt: null,
        storageNextRenewalDate: null,
      }),
    });
    const res = makeRes();
    await getBillingStatus(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.planId).toBe('free');
    expect(body.subscriptionStatus).toBeNull();
  });

  test('returns full subscription info for an active subscriber', async () => {
    const expiresAt = new Date('2026-11-01T00:00:00Z');
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        storagePlanId: 'premium',
        subscriptionStatus: 'active',
        subscriptionPlatform: 'ios',
        subscriptionProductId: 'mylife_premium_monthly',
        subscriptionExpiresAt: expiresAt,
        storageNextRenewalDate: 'November 1, 2026',
      }),
    });
    const res = makeRes();
    await getBillingStatus(makeReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.planId).toBe('premium');
    expect(body.subscriptionStatus).toBe('active');
    expect(body.subscriptionPlatform).toBe('ios');
    expect(body.subscriptionProductId).toBe('mylife_premium_monthly');
    expect(body.nextRenewalDate).toBe('November 1, 2026');
  });

  test('returns cancelled status for a cancelled subscriber', async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        storagePlanId: 'plus',
        subscriptionStatus: 'cancelled',
        subscriptionPlatform: 'android',
        subscriptionProductId: 'mylife_plus_monthly',
        subscriptionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        storageNextRenewalDate: null,
      }),
    });
    const res = makeRes();
    await getBillingStatus(makeReq(), res);
    const body = res.json.mock.calls[0][0];
    expect(body.planId).toBe('plus');
    expect(body.subscriptionStatus).toBe('cancelled');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// restorePurchases
// ══════════════════════════════════════════════════════════════════════════════

describe('restorePurchases()', () => {
  function makeReq(userId = '507f1f77bcf86cd799439011') {
    return { user: { userId } };
  }

  beforeEach(() => {
    global.fetch = jest.fn();
    User.findByIdAndUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('returns 503 when REVENUECAT_API_KEY is not set', async () => {
    delete process.env.REVENUECAT_API_KEY;
    const res = makeRes();
    await restorePurchases(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns 502 when RevenueCat API returns 500', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('Internal error'),
    });
    const res = makeRes();
    await restorePurchases(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  test('returns 502 when fetch throws (network failure)', async () => {
    global.fetch.mockRejectedValue(new Error('Network timeout'));
    const res = makeRes();
    await restorePurchases(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  test('treats 404 from RevenueCat as a new subscriber (no entitlements)', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404 });
    const res = makeRes();
    await restorePurchases(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const [, update] = User.findByIdAndUpdate.mock.calls[0];
    expect(update.storagePlanId).toBe('free');
  });

  test('downgrades to free when no active entitlements exist', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        subscriber: { entitlements: {} },
      }),
    });
    const res = makeRes();
    await restorePurchases(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const [, update] = User.findByIdAndUpdate.mock.calls[0];
    expect(update.storagePlanId).toBe('free');
    const body = res.json.mock.calls[0][0];
    expect(body.planId).toBe('free');
  });

  test('grants premium plan when premium entitlement is active', async () => {
    const expiresDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        subscriber: {
          entitlements: {
            premium: {
              expires_date: expiresDate,
              product_identifier: 'mylife_premium_monthly',
              purchase_date: new Date().toISOString(),
            },
          },
        },
      }),
    });
    const res = makeRes();
    await restorePurchases(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const [, update] = User.findByIdAndUpdate.mock.calls[0];
    expect(update.storagePlanId).toBe('premium');
    expect(update.subscriptionStatus).toBe('active');
    const body = res.json.mock.calls[0][0];
    expect(body.planId).toBe('premium');
  });

  test('grants the highest-tier plan when multiple entitlements are active', async () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        subscriber: {
          entitlements: {
            plus:    { expires_date: future, product_identifier: 'mylife_plus_monthly' },
            premium: { expires_date: future, product_identifier: 'mylife_premium_monthly' },
          },
        },
      }),
    });
    const res = makeRes();
    await restorePurchases(makeReq(), res);
    const [, update] = User.findByIdAndUpdate.mock.calls[0];
    expect(update.storagePlanId).toBe('premium'); // higher priority than plus
  });

  test('ignores entitlements whose expires_date is in the past', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        subscriber: {
          entitlements: {
            premium: { expires_date: past, product_identifier: 'mylife_premium_monthly' },
          },
        },
      }),
    });
    const res = makeRes();
    await restorePurchases(makeReq(), res);
    const [, update] = User.findByIdAndUpdate.mock.calls[0];
    expect(update.storagePlanId).toBe('free');
  });

  test('treats null expires_date as a non-expiring (lifetime) entitlement', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        subscriber: {
          entitlements: {
            vault: { expires_date: null, product_identifier: 'mylife_vault_monthly' },
          },
        },
      }),
    });
    const res = makeRes();
    await restorePurchases(makeReq(), res);
    const [, update] = User.findByIdAndUpdate.mock.calls[0];
    expect(update.storagePlanId).toBe('vault');
  });

  test('calls RevenueCat API with the correct Authorization header', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ subscriber: { entitlements: {} } }),
    });
    const res = makeRes();
    await restorePurchases(makeReq(), res);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('507f1f77bcf86cd799439011');
    expect(options.headers['Authorization']).toBe('Bearer rc_test_api_key');
  });

  test('ignores unknown entitlement IDs from RevenueCat', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        subscriber: {
          entitlements: {
            unknown_tier: {
              expires_date: new Date(Date.now() + 86_400_000).toISOString(),
            },
          },
        },
      }),
    });
    const res = makeRes();
    await restorePurchases(makeReq(), res);
    const [, update] = User.findByIdAndUpdate.mock.calls[0];
    expect(update.storagePlanId).toBe('free');
  });
});
