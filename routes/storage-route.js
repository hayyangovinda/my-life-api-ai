const express = require('express');
const router = express.Router();
const authenticateUser = require('../middlewares/auth-middleware');
const { getPlans, getUsage } = require('../controllers/storage-controller');

// Public — no authentication required
router.get('/plans', getPlans);

// Authenticated — user identity derived from JWT only, never from request body/params
router.get('/usage', authenticateUser, getUsage);

module.exports = router;
