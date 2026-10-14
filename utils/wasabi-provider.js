/**
 * Wasabi object-storage provider (S3-compatible API).
 *
 * Uses AWS SDK v3 with forcePathStyle:true, which is required for S3-compatible
 * non-AWS endpoints.  Region and endpoint must correspond to the same Wasabi
 * region — a mismatch causes SigV4 signature failures.
 *
 * Do NOT instantiate this directly in application code.
 * Use getStorageProvider() from utils/storage-provider-factory.js instead
 * so the provider is initialised at most once.
 */

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { PRESIGNED_URL_TTL_SECONDS } = require('../config/storage-config');
const crypto = require('crypto');
const StorageProvider = require('./storage-provider');

// ── MIME → extension lookup ────────────────────────────────────────────────

const MIME_TO_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-msvideo': 'avi',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'weba',
  'audio/flac': 'flac',
  'audio/aac': 'aac',
  'application/octet-stream': 'bin',
};

/**
 * Maps a MIME type to a file extension.  Falls back to 'bin' for unknown types.
 * @param {string} mimeType
 * @returns {string}
 */
function mimeToExt(mimeType) {
  return MIME_TO_EXT[mimeType] || 'bin';
}

/**
 * Generates a unique, unpredictable object key.
 *
 * Format: {userId}/{uuid}.{ext}
 *
 * The UUID component (crypto.randomUUID) is cryptographically random and
 * cannot be guessed from the original filename or any user-visible value.
 * Prefixing with userId keeps objects logically grouped per-user without
 * making the key predictable.
 *
 * @param {string} userId
 * @param {string} mimeType
 * @returns {string}
 */
function generateObjectKey(userId, mimeType) {
  const uuid = crypto.randomUUID();
  const ext = mimeToExt(mimeType);
  return `${userId}/${uuid}.${ext}`;
}

// ── WasabiProvider ─────────────────────────────────────────────────────────

class WasabiProvider extends StorageProvider {
  /**
   * @param {{
   *   accessKeyId?:     string,
   *   secretAccessKey?: string,
   *   bucket?:          string,
   *   region?:          string,
   *   endpoint?:        string,
   * }} config  Pass an empty object (or omit) for an unconfigured instance.
   */
  constructor(config = {}) {
    super();
    this._bucket = config.bucket || null;
    this._configured = !!(
      config.accessKeyId &&
      config.secretAccessKey &&
      config.bucket &&
      config.region &&
      config.endpoint
    );

    if (this._configured) {
      this._client = new S3Client({
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        region: config.region,
        // Must match the Wasabi region in `region` above.
        endpoint: config.endpoint,
        // Required for S3-compatible non-AWS endpoints (SDK v3 uses virtual-hosted
        // style by default which breaks with custom endpoints).
        forcePathStyle: true,
      });
    }
  }

  /** @returns {boolean} */
  get isConfigured() {
    return this._configured;
  }

  /**
   * Upload a file buffer to Wasabi.  Bucket must exist and credentials must have
   * s3:PutObject permission.
   *
   * @param {string} key
   * @param {Buffer} body
   * @param {{ contentType?: string, contentLength?: number }} options
   * @returns {Promise<{ key: string, bucket: string }>}
   */
  async upload(key, body, options = {}) {
    this._assertConfigured('upload');

    await this._client.send(
      new PutObjectCommand({
        Bucket: this._bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        ContentLength: options.contentLength,
      })
    );

    return { key, bucket: this._bucket };
  }

  /**
   * Generate a presigned GET URL for a private object.
   * The URL is safe to return to a client — it contains a temporary signature,
   * not the underlying credentials.
   *
   * @param {string} key
   * @param {number} [expiresIn=3600] - Seconds until expiry (max 604800)
   * @returns {Promise<string>}
   */
  async getSignedUrl(key, expiresIn = 3600) {
    this._assertConfigured('getSignedUrl');

    const command = new GetObjectCommand({ Bucket: this._bucket, Key: key });
    return getSignedUrl(this._client, command, { expiresIn });
  }

  /**
   * Delete an object from Wasabi.  Silently succeeds if the object does not exist
   * (S3 DeleteObject is idempotent).
   *
   * @param {string} key
   * @returns {Promise<void>}
   */
  async delete(key) {
    this._assertConfigured('delete');

    await this._client.send(
      new DeleteObjectCommand({ Bucket: this._bucket, Key: key })
    );
  }

