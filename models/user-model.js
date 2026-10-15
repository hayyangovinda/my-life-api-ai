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
    required: false,
    minlength: 6,
  },

  googleId: {
    type: String,
    default: null,
    sparse: true,
  },

  authProvider: {
    type: String,
    enum: ['email', 'google'],
    default: 'email',
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

  // ── Subscription state (set only by server-side webhook processing) ────────
  //
  // Clients cannot alter these fields directly.  Plan entitlements are granted
  // only after RevenueCat validates the purchase with the relevant store.

  /**
   * RevenueCat subscription status.
   * null   = free plan (no active subscription)
   * active = subscription is paid and current
   * cancelled = subscription cancelled by user; access until subscriptionExpiresAt
   * in_grace_period = payment failed but within store grace period
   * billing_retry = RevenueCat is retrying a failed payment
   * expired = subscription has lapsed; access revoked
   */
  subscriptionStatus: {
    type: String,
    enum: ['active', 'cancelled', 'in_grace_period', 'billing_retry', 'expired', null],
    default: null,
  },

  /** 'ios' | 'android' | 'web' | null */
  subscriptionPlatform: {
    type: String,
    enum: ['ios', 'android', 'web', null],
    default: null,
  },

  /** Store product identifier, e.g. 'mylife_premium_monthly'. */
  subscriptionProductId: {
    type: String,
    default: null,
  },

  /**
   * Date when the current billing period ends.
   * The plan remains active until this date even after cancellation.
   * Null for free plans or lifetime subscriptions.
   */
  subscriptionExpiresAt: {
    type: Date,
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
