const DayChat = require("../models/day-chat-model");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const { encrypt, decrypt } = require("../utils/crypto");

const getAllDayChats = async (req, res) => {
  const { start, end, sorted } = req.query;

  try {
    // Build the query object
    const query = {
      createdBy: req.user.userId,
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
  // Use UTC methods to ensure consistent timezone handling
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}T00:00:00.000Z`;
}

const uploadImage = async (req, res) => {
  try {
    if (!req.files || !req.files.image) {
      return res.status(400).json({ message: "No image file provided" });
    }

    // Upload as 'raw' resource type since files are encrypted
    // Cloudinary won't try to validate encrypted files as images
    const result = await cloudinary.uploader.upload(
      req.files.image.tempFilePath,
      {
        use_filename: true,
        folder: "file-upload",
        resource_type: "raw", // Important: treat as raw binary, not image
      }
    );
    fs.unlinkSync(req.files.image.tempFilePath);
    return res.status(200).json({ image: { src: result.secure_url } });
  } catch (err) {
    console.error("Error uploading image:", err);
    return res.status(500).json({ message: err.message });
  }
};

const uploadVideo = async (req, res) => {
  try {
    if (!req.files || !req.files.video) {
      return res.status(400).json({ message: "No video file provided" });
    }

    // Upload as 'raw' resource type since files are encrypted
    // Cloudinary won't try to validate encrypted files as videos
    const result = await cloudinary.uploader.upload(
      req.files.video.tempFilePath,
      {
        use_filename: true,
        folder: "file-upload",
        resource_type: "raw", // Important: treat as raw binary, not video
      }
    );
    fs.unlinkSync(req.files.video.tempFilePath);
    return res.status(200).json({ video: { src: result.secure_url } });
  } catch (err) {
    console.error("Error uploading video:", err);
    return res.status(500).json({ message: err.message });
  }
};

const searchDayChats = async (req, res) => {
  try {
    const { q, page = 1, limit = 10 } = req.query;

    if (!q || q.trim() === "") {
      return res.status(400).json({ message: "Search query is required" });
    }

    // Split query into individual words and create regex patterns for each
    const searchWords = q.trim().split(/\s+/);

    // Create regex patterns for each word (case-insensitive, partial match)
    const regexPatterns = searchWords.map(
      (word) => new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    );

    // Build query: each word must appear in at least one input.text or title
    const searchConditions = regexPatterns.map((regex) => ({
      $or: [{ "inputs.text": regex }, { title: regex }],
    }));

    const query = {
      createdBy: req.user.userId,
      $and: searchConditions, // All words must be present (in any order)
    };

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute search with pagination
    const [dayChats, totalCount] = await Promise.all([
      DayChat.find(query)
        .sort({ date: -1 }) // Most recent first
        .skip(skip)
        .limit(parseInt(limit)),
      DayChat.countDocuments(query),
    ]);

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

    res.status(200).json({
      results: decryptedChats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalResults: totalCount,
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        hasMore: skip + decryptedChats.length < totalCount,
      },
    });
  } catch (err) {
    console.error("Search error:", err);
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
  uploadImage,
  uploadVideo,
  searchDayChats,
};
