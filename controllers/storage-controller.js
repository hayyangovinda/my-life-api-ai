const User = require('../models/user-model');
const { STORAGE_PLANS, getPlanById } = require('../config/storage-plans');

/**
 * GET /api/v1/storage/plans  — public, no auth required
 * Returns the full plan catalogue.
 */
const getPlans = async (req, res) => {
  res.status(200).json({ plans: STORAGE_PLANS });
};

/**
 * GET /api/v1/storage/usage  — authenticated
 * Returns the requesting user's current plan and storage usage.
 * User identity is derived exclusively from the JWT (req.user.userId).
 */
const getUsage = async (req, res) => {
  const userId = req.user.userId;

  const user = await User.findById(userId).select(
    'storagePlanId storageUsedBytes storageUsedBreakdown storageNextRenewalDate'
  );

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const planId = user.storagePlanId || 'free';
  // Fall back to free plan if a stored planId no longer exists in config
  const plan = getPlanById(planId) || getPlanById('free');
  const usedBytes = user.storageUsedBytes || 0;
  const bd = user.storageUsedBreakdown || {};

  res.status(200).json({
    planId: plan.id,
    planName: plan.name,
    storageLimitBytes: plan.storageLimitBytes,
    usedBytes,
    freeBytes: Math.max(0, plan.storageLimitBytes - usedBytes),
    nextRenewalDate: plan.id === 'free' ? null : (user.storageNextRenewalDate || null),
    breakdown: {
      photos: bd.photos || 0,
      videos: bd.videos || 0,
      audio:  bd.audio  || 0,
      other:  bd.other  || 0,
    },
  });
};

module.exports = { getPlans, getUsage };
