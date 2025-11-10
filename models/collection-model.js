const mongoose = require("mongoose");

const collectionSchema = new mongoose.Schema({
  icon: String,
  name: String,
  description: String,
  isDefault: {
    type: Boolean,
    default: false,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});

module.exports = mongoose.model("Collection", collectionSchema);
