require("dotenv").config();
const { getStorageProvider } = require("./utils/storage-provider-factory");

async function main() {
  const provider = getStorageProvider();

  if (!provider.isConfigured) {
    console.error("Provider is not configured — check your .env file.");
    process.exit(1);
  }

  const key = `integration-test/${Date.now()}.txt`;
  const body = Buffer.from("wasabi integration test");

  console.log("Uploading test object...");
  await provider.upload(key, body, {
    contentType: "text/plain",
    contentLength: body.length,
  });

  console.log("Checking existence...");
  const exists = await provider.exists(key);
  if (!exists) throw new Error("Object not found after upload");

  console.log("Generating presigned URL...");
  const url = await provider.getSignedUrl(key, 60);
  console.log("Presigned URL:", url);

  console.log("Deleting test object...");
  await provider.delete(key);

  const stillExists = await provider.exists(key);
  if (stillExists) throw new Error("Object still exists after delete");

  console.log("\n✓ Wasabi integration test PASSED");
}

main().catch((err) => {
  console.error("\n✗ Wasabi integration test FAILED:", err.message);
  process.exit(1);
});
