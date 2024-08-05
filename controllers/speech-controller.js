const speech = require("@google-cloud/speech");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");

ffmpeg.setFfmpegPath(ffmpegPath);
// Creates a client
const client = new speech.SpeechClient();

// const transcribeAudio = async (req, res) => {
//   try {
//     // Check if a file is provided
//     // if (!req.file) {
//     //   return res.status(400).json({ error: "No file uploaded" });
//     // }

//     // // The path to the uploaded file
//     // const filePath = req.file.path;

//     const audiostring = req.body.audio;

//     console.log(audiostring);

//     // Read the file content
//     // const audioBytes = fs.readFileSync(filePath).toString("base64");

//     // The audio file's encoding, sample rate in hertz, and BCP-47 language code
//     const audio = {
//       content: audiostring,
//     };
//     const config = {
//       encoding: "LINEAR16",
//       languageCode: "en-US",
//     };
//     const request = {
//       audio: audio,
//       config: config,
//     };

//     // Detects speech in the audio file
//     const [response] = await client.recognize(request);
//     const transcription = response.results
//       .map((result) => result.alternatives[0].transcript)
//       .join("\n");

//     // Remove the uploaded file after processing
//     // fs.unlinkSync(filePath);

//     // Send the transcription response
//     res.json({ transcription });
//   } catch (err) {
//     console.error("Error:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// };

const convertTo16BitWav = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions(["-acodec pcm_s16le", "-ar 16000"])
      .on("end", () => {
        resolve(outputPath);
      })
      .on("error", (err) => {
        reject(err);
      })
      .save(outputPath);
  });
};

const transcribeAudio = async (req, res) => {
  try {
    // Check if a file is provided
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // The path to the uploaded file

    // const model = "chirp";
    // const location = "us-central1";
    // const projectId = "my-life-api-431607";
    // const filePath = req.file.path;
    const inputFilePath = req.file.path;
    const uploadsDir = path.join(__dirname, "../uploads");
    const outputFilePath = path.join(uploadsDir, "converted_audio.wav");

    await convertTo16BitWav(inputFilePath, outputFilePath);
    // Read the file content
    const audioBytes = fs.readFileSync(outputFilePath).toString("base64");

    // The audio file's encoding, sample rate in hertz, and BCP-47 language code
    const audio = {
      content: audioBytes,
    };

    // const requestBody = {
    //   config: {
    //     language_codes: ["en-US"],
    //     model: "chirp",
    //   },
    //   content: audioBytes,
    // };

    // const gcsUri = "gs://cloud-samples-data/speech/brooklyn_bridge.raw";

    // // The audio file's encoding, sample rate in hertz, and BCP-47 language code
    // const audio = {
    //   uri: gcsUri,
    // };
    const config = {
      encoding: "LINEAR16",
      languageCode: "en-US",
      model: "default",
      audioChannelCount: 1,
      enableWordConfidence: true,
      enableWordTimeOffsets: true,
    };

    const request = {
      config: config,
      audio: audio,
    };

    // Detects speech in the audio file
    // const [response] = await client.recognize(request);
    // const transcription = response.results
    //   .map((result) => result.alternatives[0].transcript)
    //   .join("\n");

    // // Remove the uploaded file after processing
    // fs.unlinkSync(filePath);

    const [operation] = await client.longRunningRecognize(request);
    console.log("Waiting for operation to complete...");
    const [response] = await operation.promise();

    const transcripts = response.results.map(
      (result) => result.alternatives[0].transcript
    );

    res.send({ transcripts });

    // Send the transcription response
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
module.exports = {
  transcribeAudio,
};
