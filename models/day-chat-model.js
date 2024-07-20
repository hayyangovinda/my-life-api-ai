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
    },
  ],
  story: {
    type: String,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "User is required"],
  },
});

module.exports = mongoose.model("DayChat", dayChatSchema);
