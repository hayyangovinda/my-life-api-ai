const speech = require("@google-cloud/speech");
const fs = require("fs");

// Creates a client
const client = new speech.SpeechClient();

const transcribeAudio = async (req, res) => {
  try {
    // Check if a file is provided
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // The URL of the uploaded file on Cloudinary
    const fileUrl = req.file.path;

    // Download the file from Cloudinary to a local temporary file
    const localFilePath = `/tmp/${Date.now()}-${req.file.originalname}`;
    const downloadStream = cloudinary.uploader.download(fileUrl, localFilePath);

    downloadStream.on("end", async () => {
      // Read the file content
      const audioBytes = fs.readFileSync(localFilePath).toString("base64");

      // The audio file's encoding, sample rate in hertz, and BCP-47 language code
      const audio = {
        content: audioBytes,
      };
      const config = {
        encoding: "LINEAR16",
        languageCode: "en-US",
      };
      const request = {
        audio: audio,
        config: config,
      };

      // Detects speech in the audio file
      const [response] = await client.recognize(request);
      const transcription = response.results
        .map((result) => result.alternatives[0].transcript)
        .join("\n");

      // Remove the local temporary file after processing
      fs.unlinkSync(localFilePath);

      // Send the transcription response
      res.json({ transcription });
    });

    downloadStream.on("error", (error) => {
      console.error("Error downloading file:", error);
      res.status(500).json({ error: "Internal server error" });
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  transcribeAudio,
};
