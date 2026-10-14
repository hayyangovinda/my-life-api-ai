# Wasabi Object Storage — Configuration Guide

This document explains how to create a Wasabi bucket, generate access keys, configure
the application locally and on Railway, and verify that the integration is working.

> **Important:** The unit tests in `__tests__/wasabi-provider.test.js` use mocked AWS SDK
> calls and do NOT verify real connectivity.  You must follow the integration-test step
> at the bottom of this document to confirm that uploads, downloads, and deletes work
> against actual Wasabi infrastructure.

---

## 1. Create a Wasabi account and bucket

1. Sign up at <https://wasabi.com>.
2. In the Wasabi console, choose a region.
   Recommended: **us-east-1** (N. Virginia) — most reliable for presigned URLs.
3. Create a new bucket:
   - Give it a globally unique name (e.g. `mylife-media-prod`).
   - **Do NOT enable public access.** All objects are private.
   - Enable versioning if you want an extra safety net (optional).
4. Note the bucket name and region for the environment variables below.

---

## 2. Create access keys

1. In the Wasabi console, go to **Access Keys → Create New Access Key**.
2. Copy both the **Access Key ID** and the **Secret Access Key** — the secret is shown
   only once.
3. Optionally create a sub-user with limited permissions (recommended for production):
   - Required policy actions: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`,
     `s3:HeadObject`, `s3:ListBucket`.

---

## 3. Environment variables

| Variable                 | Description                                              | Example value                            |
|--------------------------|----------------------------------------------------------|------------------------------------------|
| `WASABI_ACCESS_KEY_ID`   | Access Key ID from Wasabi console                        | `AKIAIOSFODNN7EXAMPLE`                   |
| `WASABI_SECRET_ACCESS_KEY` | Secret Access Key from Wasabi console                  | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `WASABI_BUCKET`          | Exact bucket name                                        | `mylife-media-prod`                      |
| `WASABI_REGION`          | Wasabi region slug (must match the bucket's region)      | `us-east-1`                              |
| `WASABI_ENDPOINT`        | Full Wasabi endpoint URL for the chosen region           | `https://s3.us-east-1.wasabisys.com`     |

### Wasabi region → endpoint mapping

| Region slug    | Endpoint URL                                     |
|----------------|--------------------------------------------------|
| us-east-1      | `https://s3.us-east-1.wasabisys.com`             |
| us-east-2      | `https://s3.us-east-2.wasabisys.com`             |
| us-central-1   | `https://s3.us-central-1.wasabisys.com`          |
| us-west-1      | `https://s3.us-west-1.wasabisys.com`             |
| eu-central-1   | `https://s3.eu-central-1.wasabisys.com`          |
| eu-west-1      | `https://s3.eu-west-1.wasabisys.com`             |
| ap-northeast-1 | `https://s3.ap-northeast-1.wasabisys.com`        |
| ap-southeast-2 | `https://s3.ap-southeast-2.wasabisys.com`        |

> **Note:** Avoid `us-east-2` and `us-central-1` if you plan to use presigned URLs —
> these regions have a known Wasabi bug with SigV4 presigned URL generation.

---

## 4. Local development setup

Add the variables to your `.env` file (this file is git-ignored and never committed):

```dotenv
# Wasabi object storage (optional — server starts without it)
WASABI_ACCESS_KEY_ID=your_access_key_id_here
WASABI_SECRET_ACCESS_KEY=your_secret_access_key_here
WASABI_BUCKET=your-bucket-name
WASABI_REGION=us-east-1
WASABI_ENDPOINT=https://s3.us-east-1.wasabisys.com
```

Start the server (`npm run dev`) and look for one of these log lines:

```
[storage] Wasabi configuration found. Provider will initialise on first use.
```

or, if variables are missing:

```
[storage] Wasabi object storage is NOT configured — missing env var(s): ...
```

The second message lists the names of missing variables — never their values.

---

## 5. Railway (production) setup

1. Open your Railway service dashboard.
2. Navigate to **Variables**.
3. Add each of the five variables from the table above as service-level variables.
4. Redeploy.  The startup log will confirm configuration status.

> **Security:** Railway service variables are encrypted at rest and are never
> included in the Docker image build context.

---

## 6. Running the unit tests

The unit tests mock all AWS SDK calls and do not require credentials:

```bash
cd my-life-api-ai
npm test
```

Expected output includes a `wasabi-provider.test.js` suite that passes entirely
without making any network requests.

---

## 7. Running an integration test

Once credentials and bucket are configured, run the following one-off script to
verify real connectivity.  Create the file locally, run it once, then delete it —
**do not commit it**:

```javascript
// test-wasabi-integration.js  (DO NOT COMMIT)
require('dotenv').config();
const { getStorageProvider } = require('./utils/storage-provider-factory');

async function main() {
  const provider = getStorageProvider();

  if (!provider.isConfigured) {
    console.error('Provider is not configured — check your .env file.');
    process.exit(1);
  }

  const key = `integration-test/${Date.now()}.txt`;
  const body = Buffer.from('wasabi integration test');

  console.log('Uploading test object...');
  await provider.upload(key, body, { contentType: 'text/plain', contentLength: body.length });

  console.log('Checking existence...');
  const exists = await provider.exists(key);
  if (!exists) throw new Error('Object not found after upload');

  console.log('Generating presigned URL...');
  const url = await provider.getSignedUrl(key, 60);
  console.log('Presigned URL:', url);

  console.log('Deleting test object...');
  await provider.delete(key);

  const stillExists = await provider.exists(key);
  if (stillExists) throw new Error('Object still exists after delete');

  console.log('\n✓ Wasabi integration test PASSED');
}

main().catch((err) => {
  console.error('\n✗ Wasabi integration test FAILED:', err.message);
  process.exit(1);
});
```

Run it with:

```bash
node test-wasabi-integration.js
```

Only after this script prints `✓ Wasabi integration test PASSED` can Wasabi be
considered connected and working for this deployment.

---

## 8. Security checklist

- [ ] Bucket has **no public access** enabled
- [ ] Access key is scoped to the minimum required S3 permissions
- [ ] `WASABI_SECRET_ACCESS_KEY` is stored only in `.env` (locally) or Railway variables (production) — never committed to git
- [ ] `.env` is listed in `.gitignore`
- [ ] Server startup log shows variable names only, never values
