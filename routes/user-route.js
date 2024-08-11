const express = require("express");

const router = express.Router();

const {
  getUserById,
  updateUser,
  deleteUser,
} = require("../controllers/user-controller");

router.get("/active-user", getUserById);

router.patch("/active-user", updateUser);

router.delete("/active-user", deleteUser);

module.exports = router;
