const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  icon: String,
  name: String,
  description: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});

module.exports = mongoose.model("Group", groupSchema);
