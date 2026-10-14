/**
 * Unit tests for storage-controller.js
 *
 * getUsage() — computes usedBytes and breakdown from StorageObject.aggregate()
 *              (not from the potentially-drifted User.storageUsedBytes counter).
 *              reservedBytes comes from User.storageReservedBytes.
 *
 * reconcileUsage() — recalculates both counters from actual records, corrects
 *                    drift, and returns a before/after report.
 */

const { getPlans, getUsage, reconcileUsage } = require('../controllers/storage-controller');
const { STORAGE_PLANS, getPlanById } = require('../config/storage-plans');
const User = require('../models/user-model');
const StorageObject = require('../models/storage-object-model');

jest.mock('../models/user-model');
jest.mock('../models/storage-object-model');

// ── Helpers ───────────────────────────────────────────────────────────────────

// Valid 24-char hex ObjectId required by mongoose.Types.ObjectId()
const TEST_USER_ID = '507f1f77bcf86cd799439011';

function makeReq(userId = TEST_USER_ID) {
  return { user: { userId } };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockUserFindById(userDoc) {
  User.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue(userDoc),
  });
}

// ── getPlans ──────────────────────────────────────────────────────────────────

describe('getPlans', () => {
  test('returns 200 with the full plans array', async () => {
    const res = makeRes();
    await getPlans(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ plans: STORAGE_PLANS });
  });
});

// ── getUsage ──────────────────────────────────────────────────────────────────

describe('getUsage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findByIdAndUpdate.mockResolvedValue({});
  });

  test('returns 404 when user is not found', async () => {
    mockUserFindById(null);
    const res = makeRes();
    await getUsage(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
  });

  test('returns zero usedBytes when no uploaded objects exist', async () => {
    mockUserFindById({ storagePlanId: 'free', storageReservedBytes: 0, storageNextRenewalDate: null });
    StorageObject.aggregate.mockResolvedValue([]); // no uploaded objects

    const res = makeRes();
    await getUsage(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.usedBytes).toBe(0);
    expect(body.breakdown).toEqual({ photos: 0, videos: 0, audio: 0, other: 0 });
  });

  test('computes usedBytes from StorageObject aggregate — not from user counter', async () => {
    mockUserFindById({ storagePlanId: 'free', storageReservedBytes: 0, storageNextRenewalDate: null });
    StorageObject.aggregate.mockResolvedValue([{
      totalBytes: 12_000,
      photos: 8_000,
      videos: 4_000,
      audio: 0,
      other: 0,
    }]);

    const res = makeRes();
    await getUsage(makeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.usedBytes).toBe(12_000);
    expect(body.breakdown).toEqual({ photos: 8_000, videos: 4_000, audio: 0, other: 0 });
  });

  test('includes reservedBytes from user.storageReservedBytes', async () => {
    const reserved = 5 * 1024 * 1024;
    mockUserFindById({ storagePlanId: 'free', storageReservedBytes: reserved, storageNextRenewalDate: null });
    StorageObject.aggregate.mockResolvedValue([{ totalBytes: 1000, photos: 1000, videos: 0, audio: 0, other: 0 }]);

    const res = makeRes();
    await getUsage(makeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.reservedBytes).toBe(reserved);
  });

  test('freeBytes = planLimit - usedBytes - reservedBytes', async () => {
    const planLimit = getPlanById('free').storageLimitBytes;
    const used = 100 * 1024;
    const reserved = 50 * 1024;
    mockUserFindById({ storagePlanId: 'free', storageReservedBytes: reserved, storageNextRenewalDate: null });
    StorageObject.aggregate.mockResolvedValue([{ totalBytes: used, photos: used, videos: 0, audio: 0, other: 0 }]);

    const res = makeRes();
    await getUsage(makeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.freeBytes).toBe(planLimit - used - reserved);
  });

  test('returns correct plan fields for free plan', async () => {
    mockUserFindById({ storagePlanId: 'free', storageReservedBytes: 0, storageNextRenewalDate: null });
    StorageObject.aggregate.mockResolvedValue([]);

    const res = makeRes();
    await getUsage(makeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.planId).toBe('free');
    expect(body.planName).toBe('Free');
    expect(body.storageLimitBytes).toBe(getPlanById('free').storageLimitBytes);
    expect(body.nextRenewalDate).toBeNull();
  });

  test('returns nextRenewalDate from user for paid plans', async () => {
    mockUserFindById({ storagePlanId: 'plus', storageReservedBytes: 0, storageNextRenewalDate: 'December 1, 2026' });
    StorageObject.aggregate.mockResolvedValue([]);

    const res = makeRes();
    await getUsage(makeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.planId).toBe('plus');
    expect(body.nextRenewalDate).toBe('December 1, 2026');
  });

  test('forces nextRenewalDate to null for free plan even when user field is set', async () => {
    mockUserFindById({ storagePlanId: 'free', storageReservedBytes: 0, storageNextRenewalDate: '2026-12-01' });
    StorageObject.aggregate.mockResolvedValue([]);

    const res = makeRes();
    await getUsage(makeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.nextRenewalDate).toBeNull();
  });

  test('falls back to free plan when storagePlanId is unknown', async () => {
    mockUserFindById({ storagePlanId: 'legacy-plan-gone', storageReservedBytes: 0, storageNextRenewalDate: null });
    StorageObject.aggregate.mockResolvedValue([]);

    const res = makeRes();
    await getUsage(makeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.planId).toBe('free');
  });

  test('clamps negative storageReservedBytes to 0', async () => {
    mockUserFindById({ storagePlanId: 'free', storageReservedBytes: -100, storageNextRenewalDate: null });
    StorageObject.aggregate.mockResolvedValue([]);

    const res = makeRes();
    await getUsage(makeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.reservedBytes).toBe(0);
  });
});

