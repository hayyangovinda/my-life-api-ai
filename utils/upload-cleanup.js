/**
 * Stale upload cleanup.
 *
 * On server startup, finds any StorageObject records that are still 'pending'
 * but whose reservedUntil timestamp has passed.  For each one it:
 *   1. Aborts the S3 multipart upload (if applicable)
 *   2. Deletes the object from storage (if applicable)
 *   3. Releases the reserved bytes from the owner's storageUsedBytes
 *   4. Marks the record as 'failed'
 *
 * This handles uploads interrupted by client crashes, network failures, or
 * server restarts.  Call this once after connectDB() in app.js — it runs
 * in the background and does not block server startup.
 */

const StorageObject = require('../models/storage-object-model');
const User = require('../models/user-model');
const { getStorageProvider } = require('./storage-provider-factory');

async function cleanupStaleUploads() {
  const now = new Date();

  const stale = await StorageObject.find({
    status: 'pending',
    reservedUntil: { $lt: now, $ne: null },
  });

  if (stale.length === 0) {
    console.log('[media] Stale upload cleanup: nothing to clean up.');
    return;
  }

  console.log(`[media] Stale upload cleanup: processing ${stale.length} record(s)...`);

  const provider = getStorageProvider();

  for (const obj of stale) {
    try {
      if (provider.isConfigured) {
        if (obj.uploadType === 'multipart' && obj.multipartUploadId) {
          try {
            await provider.abortMultipartUpload(obj.objectKey, obj.multipartUploadId);
          } catch (_) {
            // May have been aborted already or never started
          }
        } else {
          try {
            await provider.delete(obj.objectKey);
          } catch (_) {
            // Object may not have been uploaded yet
          }
        }
      }

      // Release quota reservation (only reserved bytes, not finalized usage)
      await User.findByIdAndUpdate(obj.owner, {
        $inc: { storageReservedBytes: -obj.sizeBytes },
      });

      obj.status = 'failed';
      obj.reservedUntil = null;
      await obj.save();

      console.log(`[media] Cleaned up stale upload: ${obj._id} (${obj.objectKey})`);
    } catch (err) {
      console.error(`[media] Failed to clean up stale upload ${obj._id}:`, err.message);
    }
  }

  console.log('[media] Stale upload cleanup complete.');
}

module.exports = { cleanupStaleUploads };
