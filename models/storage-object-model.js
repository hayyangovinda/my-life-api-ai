/**
 * StorageObject — metadata record for every file stored in object storage.
 *
 * This model tracks what was uploaded, by whom, and where, without ever
 * storing credentials, signed URLs, or access keys.  The objectKey is the
 * only handle needed to generate a fresh presigned URL on demand.
 */

const mongoose = require('mongoose');

const storageObjectSchema = new mongoose.Schema(
  {
    // ── Ownership ─────────────────────────────────────────────────────────────
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ── Object location ───────────────────────────────────────────────────────

    /** Bucket name at time of upload (useful if buckets change over time). */
    bucket: {
      type: String,
      required: true,
    },

    /**
     * Unique, UUID-based key used to address the object in the bucket.
     * Format:  {userId}/{uuid}.{ext}
     * Never derived from or equal to the original filename.
     */
    objectKey: {
      type: String,
      required: true,
      unique: true,
    },

    // ── File metadata ─────────────────────────────────────────────────────────

    /** Original filename as provided by the client (display only — never used as a key). */
    originalFilename: {
      type: String,
      required: true,
    },

    /** MIME type declared at upload time (e.g. image/jpeg, video/mp4). */
    mimeType: {
      type: String,
      required: true,
    },

    /** Exact byte count of the uploaded file. */
    sizeBytes: {
      type: Number,
      required: true,
      min: 0,
    },

    // ── Upload lifecycle ──────────────────────────────────────────────────────

    /**
     * pending  — metadata saved; upload in-flight or not yet started
     * uploaded — object confirmed present in storage
     * failed   — upload attempt failed; object may be missing
     * deleted  — object has been removed from storage
     */
    status: {
      type: String,
      enum: ['pending', 'uploaded', 'failed', 'deleted'],
      default: 'pending',
    },

    // ── Associations ──────────────────────────────────────────────────────────

    /** DayChat entry this file belongs to (null until the entry is created/updated). */
    dayChatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DayChat',
      index: true,
      default: null,
    },

    // ── Provider info ─────────────────────────────────────────────────────────

    /** Storage backend that holds this object. */
    provider: {
      type: String,
      enum: ['wasabi'],
      default: 'wasabi',
    },

    /**
     * Category used for storage-usage breakdown.
     * Aligns with the breakdown fields in the User model's storageUsedBreakdown.
     */
    category: {
      type: String,
      enum: ['photos', 'videos', 'audio', 'other'],
      required: true,
    },

    // ── Upload session tracking ────────────────────────────────────────────────

    /** Strategy used for this upload: direct single PUT or S3 multipart. */
    uploadType: {
      type: String,
      enum: ['single', 'multipart'],
      default: 'single',
    },

    /** S3 UploadId returned by CreateMultipartUpload (null for single-PUT uploads). */
    multipartUploadId: {
      type: String,
      default: null,
    },

    /** Number of parts generated for this multipart upload (null for single-PUT). */
    partsCount: {
      type: Number,
      default: null,
    },

    /** When the presigned upload URL(s) expire (for client reference). */
    presignedUrlExpiresAt: {
      type: Date,
      default: null,
    },

    /**
     * Deadline for this pending upload's quota reservation.
     * Stale-cleanup releases the reserved bytes and marks the record 'failed'
     * once this timestamp passes without a successful completion call.
     */
    reservedUntil: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true } // adds createdAt and updatedAt automatically
);

module.exports = mongoose.model('StorageObject', storageObjectSchema);
