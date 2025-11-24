const mongoose = require("mongoose");

const dayChatSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: [true, "Date is required"],
  },
  inputs: [
    {
      text: {
        type: String,
        required: true,
      },
      type: {
        type: String,
        required: true,
      },

      image: String,
      video: String,
      imageType: String, // MIME type of original image (for decryption)
      videoType: String, // MIME type of original video (for decryption)
    },
  ],
  story: {
    iv: String,
    encryptedData: String,
    authTag: String,
  },
  title: {
    type: String,
    default: "",
  },
  collections: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Collection",
    },
  ],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "User is required"],
  },
});

// Create text index for search functionality
// This indexes the text field within the inputs array and the title field
dayChatSchema.index({ "inputs.text": "text", title: "text" });

// Create unique compound index to prevent duplicate entries for same date and user
dayChatSchema.index({ date: 1, createdBy: 1 }, { unique: true });

module.exports = mongoose.model("DayChat", dayChatSchema);
