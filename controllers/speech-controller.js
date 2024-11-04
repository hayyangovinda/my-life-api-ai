require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
const { directory } = require("../middlewares/upload-middleware");
const path = require("path");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const model = "whisper-1";

const transcribeAudio = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = path.join(directory, req.file.filename); // Path of the uploaded file

    // Prepare form data
    const formData = new FormData();
    formData.append("model", model);
    formData.append("file", fs.createReadStream(filePath));

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

    // Clean up uploaded file after processing
    fs.unlinkSync(filePath);

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

module.exports = transcribeAudio;
