const express = require("express");

const router = express.Router();

const { getUserById, updateUser } = require("../controllers/user-controller");

router.get("/active-user", getUserById);

router.patch("/active-user", updateUser);

module.exports = router;
