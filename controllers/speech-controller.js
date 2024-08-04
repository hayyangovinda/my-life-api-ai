const speech = require("@google-cloud/speech");
const fs = require("fs");

// Creates a client
const client = new speech.SpeechClient();

const transcribeAudio = async (req, res) => {
  try {
    // Check if a file is provided
    // if (!req.file) {
    //   return res.status(400).json({ error: "No file uploaded" });
    // }

    // // The path to the uploaded file
    // const filePath = req.file.path;

    const audiostring = req.body.audio;
    const wavBase64 = await convertAudioToWav(audiostring);

    console.log(audiostring);

    // Read the file content
    // const audioBytes = fs.readFileSync(filePath).toString("base64");

    // The audio file's encoding, sample rate in hertz, and BCP-47 language code
    const audio = {
      content: wavBase64,
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

    // Remove the uploaded file after processing
    // fs.unlinkSync(filePath);

    // Send the transcription response
    res.json({ transcription });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

async function convertAudioToWav(base64UrlAudio) {
  // Decode base64url string to array buffer
  const base64Audio = base64UrlAudio.replace(/_/g, "/").replace(/-/g, "+");
  const binaryString = atob(base64Audio);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const audioBuffer = await new AudioContext().decodeAudioData(bytes.buffer);

  // Create WAV file header
  const numOfChan = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numOfChan * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + audioBuffer.length * blockAlign);
  const view = new DataView(wavBuffer);

  // RIFF chunk descriptor
  this.writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + audioBuffer.length * blockAlign, true);
  this.writeString(view, 8, "WAVE");

  // FMT sub-chunk
  this.writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);

  // Data sub-chunk
  this.writeString(view, 36, "data");
  view.setUint32(40, audioBuffer.length * blockAlign, true);

  // Write interleaved PCM samples
  const channels = [];
  for (let i = 0; i < numOfChan; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }
  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let j = 0; j < numOfChan; j++) {
      const sample = Math.max(-1, Math.min(1, channels[j][i]));
      view.setInt16(
        offset,
        sample < 0 ? sample * 0x8000 : sample * 0x7fff,
        true
      );
      offset += bytesPerSample;
    }
  }

  const base64Wav = this.arrayBufferToBase64Url(wavBuffer);
  return base64Wav;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\//g, "_").replace(/\+/g, "-");
}

module.exports = {
  transcribeAudio,
};
