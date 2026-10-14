const express = require('express');
const router = express.Router();
const authenticateUser = require('../middlewares/auth-middleware');
const {
  initiateUpload,
  completeUpload,
  cancelUpload,
  getSignedDownloadUrl,
} = require('../controllers/media-controller');

// All media routes require a valid JWT
router.use(authenticateUser);

/**
 * POST /api/v1/media/upload-session
 * Body: { filename, mimeType, sizeBytes }
 * Validates quota, reserves storage, returns presigned upload URL(s).
 */
router.post('/upload-session', initiateUpload);

/**
 * POST /api/v1/media/:objectId/complete
 * Body (multipart only): { parts: [{ partNumber, etag }] }
 * Server verifies upload via HeadObject then marks the object as uploaded.
 */
router.post('/:objectId/complete', completeUpload);

/**
 * POST /api/v1/media/:objectId/cancel
 * Aborts a pending upload, releases the reserved quota.
 */
router.post('/:objectId/cancel', cancelUpload);

/**
 * GET /api/v1/media/:objectId/signed-url
 * Returns a time-limited presigned GET URL for a completed upload.
 */
router.get('/:objectId/signed-url', getSignedDownloadUrl);

module.exports = router;
