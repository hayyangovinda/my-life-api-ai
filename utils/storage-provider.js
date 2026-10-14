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
   * Whether this provider instance is fully configured and ready to use.
   * Returns false if any required credentials or settings are missing.
   *
   * @returns {boolean}
   */
  get isConfigured() {
    return false;
  }
}

module.exports = StorageProvider;
