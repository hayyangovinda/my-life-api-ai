const { getPlans, getUsage } = require('../controllers/storage-controller');
const { STORAGE_PLANS, getPlanById } = require('../config/storage-plans');
const User = require('../models/user-model');

jest.mock('../models/user-model');

describe('storage-controller', () => {
  let req, res;

  beforeEach(() => {
    req = { user: { userId: 'test-user-id' } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();
  });

  // ── getPlans ─────────────────────────────────────────────────────────────────

  describe('getPlans', () => {
    test('returns 200 with the full plans array', async () => {
      await getPlans(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ plans: STORAGE_PLANS });
    });
  });

  // ── getUsage ─────────────────────────────────────────────────────────────────

  describe('getUsage', () => {
    test('returns 200 with correct usage for a user on the free plan', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          storagePlanId: 'free',
          storageUsedBytes: 0,
          storageUsedBreakdown: { photos: 0, videos: 0, audio: 0, other: 0 },
          storageNextRenewalDate: null,
        }),
      });

      await getUsage(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.planId).toBe('free');
      expect(body.planName).toBe('Free');
      expect(body.usedBytes).toBe(0);
      expect(body.freeBytes).toBe(getPlanById('free').storageLimitBytes);
      expect(body.nextRenewalDate).toBeNull();
      expect(body.breakdown).toEqual({ photos: 0, videos: 0, audio: 0, other: 0 });
    });

    test('returns 200 with usage for a paid-plan user', async () => {
      const premiumPlan = getPlanById('premium');
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          storagePlanId: 'premium',
          storageUsedBytes: 1024 * 1024 * 10, // 10 MB
          storageUsedBreakdown: { photos: 1024 * 1024 * 8, videos: 1024 * 1024 * 2, audio: 0, other: 0 },
          storageNextRenewalDate: 'November 14, 2026',
        }),
      });

      await getUsage(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.planId).toBe('premium');
      expect(body.storageLimitBytes).toBe(premiumPlan.storageLimitBytes);
      expect(body.usedBytes).toBe(1024 * 1024 * 10);
      expect(body.freeBytes).toBe(premiumPlan.storageLimitBytes - 1024 * 1024 * 10);
      expect(body.nextRenewalDate).toBe('November 14, 2026');
    });

    test('returns 404 when the user is not found', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await getUsage(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
    });

    test('falls back to free plan when storagePlanId is unknown', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          storagePlanId: 'legacy-plan-that-no-longer-exists',
          storageUsedBytes: 50,
          storageUsedBreakdown: {},
          storageNextRenewalDate: null,
        }),
      });

      await getUsage(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = res.json.mock.calls[0][0];
      expect(body.planId).toBe('free');
    });

    test('treats missing storageUsedBreakdown fields as 0', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          storagePlanId: 'free',
          storageUsedBytes: 0,
          storageUsedBreakdown: null,
          storageNextRenewalDate: null,
        }),
      });

      await getUsage(req, res);

      const body = res.json.mock.calls[0][0];
      expect(body.breakdown).toEqual({ photos: 0, videos: 0, audio: 0, other: 0 });
    });
  });
});
