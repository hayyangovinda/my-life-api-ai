const express = require('express');
const router = express.Router();
const authenticateUser = require('../middlewares/auth-middleware');
const { getPlans, getUsage, reconcileUsage } = require('../controllers/storage-controller');

// Public — no authentication required
router.get('/plans', getPlans);

// Authenticated — user identity derived from JWT only, never from request body/params
router.get('/usage', authenticateUser, getUsage);

/**
 * POST /api/v1/storage/reconcile
 * Recalculates storageUsedBytes and storageReservedBytes from actual StorageObject
 * records, correcting any drift.  Returns a before/after report.
 */
router.post('/reconcile', authenticateUser, reconcileUsage);

module.exports = router;
