/**
 * Unit tests for WasabiProvider, generateObjectKey, and mimeToExt.
 *
 * All AWS SDK calls are replaced with Jest factory mocks.
 * These tests do NOT make real network requests and do NOT require
 * Wasabi credentials.  See WASABI_SETUP.md for integration-test instructions.
 */

// ── Module mocks (must be declared before any require()) ────────────────────

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ _cmd: 'Put', ...input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ _cmd: 'Get', ...input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ _cmd: 'Delete', ...input })),
  HeadObjectCommand: jest.fn().mockImplementation((input) => ({ _cmd: 'Head', ...input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue(
    'https://s3.us-east-1.wasabisys.com/test-bucket/key?X-Amz-Signature=mocksig'
  ),
}));

// ── Imports ─────────────────────────────────────────────────────────────────

const { S3Client } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { WasabiProvider, generateObjectKey, mimeToExt } = require('../utils/wasabi-provider');

// ── Test fixtures ────────────────────────────────────────────────────────────

const FULL_CONFIG = {
  accessKeyId: 'FAKE_ACCESS_KEY_ID',
  secretAccessKey: 'FAKE_SECRET_ACCESS_KEY',
  bucket: 'my-test-bucket',
  region: 'us-east-1',
  endpoint: 'https://s3.us-east-1.wasabisys.com',
};

// ── WasabiProvider tests ─────────────────────────────────────────────────────

