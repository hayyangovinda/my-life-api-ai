const express = require("express");
const router = express.Router();

const { transcribeAudio } = require("../controllers/speech-controller");

// Define the POST route for audio transcription
router.post("", transcribeAudio);

module.exports = router;