// ── reconcileUsage ────────────────────────────────────────────────────────────

describe('reconcileUsage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    User.findByIdAndUpdate.mockResolvedValue({});
  });

  test('returns 404 when user is not found', async () => {
    mockUserFindById(null);
    const res = makeRes();
    await reconcileUsage(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'User not found' });
  });

  test('returns 200 with before and after report', async () => {
    mockUserFindById({ storageUsedBytes: 2_000, storageReservedBytes: 500, storageUsedBreakdown: {} });
    StorageObject.aggregate
      .mockResolvedValueOnce([{ totalBytes: 1_800, photos: 1_200, videos: 600, audio: 0, other: 0 }])
      .mockResolvedValueOnce([{ totalBytes: 300 }]);

    const res = makeRes();
    await reconcileUsage(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.before).toEqual({ storageUsedBytes: 2_000, storageReservedBytes: 500 });
    expect(body.after).toEqual({ storageUsedBytes: 1_800, storageReservedBytes: 300 });
  });

  test('calculates drift correctly', async () => {
    mockUserFindById({ storageUsedBytes: 5_000, storageReservedBytes: 200, storageUsedBreakdown: {} });
    StorageObject.aggregate
      .mockResolvedValueOnce([{ totalBytes: 4_500, photos: 4_500, videos: 0, audio: 0, other: 0 }])
      .mockResolvedValueOnce([{ totalBytes: 150 }]);

    const res = makeRes();
    await reconcileUsage(makeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.drift.usedBytesDrift).toBe(500);    // 5000 - 4500
    expect(body.drift.reservedBytesDrift).toBe(50); // 200 - 150
  });

  test('writes corrected counters and breakdown to User', async () => {
    mockUserFindById({ storageUsedBytes: 0, storageReservedBytes: 0, storageUsedBreakdown: {} });
    StorageObject.aggregate
      .mockResolvedValueOnce([{ totalBytes: 1_000, photos: 400, videos: 300, audio: 200, other: 100 }])
      .mockResolvedValueOnce([{ totalBytes: 500 }]);

    const res = makeRes();
    await reconcileUsage(makeReq(), res);

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      TEST_USER_ID,
      expect.objectContaining({
        $set: expect.objectContaining({
          storageUsedBytes: 1_000,
          storageReservedBytes: 500,
          'storageUsedBreakdown.photos': 400,
          'storageUsedBreakdown.videos': 300,
          'storageUsedBreakdown.audio': 200,
          'storageUsedBreakdown.other': 100,
        }),
      })
    );
  });

  test('zeroes out counters when no objects exist', async () => {
    mockUserFindById({ storageUsedBytes: 9_999, storageReservedBytes: 1_111, storageUsedBreakdown: {} });
    StorageObject.aggregate
      .mockResolvedValueOnce([]) // no uploaded objects
      .mockResolvedValueOnce([]); // no pending objects

    const res = makeRes();
    await reconcileUsage(makeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.after.storageUsedBytes).toBe(0);
    expect(body.after.storageReservedBytes).toBe(0);
    expect(body.breakdown).toEqual({ photos: 0, videos: 0, audio: 0, other: 0 });
  });

  test('returns breakdown from uploaded-objects aggregate', async () => {
    mockUserFindById({ storageUsedBytes: 0, storageReservedBytes: 0, storageUsedBreakdown: {} });
    StorageObject.aggregate
      .mockResolvedValueOnce([{ totalBytes: 900, photos: 500, videos: 200, audio: 150, other: 50 }])
      .mockResolvedValueOnce([]);

    const res = makeRes();
    await reconcileUsage(makeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.breakdown).toEqual({ photos: 500, videos: 200, audio: 150, other: 50 });
  });

  test('returns zero drift when counters already match reality', async () => {
    mockUserFindById({ storageUsedBytes: 1_000, storageReservedBytes: 500, storageUsedBreakdown: {} });
    StorageObject.aggregate
      .mockResolvedValueOnce([{ totalBytes: 1_000, photos: 1_000, videos: 0, audio: 0, other: 0 }])
      .mockResolvedValueOnce([{ totalBytes: 500 }]);

    const res = makeRes();
    await reconcileUsage(makeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body.drift.usedBytesDrift).toBe(0);
    expect(body.drift.reservedBytesDrift).toBe(0);
  });
});