describe('WasabiProvider', () => {
  let mockSend;

  beforeEach(() => {
    jest.clearAllMocks();
    // Give S3Client a fresh send mock for each test
    mockSend = jest.fn();
    S3Client.mockImplementation(() => ({ send: mockSend }));
  });

  // ── isConfigured / constructor ─────────────────────────────────────────────

  describe('isConfigured', () => {
    test('returns true when all five config values are present', () => {
      const p = new WasabiProvider(FULL_CONFIG);
      expect(p.isConfigured).toBe(true);
    });

    test('returns false when config object is empty', () => {
      const p = new WasabiProvider({});
      expect(p.isConfigured).toBe(false);
    });

    test('returns false when any single required field is missing', () => {
      for (const key of Object.keys(FULL_CONFIG)) {
        const partial = { ...FULL_CONFIG, [key]: undefined };
        expect(new WasabiProvider(partial).isConfigured).toBe(false);
      }
    });

    test('does NOT instantiate S3Client when not configured', () => {
      new WasabiProvider({});
      expect(S3Client).not.toHaveBeenCalled();
    });

    test('instantiates S3Client with forcePathStyle:true when configured', () => {
      new WasabiProvider(FULL_CONFIG);
      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          forcePathStyle: true,
          endpoint: FULL_CONFIG.endpoint,
          region: FULL_CONFIG.region,
        })
      );
    });

    test('never passes credentials outside of S3Client constructor', () => {
      // Credentials must only appear in the S3Client constructor call,
      // not as accessible properties on the provider instance.
      const p = new WasabiProvider(FULL_CONFIG);
      expect(p.accessKeyId).toBeUndefined();
      expect(p.secretAccessKey).toBeUndefined();
    });
  });

  // ── Unconfigured provider guard ────────────────────────────────────────────

  describe('unconfigured provider throws on every operation', () => {
    let unconfigured;

    beforeEach(() => {
      unconfigured = new WasabiProvider({});
    });

    test('upload() throws with descriptive message', async () => {
      await expect(unconfigured.upload('key', Buffer.alloc(4), {})).rejects.toThrow(
        'not configured'
      );
    });

    test('getSignedUrl() throws with descriptive message', async () => {
      await expect(unconfigured.getSignedUrl('key')).rejects.toThrow('not configured');
    });

    test('delete() throws with descriptive message', async () => {
      await expect(unconfigured.delete('key')).rejects.toThrow('not configured');
    });

    test('exists() throws with descriptive message', async () => {
      await expect(unconfigured.exists('key')).rejects.toThrow('not configured');
    });
  });

  // ── upload() ───────────────────────────────────────────────────────────────

  describe('upload()', () => {
    test('calls S3Client.send once and returns { key, bucket }', async () => {
      const p = new WasabiProvider(FULL_CONFIG);
      mockSend.mockResolvedValue({});

      const buf = Buffer.from('encrypted-payload');
      const result = await p.upload('userId/abc.jpg', buf, {
        contentType: 'application/octet-stream',
        contentLength: buf.length,
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ key: 'userId/abc.jpg', bucket: 'my-test-bucket' });
    });

    test('propagates S3 errors to the caller', async () => {
      const p = new WasabiProvider(FULL_CONFIG);
      mockSend.mockRejectedValue(new Error('AccessDenied'));

      await expect(p.upload('key', Buffer.alloc(8), {})).rejects.toThrow('AccessDenied');
    });
  });

  // ── getSignedUrl() ─────────────────────────────────────────────────────────

  describe('getSignedUrl()', () => {
    test('returns a string URL', async () => {
      const p = new WasabiProvider(FULL_CONFIG);
      const url = await p.getSignedUrl('userId/abc.jpg');

      expect(typeof url).toBe('string');
      expect(url.startsWith('https://')).toBe(true);
    });

    test('passes the requested expiresIn to @aws-sdk/s3-request-presigner', async () => {
      const p = new WasabiProvider(FULL_CONFIG);
      await p.getSignedUrl('key', 7200);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 7200 }
      );
    });

    test('defaults to expiresIn=3600 when not specified', async () => {
      const p = new WasabiProvider(FULL_CONFIG);
      await p.getSignedUrl('key');

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { expiresIn: 3600 }
      );
    });
  });

  // ── delete() ──────────────────────────────────────────────────────────────

  describe('delete()', () => {
    test('sends DeleteObjectCommand and resolves without a return value', async () => {
      const p = new WasabiProvider(FULL_CONFIG);
      mockSend.mockResolvedValue({});

      const result = await p.delete('userId/abc.jpg');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result).toBeUndefined();
    });

    test('propagates S3 errors to the caller', async () => {
      const p = new WasabiProvider(FULL_CONFIG);
      mockSend.mockRejectedValue(new Error('NoSuchBucket'));

      await expect(p.delete('key')).rejects.toThrow('NoSuchBucket');
    });
  });

  // ── exists() ──────────────────────────────────────────────────────────────

  describe('exists()', () => {
    test('returns true when HeadObject succeeds', async () => {
      const p = new WasabiProvider(FULL_CONFIG);
      mockSend.mockResolvedValue({ ContentLength: 1024 });

      expect(await p.exists('userId/abc.jpg')).toBe(true);
    });

    test('returns false when the error name is "NotFound"', async () => {
      const p = new WasabiProvider(FULL_CONFIG);
      mockSend.mockRejectedValue(
        Object.assign(new Error('Not Found'), { name: 'NotFound' })
      );

      expect(await p.exists('missing.jpg')).toBe(false);
    });

    test('returns false when $metadata.httpStatusCode is 404', async () => {
      const p = new WasabiProvider(FULL_CONFIG);
      mockSend.mockRejectedValue(
        Object.assign(new Error('Not Found'), { $metadata: { httpStatusCode: 404 } })
      );

      expect(await p.exists('missing.jpg')).toBe(false);
    });

    test('re-throws errors that are not 404s', async () => {
      const p = new WasabiProvider(FULL_CONFIG);
      mockSend.mockRejectedValue(new Error('ServiceUnavailable'));

      await expect(p.exists('key')).rejects.toThrow('ServiceUnavailable');
    });
  });
});

// ── generateObjectKey() ──────────────────────────────────────────────────────

