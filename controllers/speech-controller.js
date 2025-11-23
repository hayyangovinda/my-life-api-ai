require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const { directory } = require("../middlewares/upload-middleware");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const model = "whisper-1";

const transcribeAudio = async (req, res) => {
  try {
    console.log("Transcribe audio request received");

    if (!req.file) {
      console.error("No file uploaded in request");
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log("File uploaded:", {
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    const filePath = path.join(directory, req.file.filename); // Path of the uploaded file
    let mp3FilePath = filePath; // Default to the original file

    // Check if the file is in MP3 format; if not, convert it
    if (path.extname(filePath).toLowerCase() !== ".mp3") {
      console.log("Converting non-MP3 file to MP3:", filePath);
      try {
        mp3FilePath = await convertToMP3(filePath);
        console.log("Conversion successful, MP3 file created:", mp3FilePath);
        fs.unlinkSync(filePath); // Clean up the original non-MP3 file
      } catch (conversionError) {
        console.error("FFmpeg conversion failed:", conversionError);
        // Clean up the original file
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        return res.status(500).json({
          error: "Audio conversion failed",
          details: conversionError.message
        });
      }
    }

    console.log("Preparing to send to OpenAI Whisper API");
    // Prepare form data
    const formData = new FormData();
    formData.append("model", model);
    formData.append("file", fs.createReadStream(mp3FilePath));

    // Send request to OpenAI API
    const response = await axios.post(
      "https://api.openai.com/v1/audio/transcriptions",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    console.log("OpenAI API response received successfully");

    // Clean up the MP3 file after processing
    fs.unlinkSync(mp3FilePath);

    // Send back the transcription result
    res.json({ transcript: response.data.text });
  } catch (error) {
    console.error(
      "Transcription error:",
      error.response ? error.response.data : error.message,
      error.stack
    );
    res.status(500).json({
      error: "Internal server error",
      details: error.message
    });
  }
};

const convertToMP3 = async (inputPath) => {
  const outputPath = inputPath.replace(path.extname(inputPath), ".mp3");

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat("mp3")
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .save(outputPath);
  });
};

module.exports = transcribeAudio;
