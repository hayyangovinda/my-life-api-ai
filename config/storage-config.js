/**
 * Wasabi object-storage configuration and startup validation.
 *
 * Environment variables required (see WASABI_SETUP.md for details):
 *   WASABI_ACCESS_KEY_ID      — Wasabi access key ID
 *   WASABI_SECRET_ACCESS_KEY  — Wasabi secret access key
 *   WASABI_BUCKET             — Bucket name
 *   WASABI_REGION             — Wasabi region slug (e.g. us-east-1)
 *   WASABI_ENDPOINT           — Full endpoint URL (e.g. https://s3.us-east-1.wasabisys.com)
 */

const REQUIRED_WASABI_VARS = [
  'WASABI_ACCESS_KEY_ID',
  'WASABI_SECRET_ACCESS_KEY',
  'WASABI_BUCKET',
  'WASABI_REGION',
  'WASABI_ENDPOINT',
];

/**
 * Validates that all required Wasabi environment variables are present.
 * Logs the NAMES of any missing variables — never their values.
 * Does NOT throw; the server starts normally without object storage.
 *
 * @returns {boolean} true if all variables are present, false otherwise
 */
function validateWasabiConfig() {
  const missing = REQUIRED_WASABI_VARS.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    console.warn(
      `[storage] Wasabi object storage is NOT configured — missing env var(s): ${missing.join(', ')}. ` +
        'Media uploads to Wasabi will be unavailable until all variables are set. ' +
        'See WASABI_SETUP.md for configuration instructions.'
    );
    return false;
  }

  console.log('[storage] Wasabi configuration found. Provider will initialise on first use.');
  return true;
}

/**
 * Returns the current Wasabi configuration from environment variables.
 * Call validateWasabiConfig() first to confirm all values are present.
 *
 * @returns {{ accessKeyId: string, secretAccessKey: string, bucket: string, region: string, endpoint: string }}
 */
function getWasabiConfig() {
  return {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY,
    bucket: process.env.WASABI_BUCKET,
    region: process.env.WASABI_REGION,
    endpoint: process.env.WASABI_ENDPOINT,
  };
}

module.exports = { validateWasabiConfig, getWasabiConfig, REQUIRED_WASABI_VARS };
