// utils/crypto.js
const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const KEY = Buffer.from(process.env.STORY_ENCRYPTION_KEY); // 32 bytes

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return { iv: iv.toString("hex"), encryptedData: encrypted, authTag };
}

function decrypt(encryptedObj) {
  console.log("encryptedObj: ", encryptedObj);
  const { iv, encryptedData, authTag } = encryptedObj;
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    KEY,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

module.exports = { encrypt, decrypt };
