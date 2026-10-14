# Wasabi Media Upload API

All endpoints are under `/api/v1/media/` and require a valid JWT in the
`Authorization: Bearer <token>` header (enforced by `auth-middleware.js`).

---

## Overview

The upload flow uses presigned URLs so encrypted media travels directly from the
client to Wasabi — the backend never buffers the file body.

```
Client                          Backend                     Wasabi
  │                               │                           │
  │ POST /upload-session          │                           │
  │ {filename, mimeType,sizeBytes}│                           │
  │──────────────────────────────►│                           │
  │                               │  reserve quota (atomic)   │
  │                               │  generate presigned URL   │
  │◄──────────────────────────────│                           │
  │ {objectId, presignedUrl, …}   │                           │
  │                               │                           │
  │  PUT encrypted blob           │                           │
  │──────────────────────────────────────────────────────────►│
  │                               │                           │
  │ POST /:objectId/complete      │                           │
  │──────────────────────────────►│                           │
  │                               │  HeadObject (verify)      │
  │                               │──────────────────────────►│
  │                               │◄──────────────────────────│
  │◄──────────────────────────────│                           │
  │ 200 OK                        │                           │
```

---

## Endpoints

### POST `/api/v1/media/upload-session`

Validate the file metadata, atomically reserve the user's storage quota, and
return presigned upload URL(s).

**Request body**

| Field      | Type   | Required | Description                                      |
|------------|--------|----------|--------------------------------------------------|
| `filename` | string | ✓        | Original filename (display only, never used as a key) |
| `mimeType` | string | ✓        | Original MIME type (e.g. `image/jpeg`, `video/mp4`). Must be in the allowed-type list. Used for quota category. |
| `sizeBytes`| number | ✓        | Byte count of the **encrypted** file that will be uploaded. Must be a positive integer ≤ 209 715 200 (200 MB). |

**Allowed MIME types**

- Photos: `image/jpeg`, `image/jpg`, `image/png`, `image/gif`, `image/webp`, `image/heic`, `image/heif`
- Videos: `video/mp4`, `video/quicktime`, `video/webm`, `video/x-msvideo`
- Audio: `audio/mpeg`, `audio/mp4`, `audio/x-m4a`, `audio/wav`, `audio/x-wav`, `audio/ogg`, `audio/webm`, `audio/flac`, `audio/aac`

**Response — single upload (< 50 MB)**

```json
{
  "objectId":    "64f3a1b2c3d4e5f6a7b8c9d0",
  "uploadType":  "single",
  "presignedUrl":"https://s3.us-east-1.wasabisys.com/bucket/userId/uuid.jpg?X-Amz-…",
  "expiresAt":   "2026-10-14T11:00:00.000Z"
}
```

**Response — multipart upload (≥ 50 MB)**

```json
{
  "objectId":         "64f3a1b2c3d4e5f6a7b8c9d0",
  "uploadType":       "multipart",
  "multipartUploadId":"abcdef1234567890",
  "parts": [
    { "partNumber": 1, "presignedUrl": "https://…", "maxBytes": 10485760 },
    { "partNumber": 2, "presignedUrl": "https://…", "maxBytes": 10485760 },
    { "partNumber": 3, "presignedUrl": "https://…", "maxBytes": 4194304  }
  ],
  "expiresAt": "2026-10-14T11:00:00.000Z"
}
```

**Error responses**

| Status | Condition |
|--------|-----------|
| 400    | Missing field, or `sizeBytes` is not a positive integer |
| 404    | Authenticated user not found in the database |
| 409    | Storage quota would be exceeded |
| 413    | File exceeds 200 MB |
| 415    | MIME type is not in the allowed list |
| 503    | Wasabi credentials not configured on the server |

---

### PUT (direct to Wasabi)

The client PUTs the **encrypted** file bytes directly to the `presignedUrl`
returned above. The backend is not involved in this step.

**Important headers**

- `Content-Type`: must match the `mimeType` passed to `/upload-session` (the
  value is baked into the SigV4 signature).

For multipart uploads, upload each part blob to its corresponding `presignedUrl`
using any Content-Type (`application/octet-stream` is fine for parts).

---

### POST `/api/v1/media/:objectId/complete`

Notify the backend that the upload is done. The server independently verifies
the object in Wasabi via `HeadObject` before marking it uploaded. For multipart
uploads the server calls `ListParts` to collect ETags — the client does not need
to pass them.

**Path parameter**: `objectId` — the value returned by `/upload-session`.

**Request body**: empty `{}`.

**Success response (200)**

```json
{
  "objectId": "64f3a1b2c3d4e5f6a7b8c9d0",
  "message":  "Upload completed successfully",
  "objectKey":"userId/uuid.jpg"
}
```

Calling this endpoint again on an already-completed object returns 200
(idempotent).

