const express = require("express");

const router = express.Router();

const {
  getUserById,
  updateUser,
  deleteUser,
  getEncryptedKey,
  setEncryptedKey,
  setPasscode,
  verifyPasscode,
  togglePasscode,
  getPasscodeStatus,
} = require("../controllers/user-controller");

router.get("/active-user", getUserById);

router.patch("/active-user", updateUser);

router.delete("/active-user", deleteUser);

// Routes for encrypted encryption key management
router.get("/encryption-key", getEncryptedKey);
router.post("/encryption-key", setEncryptedKey);

// Routes for passcode management
router.get("/passcode/status", getPasscodeStatus);
router.post("/passcode/set", setPasscode);
router.post("/passcode/verify", verifyPasscode);
router.post("/passcode/toggle", togglePasscode);

module.exports = router;
