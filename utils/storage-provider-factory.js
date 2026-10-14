/**
 * Singleton factory for the active storage provider.
 *
 * Application code should call getStorageProvider() rather than
 * instantiating WasabiProvider directly.  This keeps construction
 * in one place and makes tests easy: call setStorageProvider(mock)
 * before the code under test runs, then restore with resetStorageProvider().
 */

const { WasabiProvider } = require('./wasabi-provider');
const { validateWasabiConfig, getWasabiConfig } = require('../config/storage-config');

let _provider = null;

/**
 * Returns the shared storage provider instance, creating it on first call.
 * If Wasabi is not configured the returned provider has isConfigured === false,
 * and any operation call will throw a descriptive error.
 *
 * @returns {import('./storage-provider')}
 */
function getStorageProvider() {
  if (!_provider) {
    const configured = validateWasabiConfig();
    _provider = new WasabiProvider(configured ? getWasabiConfig() : {});
  }
  return _provider;
}

/**
 * Override the singleton with a custom provider — intended for tests.
 * @param {import('./storage-provider')} provider
 */
function setStorageProvider(provider) {
  _provider = provider;
}

/**
 * Reset the singleton so the next getStorageProvider() call re-reads env vars.
 * Useful in tests that manipulate environment variables.
 */
function resetStorageProvider() {
  _provider = null;
}

module.exports = { getStorageProvider, setStorageProvider, resetStorageProvider };
