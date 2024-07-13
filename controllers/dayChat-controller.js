const DayChat = require("../models/day-chat-model");

const getAllDayChats = async (req, res) => {
  try {
    const dayChats = await DayChat.find({
      createdBy: req.user.userId,
    });
    res.status(200).json(dayChats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createDayChat = async (req, res) => {
  try {
    const dayChat = new DayChat({
      date: req.body.date,
      inputs: req.body.inputs,
      createdBy: req.user.userId,
    });
    await dayChat.save();
    res.status(201).json(dayChat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

getDayChatByDate = async (req, res) => {
  console.log("adadsadadasasdsa");
  try {
    const dayChat = await DayChat.find({
      date: req.query.date,
      createdBy: req.user.userId,
    });
    res.status(200).json(dayChat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getDayChat = async (req, res) => {
  try {
    const dayChat = await DayChat.find({
      _id: req.params.id,
      createdBy: req.user.userId,
    });
    res.status(200).json(dayChat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateDayChat = async (req, res) => {
  try {
    const updatedData = req.body;

    const dayChat = await DayChat.findOneAndUpdate(
      {
        _id: req.params.id,
        createdBy: req.user.userId,
      },
      {
        $set: updatedData,
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!dayChat) {
      return res.status(404).json({ message: "DayChat not found" });
    }

    res.status(200).json(dayChat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const deleteDayChat = async (req, res) => {
  try {
    const dayChat = await DayChat.findOneAndDelete({
      _id: req.params.id,
      createdBy: req.user.userId,
    });
    res.status(200).json(dayChat);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getAllDayChats,
  createDayChat,
  getDayChat,
  updateDayChat,
  deleteDayChat,
  getDayChatByDate,
};
