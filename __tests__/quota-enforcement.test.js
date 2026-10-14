/**
 * Quota enforcement tests — boundary conditions, concurrent reservation
 * simulation, and stale upload cleanup releasing reservedBytes.
 */

// ── Module mocks ──────────────────────────────────────────────────────────────

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
  find: jest.fn(),
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  create: jest.fn(),
  countDocuments: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getStorageProvider } = require('../utils/storage-provider-factory');
const { getPlanById } = require('../config/storage-plans');
const User = require('../models/user-model');
const StorageObject = require('../models/storage-object-model');
const { initiateUpload } = require('../controllers/media-controller');
const { cleanupStaleUploads } = require('../utils/upload-cleanup');

// ── Constants ─────────────────────────────────────────────────────────────────

const FREE_PLAN_LIMIT = 500 * 1024 * 1024; // 524_288_000 bytes

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(bodyOverrides = {}) {
  return {
    user: { userId: 'user123' },
    body: { filename: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 1024, ...bodyOverrides },
    params: {},
    query: {},
  };
}

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function setupDefaultMocks(provider) {
  getStorageProvider.mockReturnValue(provider);
  getPlanById.mockReturnValue({ id: 'free', storageLimitBytes: FREE_PLAN_LIMIT });
  User.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({ _id: 'user123', storagePlanId: 'free' }),
  });
  User.findOneAndUpdate.mockResolvedValue({ _id: 'user123' });
  User.findByIdAndUpdate.mockResolvedValue({});
  StorageObject.create.mockResolvedValue({ _id: 'obj123' });
}

