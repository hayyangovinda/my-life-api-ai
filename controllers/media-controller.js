/**
 * Media upload controller — secure photo/video/audio upload via Wasabi.
 *
 * Upload flow:
 *   1. POST /upload-session  → server validates, reserves quota, returns presigned URL(s)
 *   2. Client uploads directly to Wasabi using the presigned URL(s)
 *   3. POST /:objectId/complete → server verifies via HeadObject, marks uploaded
 *
 * Quota tracking:
 *   storageReservedBytes — incremented when a session is created; decremented on
 *                          completion, cancellation or stale cleanup.
 *   storageUsedBytes     — incremented only after successful server-side verification;
 *                          decremented only after confirmed deletion.
 *   Quota guard:  storageUsedBytes + storageReservedBytes + newSize <= planLimit
 *
 * Cancellation:
 *   POST /:objectId/cancel → aborts multipart (if applicable), releases reservation
 *
 * Deletion:
 *   DELETE /:objectId → removes object from Wasabi, decrements storageUsedBytes
 *
 * Download:
 *   GET /:objectId/signed-url → returns a time-limited presigned GET URL
 *
 * File listing:
 *   GET / → paginated list of the authenticated user's uploaded objects
 */

const mongoose = require('mongoose');
const User = require('../models/user-model');
const StorageObject = require('../models/storage-object-model');
const { getStorageProvider } = require('../utils/storage-provider-factory');
const { generateObjectKey } = require('../utils/wasabi-provider');
const { getPlanById } = require('../config/storage-plans');
const {
  ALLOWED_PHOTO_TYPES,
  ALLOWED_VIDEO_TYPES,
  ALLOWED_AUDIO_TYPES,
  MAX_FILE_BYTES,
  MULTIPART_THRESHOLD_BYTES,
  MULTIPART_PART_BYTES,
  PRESIGNED_URL_TTL_SECONDS,
  UPLOAD_RESERVATION_TTL_MS,
} = require('../config/storage-config');

// ── Helpers ───────────────────────────────────────────────────────────────

const ALL_ALLOWED_TYPES = new Set([
  ...ALLOWED_PHOTO_TYPES,
  ...ALLOWED_VIDEO_TYPES,
  ...ALLOWED_AUDIO_TYPES,
]);

function mimeToCategory(mimeType) {
  if (ALLOWED_PHOTO_TYPES.has(mimeType)) return 'photos';
  if (ALLOWED_VIDEO_TYPES.has(mimeType)) return 'videos';
  if (ALLOWED_AUDIO_TYPES.has(mimeType)) return 'audio';
  return 'other';
}

/**
 * Release a pending quota reservation (upload cancelled or failed before completion).
 * Decrements storageReservedBytes only — storageUsedBytes is not touched.
 */
async function releaseReservation(userId, sizeBytes) {
  await User.findByIdAndUpdate(userId, {
    $inc: { storageReservedBytes: -sizeBytes },
  });
}

// ── POST /api/v1/media/upload-session ─────────────────────────────────────

/**
 * Initiate a new upload session.
 *
 * Body: { filename: string, mimeType: string, sizeBytes: number }
 *
 * Quota guard (atomic):
 *   storageUsedBytes + storageReservedBytes + newSize <= planLimit
 *
 * Returns for single upload:
 *   { objectId, uploadType: 'single', presignedUrl, expiresAt }
 *
 * Returns for multipart upload:
 *   { objectId, uploadType: 'multipart', multipartUploadId,
 *     parts: [{ partNumber, presignedUrl, maxBytes }], expiresAt }
 */
