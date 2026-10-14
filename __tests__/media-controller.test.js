/**
 * Unit tests for media-controller.js
 *
 * All external dependencies (Mongoose models, storage provider, wasabi-provider
 * key generator) are replaced with Jest mocks.  No network requests are made.
 */

// ── Module mocks (declared before any require()) ──────────────────────────

jest.mock('../utils/storage-provider-factory');
jest.mock('../utils/wasabi-provider', () => ({
  generateObjectKey: jest.fn().mockReturnValue('user123/test-uuid.jpg'),
}));
jest.mock('../config/storage-plans', () => ({
  getPlanById: jest.fn(),
}));
jest.mock('../models/user-model', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));
jest.mock('../models/storage-object-model', () => ({
  findById: jest.fn(),
  create: jest.fn(),
  find: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────

const { getStorageProvider } = require('../utils/storage-provider-factory');
const { generateObjectKey } = require('../utils/wasabi-provider');
const { getPlanById } = require('../config/storage-plans');
const User = require('../models/user-model');
const StorageObject = require('../models/storage-object-model');
const {
  initiateUpload,
  completeUpload,
  cancelUpload,
  getSignedDownloadUrl,
} = require('../controllers/media-controller');

// ── Test helpers ──────────────────────────────────────────────────────────

function makeReq(overrides = {}) {
  return {
    user: { userId: 'user123' },
    body: {},
    params: {},
    ...overrides,
  };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function makeMockProvider(overrides = {}) {
  return {
    isConfigured: true,
    bucket: 'test-bucket',
    createPresignedPutUrl: jest.fn().mockResolvedValue('https://wasabi.example.com/put-url'),
    createMultipartUpload: jest.fn().mockResolvedValue('upload-id-123'),
    createPresignedPartUrl: jest.fn().mockResolvedValue('https://wasabi.example.com/part-url'),
    listParts: jest.fn().mockResolvedValue([
      { partNumber: 1, etag: '"etag1"' },
      { partNumber: 2, etag: '"etag2"' },
    ]),
    completeMultipartUpload: jest.fn().mockResolvedValue(undefined),
    headObject: jest.fn().mockResolvedValue({ contentLength: 1024, contentType: 'image/jpeg' }),
    delete: jest.fn().mockResolvedValue(undefined),
    abortMultipartUpload: jest.fn().mockResolvedValue(undefined),
    getSignedUrl: jest.fn().mockResolvedValue('https://wasabi.example.com/signed-url'),
    ...overrides,
  };
}

function makeStorageObject(overrides = {}) {
  return {
    _id: 'obj123',
    owner: { toString: () => 'user123' },
    status: 'pending',
    uploadType: 'single',
    objectKey: 'user123/test-uuid.jpg',
    sizeBytes: 1024,
    category: 'photos',
    multipartUploadId: null,
    partsCount: null,
    reservedUntil: new Date(Date.now() + 7_200_000),
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ── Test suites ───────────────────────────────────────────────────────────

describe('initiateUpload()', () => {
  let mockProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider = makeMockProvider();
    getStorageProvider.mockReturnValue(mockProvider);

    getPlanById.mockReturnValue({
      id: 'free',
      storageLimitBytes: 500 * 1024 * 1024,
    });

    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'user123', storagePlanId: 'free' }),
    });
    User.findOneAndUpdate.mockResolvedValue({ _id: 'user123', storageUsedBytes: 1024 });
    User.findByIdAndUpdate.mockResolvedValue({});

    StorageObject.create.mockResolvedValue({ _id: 'obj123' });
  });

  test('returns 400 when required fields are missing', async () => {
    const res = makeRes();
    await initiateUpload(makeReq({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 when sizeBytes is zero', async () => {
    const res = makeRes();
    await initiateUpload(
      makeReq({ body: { filename: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 0 } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 when sizeBytes is negative', async () => {
    const res = makeRes();
    await initiateUpload(
      makeReq({ body: { filename: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: -1 } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 413 when file exceeds 200 MB', async () => {
    const res = makeRes();
    await initiateUpload(
      makeReq({ body: { filename: 'big.mp4', mimeType: 'video/mp4', sizeBytes: 201 * 1024 * 1024 } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(413);
  });

  test('returns 415 when MIME type is not allowed', async () => {
    const res = makeRes();
    await initiateUpload(
      makeReq({ body: { filename: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 1024 } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(415);
  });

  test('returns 503 when storage provider is not configured', async () => {
    getStorageProvider.mockReturnValue(makeMockProvider({ isConfigured: false }));
    const res = makeRes();
    await initiateUpload(
      makeReq({ body: { filename: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(503);
  });

  test('returns 404 when user does not exist', async () => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    const res = makeRes();
    await initiateUpload(
      makeReq({ body: { filename: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 409 when quota would be exceeded', async () => {
    User.findOneAndUpdate.mockResolvedValue(null); // atomic update returns null → quota exceeded
    const res = makeRes();
    await initiateUpload(
      makeReq({ body: { filename: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('returns 201 with presignedUrl for a single upload', async () => {
    const res = makeRes();
    await initiateUpload(
      makeReq({ body: { filename: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.uploadType).toBe('single');
    expect(typeof body.presignedUrl).toBe('string');
    expect(body.objectId).toBeDefined();
  });

  test('uses multipart when file exceeds 50 MB threshold', async () => {
    const size = 60 * 1024 * 1024; // 60 MB
    // Multipart: 6 parts × 10 MB
    mockProvider.createMultipartUpload.mockResolvedValue('mp-id');
    mockProvider.createPresignedPartUrl.mockResolvedValue('https://wasabi.example.com/part');

    const res = makeRes();
    await initiateUpload(
      makeReq({ body: { filename: 'video.mp4', mimeType: 'video/mp4', sizeBytes: size } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const body = res.json.mock.calls[0][0];
    expect(body.uploadType).toBe('multipart');
    expect(Array.isArray(body.parts)).toBe(true);
    expect(body.parts.length).toBe(6); // ceil(60 MB / 10 MB)
    expect(mockProvider.createMultipartUpload).toHaveBeenCalledTimes(1);
  });

  test('releases reserved quota when presigned URL generation throws', async () => {
    mockProvider.createPresignedPutUrl.mockRejectedValue(new Error('S3 error'));
    const res = makeRes();
    await expect(
      initiateUpload(
        makeReq({ body: { filename: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 } }),
        res
      )
    ).rejects.toThrow('S3 error');
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user123',
      expect.objectContaining({ $inc: { storageUsedBytes: -1024 } })
    );
  });

  test('atomic update condition includes plan ID and quota limit', async () => {
    const res = makeRes();
    await initiateUpload(
      makeReq({ body: { filename: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 } }),
      res
    );
    const [filter, update] = User.findOneAndUpdate.mock.calls[0];
    expect(filter.storagePlanId).toBe('free');
    expect(filter.$expr).toBeDefined();
    expect(update.$inc.storageUsedBytes).toBe(1024);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('completeUpload()', () => {
  let mockProvider;
  let mockObj;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider = makeMockProvider();
    getStorageProvider.mockReturnValue(mockProvider);

    mockObj = makeStorageObject();
    StorageObject.findById.mockResolvedValue(mockObj);
    User.findByIdAndUpdate.mockResolvedValue({});
  });

  test('returns 404 when storage object does not exist', async () => {
    StorageObject.findById.mockResolvedValue(null);
    const res = makeRes();
    await completeUpload(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 403 when the requesting user does not own the object', async () => {
    StorageObject.findById.mockResolvedValue(
      makeStorageObject({ owner: { toString: () => 'other-user' } })
    );
    const res = makeRes();
    await completeUpload(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('returns 200 idempotently when already uploaded', async () => {
    StorageObject.findById.mockResolvedValue(
      makeStorageObject({ status: 'uploaded' })
    );
    const res = makeRes();
    await completeUpload(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockProvider.headObject).not.toHaveBeenCalled();
  });

  test('returns 409 when status is not pending or uploaded', async () => {
    StorageObject.findById.mockResolvedValue(makeStorageObject({ status: 'failed' }));
    const res = makeRes();
    await completeUpload(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('returns 422 and releases quota when headObject throws (object missing)', async () => {
    mockProvider.headObject.mockRejectedValue(
      Object.assign(new Error('Not Found'), { name: 'NotFound' })
    );
    const res = makeRes();
    await completeUpload(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user123',
      expect.objectContaining({ $inc: { storageUsedBytes: -1024 } })
    );
    expect(mockObj.save).toHaveBeenCalled();
    expect(mockObj.status).toBe('failed');
  });

  test('returns 200 on successful single-upload completion', async () => {
    const res = makeRes();
    await completeUpload(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockObj.status).toBe('uploaded');
    expect(mockObj.save).toHaveBeenCalled();
    // Breakdown update
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user123',
      expect.objectContaining({ $inc: { 'storageUsedBreakdown.photos': 1024 } })
    );
  });

  test('calls listParts then completeMultipartUpload for multipart (no body required)', async () => {
    const parts = [
      { partNumber: 1, etag: '"etag1"' },
      { partNumber: 2, etag: '"etag2"' },
    ];
    mockProvider.listParts.mockResolvedValue(parts);
    StorageObject.findById.mockResolvedValue(
      makeStorageObject({
        uploadType: 'multipart',
        multipartUploadId: 'mp-id',
        partsCount: 2,
      })
    );
    const res = makeRes();
    await completeUpload(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(mockProvider.listParts).toHaveBeenCalledWith('user123/test-uuid.jpg', 'mp-id');
    expect(mockProvider.completeMultipartUpload).toHaveBeenCalledWith(
      'user123/test-uuid.jpg',
      'mp-id',
      parts
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('returns 422 for multipart when listParts returns wrong part count', async () => {
    mockProvider.listParts.mockResolvedValue([{ partNumber: 1, etag: '"etag1"' }]);
    StorageObject.findById.mockResolvedValue(
      makeStorageObject({ uploadType: 'multipart', multipartUploadId: 'mp-id', partsCount: 3 })
    );
    const res = makeRes();
    await completeUpload(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(422);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('cancelUpload()', () => {
  let mockProvider;
  let mockObj;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider = makeMockProvider();
    getStorageProvider.mockReturnValue(mockProvider);

    mockObj = makeStorageObject();
    StorageObject.findById.mockResolvedValue(mockObj);
    User.findByIdAndUpdate.mockResolvedValue({});
  });

  test('returns 404 when object does not exist', async () => {
    StorageObject.findById.mockResolvedValue(null);
    const res = makeRes();
    await cancelUpload(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 403 for wrong owner', async () => {
    StorageObject.findById.mockResolvedValue(
      makeStorageObject({ owner: { toString: () => 'other' } })
    );
    const res = makeRes();
    await cancelUpload(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('returns 200 idempotently when already failed', async () => {
    StorageObject.findById.mockResolvedValue(makeStorageObject({ status: 'failed' }));
    const res = makeRes();
    await cancelUpload(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('returns 409 when trying to cancel a completed upload', async () => {
    StorageObject.findById.mockResolvedValue(makeStorageObject({ status: 'uploaded' }));
    const res = makeRes();
    await cancelUpload(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('releases quota and marks failed on successful cancel', async () => {
    const res = makeRes();
    await cancelUpload(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user123',
      expect.objectContaining({ $inc: { storageUsedBytes: -1024 } })
    );
    expect(mockObj.status).toBe('failed');
    expect(mockObj.save).toHaveBeenCalled();
  });

  test('calls abortMultipartUpload for a multipart upload', async () => {
    StorageObject.findById.mockResolvedValue(
      makeStorageObject({
        uploadType: 'multipart',
        multipartUploadId: 'mp-id',
      })
    );
    const res = makeRes();
    await cancelUpload(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(mockProvider.abortMultipartUpload).toHaveBeenCalledWith(
      'user123/test-uuid.jpg',
      'mp-id'
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('still succeeds when abortMultipartUpload throws', async () => {
    StorageObject.findById.mockResolvedValue(
      makeStorageObject({ uploadType: 'multipart', multipartUploadId: 'mp-id' })
    );
    mockProvider.abortMultipartUpload.mockRejectedValue(new Error('already aborted'));
    const res = makeRes();
    await cancelUpload(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('getSignedDownloadUrl()', () => {
  let mockProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider = makeMockProvider();
    getStorageProvider.mockReturnValue(mockProvider);
  });

  test('returns 404 when object does not exist', async () => {
    StorageObject.findById.mockResolvedValue(null);
    const res = makeRes();
    await getSignedDownloadUrl(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 403 for wrong owner', async () => {
    StorageObject.findById.mockResolvedValue(
      makeStorageObject({ owner: { toString: () => 'other' } })
    );
    const res = makeRes();
    await getSignedDownloadUrl(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('returns 404 when status is not uploaded', async () => {
    StorageObject.findById.mockResolvedValue(makeStorageObject({ status: 'pending' }));
    const res = makeRes();
    await getSignedDownloadUrl(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 200 with url and expiresAt for a completed upload', async () => {
    StorageObject.findById.mockResolvedValue(makeStorageObject({ status: 'uploaded' }));
    const res = makeRes();
    await getSignedDownloadUrl(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(typeof body.url).toBe('string');
    expect(typeof body.expiresAt).toBe('string');
  });

  test('calls getSignedUrl with the correct object key', async () => {
    StorageObject.findById.mockResolvedValue(
      makeStorageObject({ status: 'uploaded', objectKey: 'user123/abc.jpg' })
    );
    const res = makeRes();
    await getSignedDownloadUrl(makeReq({ params: { objectId: 'obj123' } }), res);
    expect(mockProvider.getSignedUrl).toHaveBeenCalledWith('user123/abc.jpg', expect.any(Number));
  });
});