**Error responses**

| Status | Condition |
|--------|-----------|
| 403    | Requesting user does not own this upload session |
| 404    | No upload session with this `objectId` |
| 409    | Session status is neither `pending` nor `uploaded` (e.g. already `failed`) |
| 422    | Object not found in Wasabi, or zero-byte object; quota released automatically |

---

### POST `/api/v1/media/:objectId/cancel`

Abort a pending upload, clean up any partial multipart data from Wasabi, and
release the reserved storage quota.

**Request body**: empty.

**Success response (200)**

```json
{ "message": "Upload cancelled" }
```

Calling this on an already-cancelled/failed session returns 200 (idempotent).

**Error responses**

| Status | Condition |
|--------|-----------|
| 403    | Wrong owner |
| 404    | Session not found |
| 409    | Cannot cancel an `uploaded` object |

---

### GET `/api/v1/media/:objectId/signed-url`

Generate a short-lived presigned GET URL for a completed upload.  The URL is
safe to hand to the client — it carries a temporary signature, not credentials.

**Success response (200)**

```json
{
  "url":       "https://s3.us-east-1.wasabisys.com/bucket/userId/uuid.jpg?X-Amz-…",
  "expiresAt": "2026-10-14T11:00:00.000Z"
}
```

**Error responses**

| Status | Condition |
|--------|-----------|
| 403    | Wrong owner |
| 404    | Session not found, or object status is not `uploaded` |

---

## Quota enforcement

Quota is reserved **atomically** during `/upload-session` using a MongoDB
`findOneAndUpdate` with a `$expr` condition:

```
storageUsedBytes + newFileSize ≤ planLimit
```

If the condition fails the operation returns `null` and the endpoint responds
with HTTP 409. This prevents concurrent uploads from over-booking the user's
allowance even under high concurrency.

On upload completion, the per-category breakdown
(`storageUsedBreakdown.photos/videos/audio/other`) is incremented.

On cancellation or failed verification, the reserved bytes are decremented
immediately.

---

## Stale upload cleanup

Any upload session still in `pending` status after 2 hours (past its
`reservedUntil` timestamp) is cleaned up automatically on server startup:

1. Multipart uploads are aborted in Wasabi.
2. Single-PUT objects are deleted from Wasabi.
3. Reserved quota is released.
4. Session is marked `failed`.

This handles client crashes, expired presigned URLs, and interrupted uploads.

---

## Storage object lifecycle

```
pending ──► uploaded
   │
   └──► failed  (cancelled, verification failure, or stale cleanup)
            │
            └──► (future) deleted
```

---

## Encryption architecture

All media is **client-side encrypted** before reaching Wasabi:

1. On login, the client derives a Password-Derived Key (PDK) from the user's
   password via PBKDF2 (100 000 iterations, SHA-256).
2. A random Media Encryption Key (MEK) is generated with AES-256-GCM.
3. The MEK is encrypted with the PDK and stored on the server
   (`User.encryptedEncryptionKey`). The PDK never leaves the client.
4. Each media file is encrypted with the MEK before upload. The result is:
   `IV (12 bytes) ‖ ciphertext ‖ GCM auth-tag (16 bytes)`.
5. The original MIME type is stored alongside the object reference in the
   `DayChat.inputs[]` array (`imageType` / `videoType`) so the client can
   supply the correct type when decrypting for display.

The backend cannot decrypt media files. Even a database or Wasabi compromise
does not expose user media without the account password.

---

## Client storage reference format

After a successful upload the client stores the Wasabi `objectId`
(a 24-char MongoDB ObjectId hex string) in the `DayChat.inputs[].image` or
`.video` field.

Legacy entries contain a Cloudinary HTTPS URL in the same field. The frontend
distinguishes them:

- Value starts with `http` → legacy Cloudinary URL, fetch directly.
- Value does **not** start with `http` → Wasabi objectId, call
  `GET /api/v1/media/:objectId/signed-url` first.

---

## Required Wasabi environment variables

```
WASABI_ACCESS_KEY_ID      Wasabi IAM access key ID
WASABI_SECRET_ACCESS_KEY  Wasabi IAM secret access key
WASABI_BUCKET             Bucket name
WASABI_REGION             Region slug  (e.g. us-east-1)
WASABI_ENDPOINT           Full endpoint URL (e.g. https://s3.us-east-1.wasabisys.com)
```

The bucket must have CORS configured to allow `PUT` and `GET` requests from the
app's origin. See `WASABI_SETUP.md` for bucket policy and CORS details.

---

## Running the tests

```bash
cd my-life-api-ai
npm test
```

Tests cover: quota enforcement, ownership checks, duplicate completion requests,
expired/aborted multipart uploads, successful single and multipart flows,
signed-URL generation, and storage provider configuration validation.