const initiateUpload = async (req, res) => {
  const { filename, mimeType, sizeBytes } = req.body;
  const userId = req.user.userId;

  // ── Input validation ──────────────────────────────────────────────────────

  if (!filename || !mimeType || sizeBytes == null) {
    return res.status(400).json({ message: 'filename, mimeType and sizeBytes are required' });
  }

  const size = Number(sizeBytes);
  if (!Number.isInteger(size) || size <= 0) {
    return res.status(400).json({ message: 'sizeBytes must be a positive integer' });
  }
  if (size > MAX_FILE_BYTES) {
    return res.status(413).json({
      message: `File too large. Maximum allowed size is ${MAX_FILE_BYTES} bytes (200 MiB).`,
    });
  }
  if (!ALL_ALLOWED_TYPES.has(mimeType)) {
    return res.status(415).json({ message: `Unsupported media type: ${mimeType}` });
  }

  const category = mimeToCategory(mimeType);

  // ── Storage provider check ────────────────────────────────────────────────

  const provider = getStorageProvider();
  if (!provider.isConfigured) {
    return res.status(503).json({
      message: 'Object storage is not configured. Contact the administrator.',
    });
  }

  // ── Resolve plan limit ────────────────────────────────────────────────────

  const user = await User.findById(userId).select('storagePlanId');
  if (!user) return res.status(404).json({ message: 'User not found' });

  const planId = user.storagePlanId || 'free';
  const plan = getPlanById(planId) || getPlanById('free');
  const planLimit = plan.storageLimitBytes;

  // ── Atomic quota reservation ──────────────────────────────────────────────
  //
  // Guard: storageUsedBytes + storageReservedBytes + newSize <= planLimit
  //
  // The $expr condition evaluates the arithmetic server-side so no two concurrent
  // requests can both succeed when there is only enough headroom for one.
  // On success, only storageReservedBytes is incremented (not storageUsedBytes).

  const updated = await User.findOneAndUpdate(
    {
      _id: userId,
      storagePlanId: planId,
      $expr: {
        $lte: [
          { $add: ['$storageUsedBytes', '$storageReservedBytes', size] },
          planLimit,
        ],
      },
    },
    { $inc: { storageReservedBytes: size } },
    { new: true }
  );

  if (!updated) {
    return res.status(409).json({
      message: 'Storage quota exceeded. Please upgrade your plan to upload more files.',
    });
  }

  // ── Build StorageObject and generate upload URL(s) ────────────────────────

  const objectKey = generateObjectKey(userId, mimeType);
  const reservedUntil = new Date(Date.now() + UPLOAD_RESERVATION_TTL_MS);
  const presignedUrlExpiresAt = new Date(Date.now() + PRESIGNED_URL_TTL_SECONDS * 1000);
  const uploadType = size > MULTIPART_THRESHOLD_BYTES ? 'multipart' : 'single';

  const baseRecord = {
    owner: userId,
    bucket: provider.bucket,
    objectKey,
    originalFilename: filename,
    mimeType,
    sizeBytes: size,
    category,
    status: 'pending',
    uploadType,
    presignedUrlExpiresAt,
    reservedUntil,
  };

  try {
    if (uploadType === 'single') {
      const presignedUrl = await provider.createPresignedPutUrl(objectKey, {
        contentType: mimeType,
        expiresIn: PRESIGNED_URL_TTL_SECONDS,
      });

      const storageObject = await StorageObject.create(baseRecord);

      return res.status(201).json({
        objectId: storageObject._id,
        uploadType: 'single',
        presignedUrl,
        expiresAt: presignedUrlExpiresAt.toISOString(),
      });
    }

    // Multipart
    const multipartUploadId = await provider.createMultipartUpload(objectKey, {
      contentType: mimeType,
    });

    const partsCount = Math.ceil(size / MULTIPART_PART_BYTES);
    const partUrls = await Promise.all(
      Array.from({ length: partsCount }, (_, i) =>
        provider.createPresignedPartUrl(
          objectKey,
          multipartUploadId,
          i + 1,
          PRESIGNED_URL_TTL_SECONDS
        )
      )
    );

    const storageObject = await StorageObject.create({
      ...baseRecord,
      multipartUploadId,
      partsCount,
    });

    return res.status(201).json({
      objectId: storageObject._id,
      uploadType: 'multipart',
      multipartUploadId,
      parts: partUrls.map((url, i) => ({
        partNumber: i + 1,
        presignedUrl: url,
        maxBytes:
          i < partsCount - 1
            ? MULTIPART_PART_BYTES
            : size - i * MULTIPART_PART_BYTES,
      })),
      expiresAt: presignedUrlExpiresAt.toISOString(),
    });
  } catch (err) {
    // URL generation failed — release the reservation before propagating
    await releaseReservation(userId, size);
    throw err;
  }
};

// ── POST /api/v1/media/:objectId/complete ─────────────────────────────────

/**
 * Confirm that the client has finished uploading.
 * The server independently verifies via HeadObject before marking uploaded.
 *
 * On success:
 *   storageReservedBytes  -= sizeBytes
 *   storageUsedBytes      += sizeBytes
 *   storageUsedBreakdown.{category} += sizeBytes
 */
