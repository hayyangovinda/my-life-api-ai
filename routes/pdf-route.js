const express = require('express');
const router = express.Router();
const pdfController = require('../controllers/pdf-controller');

/**
 * Generate PDF for a single story
 * POST /api/v1/pdf/story/:id?includeImages=true
 * Query params: includeImages (boolean, default: true)
 */
router.post('/story/:id', pdfController.generateStoryPDF);

/**
 * Generate PDF for date range
 * POST /api/v1/pdf/date-range
 * Body: { startDate: ISO date string, endDate: ISO date string, includeImages: boolean }
 */
router.post('/date-range', pdfController.generateDateRangePDF);

module.exports = router;
