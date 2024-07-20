const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload-middleware");
const { transcribeAudio } = require("../controllers/speech-controller");

// Define the POST route for audio transcription
router.post("", upload.single("audio"), transcribeAudio);

module.exports = router;
