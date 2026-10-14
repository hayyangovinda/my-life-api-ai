/**
 * Media upload controller — secure photo/video/audio upload via Wasabi.
 *
 * Upload flow:
 *   1. POST /upload-session  → server validates, reserves quota, returns presigned URL(s)
 *   2. Client uploads directly to Wasabi using the presigned URL(s)
 *   3. POST /:objectId/complete → server verifies via HeadObject, marks uploaded
 *
 * Cancellation:
 *   POST /:objectId/cancel → aborts multipart (if applicable), releases quota
 *
 * Download:
 *   GET /:objectId/signed-url → returns a time-limited presigned GET URL
 */

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

async function releaseQuota(userId, sizeBytes) {
  await User.findByIdAndUpdate(userId, { $inc: { storageUsedBytes: -sizeBytes } });
}

// ── POST /api/v1/media/upload-session ─────────────────────────────────────

/**
 * Initiate a new upload session.
 *
 * Body: { filename: string, mimeType: string, sizeBytes: number }
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
      message: `File too large. Maximum allowed size is ${MAX_FILE_BYTES} bytes (200 MB).`,
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

  // ── Atomic quota reservation ──────────────────────────────────────────────

  const user = await User.findById(userId).select('storagePlanId');
  if (!user) return res.status(404).json({ message: 'User not found' });

  const planId = user.storagePlanId || 'free';
  const plan = getPlanById(planId) || getPlanById('free');
  const planLimit = plan.storageLimitBytes;

  // Atomically check + reserve: only succeeds if current usage + new size <= limit
  const updated = await User.findOneAndUpdate(
    {
      _id: userId,
      storagePlanId: planId,
      $expr: { $lte: [{ $add: ['$storageUsedBytes', size] }, planLimit] },
    },
    { $inc: { storageUsedBytes: size } },
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
    // URL generation failed — release the reserved quota before propagating
    await releaseQuota(userId, size);
    throw err;
  }
};

// ── POST /api/v1/media/:objectId/complete ─────────────────────────────────

/**
 * Confirm that the client has finished uploading.
 * For multipart uploads, body must contain:
 *   { parts: [{ partNumber: number, etag: string }] }
 *
 * The server independently verifies via HeadObject before marking uploaded.
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
    // Object missing — upload did not land
    await releaseQuota(userId, storageObject.sizeBytes);
    storageObject.status = 'failed';
    storageObject.reservedUntil = null;
    await storageObject.save();
    return res.status(422).json({
      message: 'Upload verification failed: object not found in storage',
    });
  }

  if (!actualSize || actualSize === 0) {
    await releaseQuota(userId, storageObject.sizeBytes);
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

  // Update per-category breakdown (storageUsedBytes was already reserved at session creation)
  const breakdownField = `storageUsedBreakdown.${storageObject.category}`;
  await User.findByIdAndUpdate(userId, { $inc: { [breakdownField]: storageObject.sizeBytes } });

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

  await releaseQuota(userId, storageObject.sizeBytes);

  storageObject.status = 'failed';
  storageObject.reservedUntil = null;
  await storageObject.save();

  res.status(200).json({ message: 'Upload cancelled' });
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

module.exports = { initiateUpload, completeUpload, cancelUpload, getSignedDownloadUrl };