  /**
   * Check whether an object exists using a lightweight HeadObject request.
   * Returns false on a 404; re-throws all other errors.
   *
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    this._assertConfigured('exists');

    try {
      await this._client.send(new HeadObjectCommand({ Bucket: this._bucket, Key: key }));
      return true;
    } catch (err) {
      // S3/Wasabi returns a 404 for missing objects.
      // SDK v3 surfaces this as err.name === 'NotFound' or via $metadata.
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  /** @returns {string|null} */
  get bucket() {
    return this._bucket;
  }

  /**
   * Generate a presigned PUT URL so a client can upload directly to Wasabi.
   *
   * @param {string} key
   * @param {{ contentType?: string, expiresIn?: number }} [options]
   * @returns {Promise<string>}
   */
  async createPresignedPutUrl(key, options = {}) {
    this._assertConfigured('createPresignedPutUrl');

    const command = new PutObjectCommand({
      Bucket: this._bucket,
      Key: key,
      ContentType: options.contentType,
    });
    return getSignedUrl(this._client, command, {
      expiresIn: options.expiresIn ?? PRESIGNED_URL_TTL_SECONDS,
    });
  }

  /**
   * Fetch object metadata without downloading the body.
   *
   * @param {string} key
   * @returns {Promise<{ contentLength: number, contentType: string, lastModified: Date }>}
   */
  async headObject(key) {
    this._assertConfigured('headObject');

    const response = await this._client.send(
      new HeadObjectCommand({ Bucket: this._bucket, Key: key })
    );
    return {
      contentLength: response.ContentLength,
      contentType: response.ContentType,
      lastModified: response.LastModified,
    };
  }

  /**
   * Initiate an S3 multipart upload.
   *
   * @param {string} key
   * @param {{ contentType?: string }} [options]
   * @returns {Promise<string>} uploadId
   */
  async createMultipartUpload(key, options = {}) {
    this._assertConfigured('createMultipartUpload');

    const response = await this._client.send(
      new CreateMultipartUploadCommand({
        Bucket: this._bucket,
        Key: key,
        ContentType: options.contentType,
      })
    );
    return response.UploadId;
  }

  /**
   * Generate a presigned URL for uploading one part.
   *
   * @param {string} key
   * @param {string} uploadId
   * @param {number} partNumber  1-based
   * @param {number} [expiresIn=3600]
   * @returns {Promise<string>}
   */
  async createPresignedPartUrl(key, uploadId, partNumber, expiresIn = PRESIGNED_URL_TTL_SECONDS) {
    this._assertConfigured('createPresignedPartUrl');

    const command = new UploadPartCommand({
      Bucket: this._bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    return getSignedUrl(this._client, command, { expiresIn });
  }

  /**
   * Finalise a multipart upload.
   *
   * @param {string} key
   * @param {string} uploadId
   * @param {{ partNumber: number, etag: string }[]} parts
   * @returns {Promise<void>}
   */
  async completeMultipartUpload(key, uploadId, parts) {
    this._assertConfigured('completeMultipartUpload');

    await this._client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this._bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      })
    );
  }

  /**
   * List all parts that have been uploaded for a multipart upload.
   * Used by the server to fetch ETags without requiring the client to track them.
   *
   * @param {string} key
   * @param {string} uploadId
   * @returns {Promise<{ partNumber: number, etag: string }[]>}
   */
  async listParts(key, uploadId) {
    this._assertConfigured('listParts');

    const response = await this._client.send(
      new ListPartsCommand({ Bucket: this._bucket, Key: key, UploadId: uploadId })
    );
    return (response.Parts || []).map(p => ({ partNumber: p.PartNumber, etag: p.ETag }));
  }

  /**
   * Abort a multipart upload and discard any uploaded parts.
   *
   * @param {string} key
   * @param {string} uploadId
   * @returns {Promise<void>}
   */
  async abortMultipartUpload(key, uploadId) {
    this._assertConfigured('abortMultipartUpload');

    await this._client.send(
      new AbortMultipartUploadCommand({
        Bucket: this._bucket,
        Key: key,
        UploadId: uploadId,
      })
    );
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Guards every public method against use when the provider is unconfigured.
   * @param {string} methodName
   */
  _assertConfigured(methodName) {
    if (!this._configured) {
      throw new Error(
        `WasabiProvider.${methodName}(): provider is not configured — ` +
          'ensure WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY, WASABI_BUCKET, ' +
          'WASABI_REGION and WASABI_ENDPOINT are set. See WASABI_SETUP.md.'
      );
    }
  }
}

module.exports = { WasabiProvider, generateObjectKey, mimeToExt };
