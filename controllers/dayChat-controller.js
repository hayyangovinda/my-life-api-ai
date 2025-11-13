const DayChat = require("../models/day-chat-model");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const { encrypt, decrypt } = require("../utils/crypto");

const getAllDayChats = async (req, res) => {
  const today = new Date();
  const formattedToday = formatDateToStartOfDayUTC(today);

  const { start, end, sorted } = req.query;

  try {
    // Build the query object
    const query = {
      createdBy: req.user.userId,
      date: { $lt: formattedToday }, // Exclude today's chats
    };

    // Add date range to the query if provided
    if (start && end) {
      query.date = {
        $gte: new Date(start),
        $lte: new Date(end),
      };
    }

    // Determine sort order
    const sortOrder = sorted ? 1 : -1;

    const dayChats = await DayChat.find(query).sort({ date: sortOrder });

    // Decrypt stories before returning
    const decryptedChats = dayChats.map((chat) => {
      const chatObj = chat.toObject();
      const story = chatObj.story;

      if (story && story.encryptedData) {
        try {
          chatObj.story = decrypt(story);
        } catch (err) {
          console.error(`Error decrypting story for chat ${chatObj._id}:`, err);
          chatObj.story = "[Error decrypting story]";
        }
      } else {
        chatObj.story = "";
      }

      return chatObj;
    });

    res.status(200).json(decryptedChats);
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
    const dayChatDoc = await DayChat.findOne({
      _id: req.params.id,
      createdBy: req.user.userId,
    });

    if (!dayChatDoc) {
      return res.status(404).json({ message: "DayChat not found" });
    }

    const story = dayChatDoc.story;
    let plainStory = story;

    if (story && story.encryptedData) {
      try {
        plainStory = decrypt(story);
        console.log("plainStory: ", plainStory);
      } catch (err) {
        console.error(
          `Error decrypting story for chat ${dayChatDoc._id}:`,
          err
        );
        plainStory = "[Error decrypting story]";
      }
    } else {
      plainStory = "";
    }

    // Convert to plain object so we can modify fields
    const dayChat = dayChatDoc.toObject();
    dayChat.story = plainStory;

    res.status(200).json(dayChat);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

const updateDayChat = async (req, res) => {
  try {
    const updatedData = req.body;

    if (updatedData.story) {
      const encryptedStory = encrypt(req.body.story);
      updatedData.story = encryptedStory;
    }

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

function formatDateToStartOfDayUTC(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}T00:00:00.000Z`;
}

const uploadImage = async (req, res) => {
  const result = await cloudinary.uploader.upload(
    req.files.image.tempFilePath,
    {
      use_filename: true,
      folder: "file-upload",
    }
  );
  fs.unlinkSync(req.files.image.tempFilePath);
  return res.status(200).json({ image: { src: result.secure_url } });
};

const uploadVideo = async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(
      req.files.video.tempFilePath,
      {
        use_filename: true,
        folder: "file-upload",
        resource_type: "video",
      }
    );
    fs.unlinkSync(req.files.video.tempFilePath);
    return res.status(200).json({ video: { src: result.secure_url } });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getAllDayChats,
  createDayChat,
  getDayChat,
  updateDayChat,
  deleteDayChat,
  getDayChatByDate,
  uploadImage,
  uploadVideo,
};