describe('generateObjectKey()', () => {
  test('prefixes the key with the userId', () => {
    const key = generateObjectKey('user123', 'image/jpeg');
    expect(key.startsWith('user123/')).toBe(true);
  });

  test('appends the correct extension for common MIME types', () => {
    expect(generateObjectKey('u', 'image/jpeg')).toMatch(/\.jpg$/);
    expect(generateObjectKey('u', 'image/png')).toMatch(/\.png$/);
    expect(generateObjectKey('u', 'video/mp4')).toMatch(/\.mp4$/);
    expect(generateObjectKey('u', 'video/quicktime')).toMatch(/\.mov$/);
    expect(generateObjectKey('u', 'audio/mpeg')).toMatch(/\.mp3$/);
    expect(generateObjectKey('u', 'audio/webm')).toMatch(/\.weba$/);
  });

  test('falls back to .bin for unknown MIME types', () => {
    expect(generateObjectKey('u', 'application/x-custom')).toMatch(/\.bin$/);
  });

  test('produces a different key on every call', () => {
    const keys = new Set(Array.from({ length: 10 }, () => generateObjectKey('u', 'image/jpeg')));
    expect(keys.size).toBe(10);
  });

  test('the UUID segment matches the UUID v4 format', () => {
    const key = generateObjectKey('user-abc', 'image/png');
    // Strip "user-abc/" prefix and ".png" suffix
    const uuidPart = key.slice('user-abc/'.length, -'.png'.length);
    const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuidPart).toMatch(uuidV4Pattern);
  });
});

// ── mimeToExt() ──────────────────────────────────────────────────────────────

describe('mimeToExt()', () => {
  test.each([
    ['image/jpeg', 'jpg'],
    ['image/jpg', 'jpg'],
    ['image/png', 'png'],
    ['image/gif', 'gif'],
    ['image/webp', 'webp'],
    ['image/heic', 'heic'],
    ['video/mp4', 'mp4'],
    ['video/quicktime', 'mov'],
    ['video/webm', 'webm'],
    ['audio/mpeg', 'mp3'],
    ['audio/mp4', 'm4a'],
    ['audio/wav', 'wav'],
    ['audio/ogg', 'ogg'],
    ['audio/webm', 'weba'],
    ['audio/flac', 'flac'],
    ['audio/aac', 'aac'],
    ['application/octet-stream', 'bin'],
    ['unknown/completely-new-type', 'bin'],
  ])('%s → %s', (mimeType, expected) => {
    expect(mimeToExt(mimeType)).toBe(expected);
  });
});

// ── storage-config.js tests ──────────────────────────────────────────────────

describe('validateWasabiConfig()', () => {
  const { validateWasabiConfig, REQUIRED_WASABI_VARS } = require('../config/storage-config');

  // Save and restore env for each test
  let savedEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    for (const v of REQUIRED_WASABI_VARS) {
      delete process.env[v];
    }
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const v of REQUIRED_WASABI_VARS) {
      if (savedEnv[v] !== undefined) {
        process.env[v] = savedEnv[v];
      } else {
        delete process.env[v];
      }
    }
    jest.restoreAllMocks();
  });

  test('returns false and warns when all vars are missing', () => {
    const result = validateWasabiConfig();
    expect(result).toBe(false);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  test('returns false when only some vars are present', () => {
    process.env.WASABI_ACCESS_KEY_ID = 'key';
    process.env.WASABI_BUCKET = 'bucket';
    const result = validateWasabiConfig();
    expect(result).toBe(false);
  });

  test('returns true when all vars are present', () => {
    process.env.WASABI_ACCESS_KEY_ID = 'key';
    process.env.WASABI_SECRET_ACCESS_KEY = 'secret';
    process.env.WASABI_BUCKET = 'bucket';
    process.env.WASABI_REGION = 'us-east-1';
    process.env.WASABI_ENDPOINT = 'https://s3.us-east-1.wasabisys.com';
    const result = validateWasabiConfig();
    expect(result).toBe(true);
  });

  test('warning message lists variable names but no values', () => {
    validateWasabiConfig();
    const warnCall = console.warn.mock.calls[0][0];
    // Should mention the variable name
    expect(warnCall).toContain('WASABI_ACCESS_KEY_ID');
    // Should NOT contain any credential values
    expect(warnCall).not.toContain('FAKE_ACCESS_KEY');
    expect(warnCall).not.toContain('FAKE_SECRET');
  });
});