function makeMockProvider(overrides = {}) {
  return {
    isConfigured: true,
    bucket: 'test-bucket',
    createPresignedPutUrl: jest.fn().mockResolvedValue('https://wasabi.example.com/put-url'),
    createMultipartUpload: jest.fn().mockResolvedValue('upload-id-123'),
    createPresignedPartUrl: jest.fn().mockResolvedValue('https://wasabi.example.com/part-url'),
    abortMultipartUpload: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ── Boundary conditions ───────────────────────────────────────────────────────

describe('Quota boundary conditions', () => {
  let mockProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider = makeMockProvider();
    setupDefaultMocks(mockProvider);
  });

  test('accepts upload when atomic quota check passes', async () => {
    User.findOneAndUpdate.mockResolvedValue({ _id: 'user123' });
    const res = makeRes();
    await initiateUpload(makeReq({ sizeBytes: 1024 }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test('rejects upload when quota is full (atomic update returns null)', async () => {
    User.findOneAndUpdate.mockResolvedValue(null);
    const res = makeRes();
    await initiateUpload(makeReq({ sizeBytes: 1 }), res);
    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toMatch(/quota exceeded/i);
  });

  test('rejects sizeBytes = 0', async () => {
    const res = makeRes();
    await initiateUpload(makeReq({ sizeBytes: 0 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects negative sizeBytes', async () => {
    const res = makeRes();
    await initiateUpload(makeReq({ sizeBytes: -1 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects fractional sizeBytes (non-integer)', async () => {
    const res = makeRes();
    await initiateUpload(makeReq({ sizeBytes: 1024.5 }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects file larger than 200 MiB regardless of plan', async () => {
    getPlanById.mockReturnValue({ id: 'vault', storageLimitBytes: 200 * 1024 * 1024 * 1024 });
    const res = makeRes();
    await initiateUpload(makeReq({ filename: 'huge.mp4', mimeType: 'video/mp4', sizeBytes: 201 * 1024 * 1024 }), res);
    expect(res.status).toHaveBeenCalledWith(413);
  });

  test('rejects disallowed MIME type before touching quota', async () => {
    const res = makeRes();
    await initiateUpload(makeReq({ filename: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 1024 }), res);
    expect(res.status).toHaveBeenCalledWith(415);
    // Quota should never be touched
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('atomic filter references both storageUsedBytes and storageReservedBytes', async () => {
    const res = makeRes();
    await initiateUpload(makeReq({ sizeBytes: 4096 }), res);
    const [filter] = User.findOneAndUpdate.mock.calls[0];
    const addArgs = filter.$expr.$lte[0].$add;
    expect(addArgs).toContain('$storageUsedBytes');
    expect(addArgs).toContain('$storageReservedBytes');
  });

  test('increments storageReservedBytes (not storageUsedBytes) in atomic update', async () => {
    const sizeBytes = 8192;
    const res = makeRes();
    await initiateUpload(makeReq({ sizeBytes }), res);
    const [, update] = User.findOneAndUpdate.mock.calls[0];
    expect(update.$inc.storageReservedBytes).toBe(sizeBytes);
    expect(update.$inc.storageUsedBytes).toBeUndefined();
  });
});

// ── Concurrent reservation simulation ────────────────────────────────────────

describe('Concurrent reservation simulation', () => {
  let mockProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider = makeMockProvider();
    setupDefaultMocks(mockProvider);
  });

  test('only the first of two concurrent requests succeeds when only one slot remains', async () => {
    User.findOneAndUpdate
      .mockResolvedValueOnce({ _id: 'user123' }) // first request wins the race
      .mockResolvedValueOnce(null);               // second is blocked (no headroom left)

    const [res1, res2] = [makeRes(), makeRes()];
    const body = { filename: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 };

    await Promise.all([
      initiateUpload(makeReq(body), res1),
      initiateUpload(makeReq(body), res2),
    ]);

    const statuses = [res1.status.mock.calls[0][0], res2.status.mock.calls[0][0]];
    expect(statuses).toContain(201);
    expect(statuses).toContain(409);
  });

  test('both concurrent requests succeed when quota allows both', async () => {
    User.findOneAndUpdate
      .mockResolvedValueOnce({ _id: 'user123' })
      .mockResolvedValueOnce({ _id: 'user123' });

    const [res1, res2] = [makeRes(), makeRes()];
    const body = { filename: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 512 };

    await Promise.all([
      initiateUpload(makeReq(body), res1),
      initiateUpload(makeReq(body), res2),
    ]);

    expect(res1.status.mock.calls[0][0]).toBe(201);
    expect(res2.status.mock.calls[0][0]).toBe(201);
  });

  test('releases storageReservedBytes when presigned URL generation throws', async () => {
    mockProvider.createPresignedPutUrl.mockRejectedValue(new Error('S3 unavailable'));
    const res = makeRes();
    await expect(
      initiateUpload(makeReq({ sizeBytes: 2048 }), res)
    ).rejects.toThrow('S3 unavailable');

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user123',
      expect.objectContaining({ $inc: { storageReservedBytes: -2048 } })
    );
  });

  test('does not release quota when request is rejected before reservation', async () => {
    // Rejected due to invalid MIME type — reservation never happens
    const res = makeRes();
    await initiateUpload(makeReq({ mimeType: 'application/zip', sizeBytes: 1024 }), res);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });
});

// ── Stale upload cleanup ──────────────────────────────────────────────────────

describe('Stale upload cleanup', () => {
  let mockProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProvider = makeMockProvider();
    getStorageProvider.mockReturnValue(mockProvider);
    User.findByIdAndUpdate.mockResolvedValue({});
  });

  function makeStaleObject(overrides = {}) {
    return {
      _id: 'stale-obj-1',
      owner: 'user123',
      objectKey: 'user123/stale.jpg',
      sizeBytes: 2048,
      uploadType: 'single',
      multipartUploadId: null,
      status: 'pending',
      reservedUntil: new Date(Date.now() - 1000), // already expired
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  test('does nothing when there are no stale uploads', async () => {
    StorageObject.find.mockResolvedValue([]);
    await cleanupStaleUploads();
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('releases storageReservedBytes (not storageUsedBytes) for each stale upload', async () => {
    const staleObj = makeStaleObject();
    StorageObject.find.mockResolvedValue([staleObj]);

    await cleanupStaleUploads();

    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user123',
      { $inc: { storageReservedBytes: -2048 } }
    );
    const [, update] = User.findByIdAndUpdate.mock.calls[0];
    expect(update.$inc.storageUsedBytes).toBeUndefined();
  });

  test('marks stale upload as failed with null reservedUntil', async () => {
    const staleObj = makeStaleObject();
    StorageObject.find.mockResolvedValue([staleObj]);

    await cleanupStaleUploads();

    expect(staleObj.status).toBe('failed');
    expect(staleObj.reservedUntil).toBeNull();
    expect(staleObj.save).toHaveBeenCalled();
  });

  test('calls provider.delete for single-upload stale records', async () => {
    StorageObject.find.mockResolvedValue([makeStaleObject({ uploadType: 'single' })]);
    await cleanupStaleUploads();
    expect(mockProvider.delete).toHaveBeenCalledWith('user123/stale.jpg');
  });

  test('calls abortMultipartUpload for multipart stale records', async () => {
    StorageObject.find.mockResolvedValue([
      makeStaleObject({ uploadType: 'multipart', multipartUploadId: 'mp-id-stale' }),
    ]);
    await cleanupStaleUploads();
    expect(mockProvider.abortMultipartUpload).toHaveBeenCalledWith(
      'user123/stale.jpg',
      'mp-id-stale'
    );
  });

  test('processes all stale records — one per distinct owner', async () => {
    const staleObjs = [
      makeStaleObject({ _id: 'stale-1', owner: 'user-a', sizeBytes: 1000 }),
      makeStaleObject({ _id: 'stale-2', owner: 'user-b', sizeBytes: 2000 }),
      makeStaleObject({ _id: 'stale-3', owner: 'user-a', sizeBytes: 500 }),
    ];
    StorageObject.find.mockResolvedValue(staleObjs);

    await cleanupStaleUploads();

    expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(3);
    expect(staleObjs.every((o) => o.status === 'failed')).toBe(true);
  });

  test('continues processing remaining records when one cleanup throws', async () => {
    const failingObj = makeStaleObject({
      _id: 'stale-fail',
      owner: 'user-x',
      save: jest.fn().mockRejectedValue(new Error('DB write error')),
    });
    const goodObj = makeStaleObject({ _id: 'stale-good', owner: 'user-y', sizeBytes: 200 });
    StorageObject.find.mockResolvedValue([failingObj, goodObj]);

    await expect(cleanupStaleUploads()).resolves.not.toThrow();
    expect(goodObj.status).toBe('failed');
  });

  test('still releases quota when Wasabi delete throws', async () => {
    mockProvider.delete.mockRejectedValue(new Error('S3 network error'));
    StorageObject.find.mockResolvedValue([makeStaleObject()]);

    await cleanupStaleUploads();

    // Quota released despite storage error
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      'user123',
      { $inc: { storageReservedBytes: -2048 } }
    );
  });
});
