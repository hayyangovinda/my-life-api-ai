const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    require: [true, "Please provide an email"],
    unique: true,
    match: [
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
      "Please provide a valid email",
    ],
  },

  password: {
    type: String,
    required: [true, "Please provide a password"],
    minlength: 6,
  },

  isVerified: {
    type: Boolean,
    default: false,
  },
  taskCompleted: { type: Number, default: 0 },
  name: { type: String, default: "" },

  // Encrypted encryption key for client-side media encryption
  // This key is encrypted with a password-derived key on the client
  encryptedEncryptionKey: {
    type: String,
    default: null,
  },

  // Passcode lock feature
  passcode: {
    type: String,
    default: null,
  },
  passcodeEnabled: {
    type: Boolean,
    default: false,
  },

  // Cloud storage plan and usage tracking
  storagePlanId: {
    type: String,
    default: 'free',
  },

  /**
   * Bytes confirmed as used by completed (status = 'uploaded') storage objects.
   * Updated atomically on upload completion and on file deletion.
   * Recalculated by the reconciliation endpoint when drift is detected.
   */
  storageUsedBytes: {
    type: Number,
    default: 0,
  },

  /**
   * Bytes reserved by in-progress (status = 'pending') uploads.
   * Incremented at upload-session creation; decremented on completion or cancellation.
   * Combined with storageUsedBytes for quota enforcement:
   *   storageUsedBytes + storageReservedBytes + newFileSize <= planLimit
   */
  storageReservedBytes: {
    type: Number,
    default: 0,
  },

  storageUsedBreakdown: {
    photos: { type: Number, default: 0 },
    videos: { type: Number, default: 0 },
    audio:  { type: Number, default: 0 },
    other:  { type: Number, default: 0 },
  },
  storageNextRenewalDate: {
    type: String,
    default: null,
  },
});

userSchema.pre("save", async function () {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.createJWT = function () {
  return jwt.sign({ userId: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_LIFETIME,
  });
};

userSchema.methods.comparePassword = async function (candidatePassword) {
  const isMatch = await bcrypt.compare(candidatePassword, this.password);
  return isMatch;
};

userSchema.methods.hashPasscode = async function (passcode) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(passcode, salt);
};

userSchema.methods.comparePasscode = async function (candidatePasscode) {
  if (!this.passcode) {
    return false;
  }
  const isMatch = await bcrypt.compare(candidatePasscode, this.passcode);
  return isMatch;
};

module.exports = mongoose.model("User", userSchema);
