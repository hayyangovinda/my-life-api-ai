const express = require("express");
const router = express.Router();
const { getGeminiResponse } = require("../controllers/gemini-controller");
const authenticateUser = require("../middlewares/auth-middleware");

router.post("", authenticateUser, getGeminiResponse);
module.exports = router;
