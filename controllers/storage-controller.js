/**
 * Storage controller — plans, usage reporting and reconciliation.
 *
 * Usage philosophy
 * ────────────────
 * storageUsedBytes (counter)     — used for atomic quota enforcement in upload
 *                                  sessions; may drift slightly under server crashes.
 * StorageObject aggregate        — authoritative source for the displayed usedBytes;
 *                                  calculated from verified persisted records with
 *                                  status = 'uploaded'.
 * reconcileUsage()               — corrects any drift by recalculating both
 *                                  storageUsedBytes and storageReservedBytes from
 *                                  actual StorageObject records.
 */

const mongoose = require('mongoose');
const User = require('../models/user-model');
const StorageObject = require('../models/storage-object-model');
const { STORAGE_PLANS, getPlanById } = require('../config/storage-plans');

// ── GET /api/v1/storage/plans  (public) ───────────────────────────────────

/**
 * Return the full plan catalogue.  No authentication required.
 */
const getPlans = async (req, res) => {
  res.status(200).json({ plans: STORAGE_PLANS });
};

// ── GET /api/v1/storage/usage  (authenticated) ────────────────────────────

/**
 * Return the authenticated user's current plan and storage usage.
 *
 * usedBytes and breakdown are computed from verified StorageObject records
 * (status = 'uploaded'), not from the potentially-drifted counter.
 *
 * reservedBytes comes from User.storageReservedBytes (the running total of
 * pending upload reservations) and is included so clients can distinguish
 * in-progress uploads from completed storage.
 */
const getUsage = async (req, res) => {
  const userId = req.user.userId;

  const user = await User.findById(userId).select(
    'storagePlanId storageReservedBytes storageNextRenewalDate'
  );

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // Authoritative usage: aggregate over confirmed uploaded objects
  const [computed] = await StorageObject.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
        status: 'uploaded',
      },
    },
    {
      $group: {
        _id: null,
        totalBytes: { $sum: '$sizeBytes' },
        photos: {
          $sum: { $cond: [{ $eq: ['$category', 'photos'] }, '$sizeBytes', 0] },
        },
        videos: {
          $sum: { $cond: [{ $eq: ['$category', 'videos'] }, '$sizeBytes', 0] },
        },
        audio: {
          $sum: { $cond: [{ $eq: ['$category', 'audio'] }, '$sizeBytes', 0] },
        },
        other: {
          $sum: { $cond: [{ $eq: ['$category', 'other'] }, '$sizeBytes', 0] },
        },
      },
    },
  ]);

  const usedBytes = computed?.totalBytes ?? 0;
  const breakdown = {
    photos: computed?.photos ?? 0,
    videos: computed?.videos ?? 0,
    audio:  computed?.audio  ?? 0,
    other:  computed?.other  ?? 0,
  };

  const planId = user.storagePlanId || 'free';
  // Fall back to free plan if a stored planId no longer exists in config
  const plan = getPlanById(planId) || getPlanById('free');
  const reservedBytes = Math.max(0, user.storageReservedBytes || 0);

  res.status(200).json({
    planId: plan.id,
    planName: plan.name,
    storageLimitBytes: plan.storageLimitBytes,
    usedBytes,
    reservedBytes,
    freeBytes: Math.max(0, plan.storageLimitBytes - usedBytes - reservedBytes),
    nextRenewalDate: plan.id === 'free' ? null : (user.storageNextRenewalDate || null),
    breakdown,
  });
};

// ── POST /api/v1/storage/reconcile  (authenticated) ───────────────────────

/**
 * Recalculate storageUsedBytes and storageReservedBytes from actual
 * StorageObject records and correct any drift in the User counters.
 *
 * usedBytes    = sum of sizeBytes for status = 'uploaded'
 * reservedBytes = sum of sizeBytes for status = 'pending' with reservedUntil in the future
 *
 * Also updates storageUsedBreakdown to match the aggregate.
 *
 * Returns a before/after report.
 */
const reconcileUsage = async (req, res) => {
  const userId = req.user.userId;

  const user = await User.findById(userId).select(
    'storageUsedBytes storageReservedBytes storageUsedBreakdown'
  );
  if (!user) return res.status(404).json({ message: 'User not found' });

  // Sum of all uploaded objects
  const [uploadedResult] = await StorageObject.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
        status: 'uploaded',
      },
    },
    {
      $group: {
        _id: null,
        totalBytes: { $sum: '$sizeBytes' },
        photos: { $sum: { $cond: [{ $eq: ['$category', 'photos'] }, '$sizeBytes', 0] } },
        videos: { $sum: { $cond: [{ $eq: ['$category', 'videos'] }, '$sizeBytes', 0] } },
        audio:  { $sum: { $cond: [{ $eq: ['$category', 'audio']  }, '$sizeBytes', 0] } },
        other:  { $sum: { $cond: [{ $eq: ['$category', 'other']  }, '$sizeBytes', 0] } },
      },
    },
  ]);

  // Sum of non-expired pending reservations
  const [pendingResult] = await StorageObject.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
        status: 'pending',
        reservedUntil: { $gt: new Date() },
      },
    },
    { $group: { _id: null, totalBytes: { $sum: '$sizeBytes' } } },
  ]);

  const correctUsedBytes = uploadedResult?.totalBytes ?? 0;
  const correctReservedBytes = pendingResult?.totalBytes ?? 0;
  const correctBreakdown = {
    photos: uploadedResult?.photos ?? 0,
    videos: uploadedResult?.videos ?? 0,
    audio:  uploadedResult?.audio  ?? 0,
    other:  uploadedResult?.other  ?? 0,
  };

  const before = {
    storageUsedBytes:     user.storageUsedBytes     ?? 0,
    storageReservedBytes: user.storageReservedBytes ?? 0,
  };

  await User.findByIdAndUpdate(userId, {
    $set: {
      storageUsedBytes:               correctUsedBytes,
      storageReservedBytes:           correctReservedBytes,
      'storageUsedBreakdown.photos':  correctBreakdown.photos,
      'storageUsedBreakdown.videos':  correctBreakdown.videos,
      'storageUsedBreakdown.audio':   correctBreakdown.audio,
      'storageUsedBreakdown.other':   correctBreakdown.other,
    },
  });

  res.status(200).json({
    message: 'Reconciliation complete',
    before,
    after: {
      storageUsedBytes:     correctUsedBytes,
      storageReservedBytes: correctReservedBytes,
    },
    breakdown: correctBreakdown,
    drift: {
      usedBytesDrift:     before.storageUsedBytes     - correctUsedBytes,
      reservedBytesDrift: before.storageReservedBytes - correctReservedBytes,
    },
  });
};

module.exports = { getPlans, getUsage, reconcileUsage };
