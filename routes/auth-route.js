const express = require("express");

const router = express.Router();

const {
  register,
  login,
  sendVerificationEmail,
  verifyEmail,
  checkVerificationStatus,
  forgotPassword,
  resetPassword,
} = require("../controllers/auth-controller");

const authenticateUser = require("../middlewares/auth-middleware");

router.get("/verify-email", verifyEmail);
router.post("/send-email", authenticateUser, sendVerificationEmail);
router.post("/register", register);
router.post("/login", login);
router.post(
  "/check-verification-status",
  authenticateUser,
  checkVerificationStatus
);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