const completeUpload = async (req, res) => {
  const { objectId } = req.params;
  const userId = req.user.userId;

  const storageObject = await StorageObject.findById(objectId);
  if (!storageObject) return res.status(404).json({ message: 'Upload session not found' });

  if (storageObject.owner.toString() !== userId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // Idempotent — already completed
  if (storageObject.status === 'uploaded') {
    return res.status(200).json({ message: 'Already completed', objectId });
  }

  if (storageObject.status !== 'pending') {
    return res.status(409).json({
      message: `Upload cannot be completed: current status is '${storageObject.status}'`,
    });
  }

  const provider = getStorageProvider();

  // Finalise multipart if needed — ETags are fetched server-side via ListParts
  if (storageObject.uploadType === 'multipart') {
    const parts = await provider.listParts(storageObject.objectKey, storageObject.multipartUploadId);
    if (parts.length !== storageObject.partsCount) {
      return res.status(422).json({
        message: `Expected ${storageObject.partsCount} parts but only ${parts.length} found in storage`,
      });
    }

    await provider.completeMultipartUpload(
      storageObject.objectKey,
      storageObject.multipartUploadId,
      parts
    );
  }

  // Server-side verification — independently confirm the object is in storage
  let actualSize;
  try {
    const meta = await provider.headObject(storageObject.objectKey);
    actualSize = meta.contentLength;
  } catch (err) {
    // Object missing — upload did not land; release reservation
    await releaseReservation(userId, storageObject.sizeBytes);
    storageObject.status = 'failed';
    storageObject.reservedUntil = null;
    await storageObject.save();
    return res.status(422).json({
      message: 'Upload verification failed: object not found in storage',
    });
  }

  if (!actualSize || actualSize === 0) {
    await releaseReservation(userId, storageObject.sizeBytes);
    try { await provider.delete(storageObject.objectKey); } catch (_) {}
    storageObject.status = 'failed';
    storageObject.reservedUntil = null;
    await storageObject.save();
    return res.status(422).json({
      message: 'Upload verification failed: empty object',
    });
  }

  // Mark as uploaded
  storageObject.status = 'uploaded';
  storageObject.reservedUntil = null;
  await storageObject.save();

  // Atomically move reservation → finalized usage
  const breakdownField = `storageUsedBreakdown.${storageObject.category}`;
  await User.findByIdAndUpdate(userId, {
    $inc: {
      storageReservedBytes: -storageObject.sizeBytes,
      storageUsedBytes: storageObject.sizeBytes,
      [breakdownField]: storageObject.sizeBytes,
    },
  });

  res.status(200).json({
    objectId: storageObject._id,
    message: 'Upload completed successfully',
    objectKey: storageObject.objectKey,
  });
};

// ── POST /api/v1/media/:objectId/cancel ───────────────────────────────────

/**
 * Cancel a pending upload, aborting any multipart in progress and releasing
 * the reserved quota.
 */
const cancelUpload = async (req, res) => {
  const { objectId } = req.params;
  const userId = req.user.userId;

  const storageObject = await StorageObject.findById(objectId);
  if (!storageObject) return res.status(404).json({ message: 'Upload session not found' });

  if (storageObject.owner.toString() !== userId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // Idempotent — already cancelled or cleaned up
  if (storageObject.status === 'failed' || storageObject.status === 'deleted') {
    return res.status(200).json({ message: 'Already cancelled' });
  }

  if (storageObject.status !== 'pending') {
    return res.status(409).json({
      message: `Cannot cancel an upload with status '${storageObject.status}'`,
    });
  }

  const provider = getStorageProvider();

  if (storageObject.uploadType === 'multipart' && storageObject.multipartUploadId) {
    try {
      await provider.abortMultipartUpload(
        storageObject.objectKey,
        storageObject.multipartUploadId
      );
    } catch (err) {
      // May already be aborted or never started — log and continue
      console.warn(
        `[media] Failed to abort multipart ${storageObject.multipartUploadId}:`,
        err.message
      );
    }
  } else {
    // Single-PUT: attempt to delete the object in case a partial upload landed
    try {
      await provider.delete(storageObject.objectKey);
    } catch (_) {
      // Object may not exist yet — ignore
    }
  }

  await releaseReservation(userId, storageObject.sizeBytes);

  storageObject.status = 'failed';
  storageObject.reservedUntil = null;
  await storageObject.save();

  res.status(200).json({ message: 'Upload cancelled' });
};

// ── DELETE /api/v1/media/:objectId ────────────────────────────────────────

/**
 * Permanently delete an uploaded object from Wasabi and release its quota.
 *
 * Security: findOneAndUpdate with {status:'uploaded'} atomically claims the
 * deletion so concurrent requests cannot both decrement quota.  The deletion
 * is idempotent — calling it again on an already-deleted object returns 200.
 */
const deleteObject = async (req, res) => {
  const { objectId } = req.params;
  const userId = req.user.userId;

  const storageObject = await StorageObject.findById(objectId);
  if (!storageObject) return res.status(404).json({ message: 'Object not found' });

  if (storageObject.owner.toString() !== userId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // Idempotent — already deleted
  if (storageObject.status === 'deleted') {
    return res.status(200).json({ message: 'Already deleted' });
  }

  if (storageObject.status !== 'uploaded') {
    return res.status(409).json({
      message: `Cannot delete object with status '${storageObject.status}'. Only uploaded objects can be deleted.`,
    });
  }

  const provider = getStorageProvider();

  // Remove from Wasabi first.  S3 DeleteObject is idempotent, so a 404 is
  // not an error — the object may have been removed out-of-band.
  if (provider.isConfigured) {
    try {
      await provider.delete(storageObject.objectKey);
    } catch (err) {
      // Log but continue — we still want to update the DB and release quota.
      // Any lingering object in Wasabi will be caught by reconciliation.
      console.warn('[media] Wasabi delete failed for key:', storageObject.objectKey, err.message);
    }
  }

  // Atomically claim the deletion: only one concurrent request can transition
  // from 'uploaded' → 'deleted'.  If another request already did so the
  // findOneAndUpdate returns null and we return 200 idempotently.
  const claimed = await StorageObject.findOneAndUpdate(
    { _id: objectId, status: 'uploaded' },
    { $set: { status: 'deleted' } },
    { new: true }
  );

  if (!claimed) {
    // Race condition: another request already completed the deletion
    return res.status(200).json({ message: 'Already deleted' });
  }

  // Decrement finalized usage counters
  const breakdownField = `storageUsedBreakdown.${storageObject.category}`;
  await User.findByIdAndUpdate(userId, {
    $inc: {
      storageUsedBytes: -storageObject.sizeBytes,
      [breakdownField]: -storageObject.sizeBytes,
    },
  });

  return res.status(200).json({ message: 'Deleted successfully', objectId });
};

// ── GET /api/v1/media/ ────────────────────────────────────────────────────

/**
 * List the authenticated user's uploaded storage objects.
 *
 * Query params:
 *   category  — 'photos' | 'videos' | 'audio' | 'other'  (optional filter)
 *   page      — 1-based page number (default 1)
 *   limit     — items per page, max 100 (default 20)
 */
const listObjects = async (req, res) => {
  const userId = req.user.userId;
  const { category, page = '1', limit = '20' } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const filter = { owner: userId, status: 'uploaded' };
  const validCategories = ['photos', 'videos', 'audio', 'other'];
  if (category && validCategories.includes(category)) {
    filter.category = category;
  }

  const [objects, total] = await Promise.all([
    StorageObject.find(filter)
      .select('_id originalFilename mimeType sizeBytes category createdAt dayChatId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    StorageObject.countDocuments(filter),
  ]);

  return res.status(200).json({
    objects: objects.map((o) => ({
      objectId: o._id,
      filename: o.originalFilename,
      mimeType: o.mimeType,
      sizeBytes: o.sizeBytes,
      category: o.category,
      createdAt: o.createdAt,
      dayChatId: o.dayChatId,
    })),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
};

// ── GET /api/v1/media/:objectId/signed-url ────────────────────────────────

/**
 * Generate a short-lived presigned GET URL for a completed upload.
 * Returns: { url: string, expiresAt: string (ISO 8601) }
 */
const getSignedDownloadUrl = async (req, res) => {
  const { objectId } = req.params;
  const userId = req.user.userId;

  const storageObject = await StorageObject.findById(objectId);
  if (!storageObject) return res.status(404).json({ message: 'Object not found' });

  if (storageObject.owner.toString() !== userId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  if (storageObject.status !== 'uploaded') {
    return res.status(404).json({ message: 'Object is not available' });
  }

  const provider = getStorageProvider();
  const url = await provider.getSignedUrl(storageObject.objectKey, PRESIGNED_URL_TTL_SECONDS);
  const expiresAt = new Date(Date.now() + PRESIGNED_URL_TTL_SECONDS * 1000).toISOString();

  res.status(200).json({ url, expiresAt });
};

module.exports = {
  initiateUpload,
  completeUpload,
  cancelUpload,
  deleteObject,
  listObjects,
  getSignedDownloadUrl,
};
