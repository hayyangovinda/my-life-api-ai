const express = require("express");

const router = express.Router();

const {
  getUserById,
  updateUser,
  deleteUser,
  getEncryptedKey,
  setEncryptedKey,
} = require("../controllers/user-controller");

router.get("/active-user", getUserById);

router.patch("/active-user", updateUser);

router.delete("/active-user", deleteUser);

// Routes for encrypted encryption key management
router.get("/encryption-key", getEncryptedKey);
router.post("/encryption-key", setEncryptedKey);

module.exports = router;
