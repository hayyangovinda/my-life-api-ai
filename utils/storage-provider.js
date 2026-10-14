/**
 * Abstract base class for object-storage providers.
 *
 * Subclass this and implement all methods to add a new backend
 * (e.g. AWS S3, GCS, Azure Blob, local disk for testing).
 * The rest of the application depends only on this interface,
 * so switching providers requires only a new subclass.
 */
class StorageProvider {
  /**
   * Upload a file buffer to object storage.
   *
   * @param {string} key - Unique object key (path within the bucket)
   * @param {Buffer} body - File data to upload
   * @param {{ contentType: string, contentLength: number }} options
   * @returns {Promise<{ key: string, bucket: string }>}
   */
  // eslint-disable-next-line no-unused-vars
  async upload(key, body, options) {
    throw new Error('StorageProvider.upload() not implemented');
  }

  /**
   * Generate a time-limited presigned URL for reading a private object.
   * The URL is suitable for returning to a client — it does not expose credentials.
   *
   * @param {string} key - Object key to generate the URL for
   * @param {number} [expiresIn=3600] - URL lifetime in seconds (max 604800 = 7 days)
   * @returns {Promise<string>} Presigned URL
   */
  // eslint-disable-next-line no-unused-vars
  async getSignedUrl(key, expiresIn = 3600) {
    throw new Error('StorageProvider.getSignedUrl() not implemented');
  }

  /**
   * Permanently delete an object from storage.
   *
   * @param {string} key - Object key to delete
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async delete(key) {
    throw new Error('StorageProvider.delete() not implemented');
  }

  /**
   * Check whether an object exists in storage without fetching its content.
   *
   * @param {string} key - Object key to check
   * @returns {Promise<boolean>}
   */
  // eslint-disable-next-line no-unused-vars
  async exists(key) {
    throw new Error('StorageProvider.exists() not implemented');
  }

  /**
   * Generate a time-limited presigned URL for a client to PUT an object directly.
   *
   * @param {string} key
   * @param {{ contentType?: string, expiresIn?: number }} [options]
   * @returns {Promise<string>} Presigned PUT URL
   */
  // eslint-disable-next-line no-unused-vars
  async createPresignedPutUrl(key, options = {}) {
    throw new Error('StorageProvider.createPresignedPutUrl() not implemented');
  }

  /**
   * Fetch object metadata without downloading the body.
   *
   * @param {string} key
   * @returns {Promise<{ contentLength: number, contentType: string, lastModified: Date }>}
   */
  // eslint-disable-next-line no-unused-vars
  async headObject(key) {
    throw new Error('StorageProvider.headObject() not implemented');
  }

  /**
   * Initiate an S3 multipart upload and return the UploadId.
   *
   * @param {string} key
   * @param {{ contentType?: string }} [options]
   * @returns {Promise<string>} uploadId
   */
  // eslint-disable-next-line no-unused-vars
  async createMultipartUpload(key, options = {}) {
    throw new Error('StorageProvider.createMultipartUpload() not implemented');
  }

  /**
   * Generate a presigned URL for uploading one part in a multipart upload.
   *
   * @param {string} key
   * @param {string} uploadId
   * @param {number} partNumber  1-based part index
   * @param {number} [expiresIn=3600]
   * @returns {Promise<string>}
   */
  // eslint-disable-next-line no-unused-vars
  async createPresignedPartUrl(key, uploadId, partNumber, expiresIn = 3600) {
    throw new Error('StorageProvider.createPresignedPartUrl() not implemented');
  }

  /**
   * Finalise a multipart upload.
   *
   * @param {string} key
   * @param {string} uploadId
   * @param {{ partNumber: number, etag: string }[]} parts
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async completeMultipartUpload(key, uploadId, parts) {
    throw new Error('StorageProvider.completeMultipartUpload() not implemented');
  }

  /**
   * Abort a multipart upload and release any uploaded parts.
   *
   * @param {string} key
   * @param {string} uploadId
   * @returns {Promise<void>}
   */
  // eslint-disable-next-line no-unused-vars
  async abortMultipartUpload(key, uploadId) {
    throw new Error('StorageProvider.abortMultipartUpload() not implemented');
  }

  /**
   * Whether this provider instance is fully configured and ready to use.
   * Returns false if any required credentials or settings are missing.
   *
   * @returns {boolean}
   */
  get isConfigured() {
    return false;
  }

  /**
   * The bucket name this provider is configured to use.
   * Returns null if the provider is not configured.
   *
   * @returns {string|null}
   */
  get bucket() {
    return null;
  }
}

module.exports = StorageProvider;
