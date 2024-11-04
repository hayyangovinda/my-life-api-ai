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
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = path.join(directory, req.file.filename); // Path of the uploaded file
    let mp3FilePath = filePath; // Default to the original file

    // Check if the file is in MP3 format; if not, convert it
    if (path.extname(filePath).toLowerCase() !== ".mp3") {
      mp3FilePath = await convertToMP3(filePath);
      fs.unlinkSync(filePath); // Clean up the original non-MP3 file
    }

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

    // Clean up the MP3 file after processing
    fs.unlinkSync(mp3FilePath);

    // Send back the transcription result
    res.json({ transcript: response.data.text });
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: "Internal server error" });
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
