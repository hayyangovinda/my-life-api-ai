/**
 * WebhookEvent — idempotency store for RevenueCat webhook events.
 *
 * Before processing any incoming webhook, the controller attempts to insert
 * the event's unique ID here.  A duplicate-key error (code 11000) means the
 * event was already processed and can be acknowledged without side-effects.
 *
 * Documents expire automatically 90 days after creation via the TTL index,
 * keeping the collection from growing indefinitely.
 */

const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
  },
  processedAt: {
    type: Date,
    default: Date.now,
  },
});

// TTL index — MongoDB removes documents automatically after 90 days
webhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
