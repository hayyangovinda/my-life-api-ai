const DayChat = require("../models/day-chat-model");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");

const getAllDayChats = async (req, res) => {
  const today = new Date();
  const formattedToday = formatDateToStartOfDayUTC(today);

  const sorted = req.query.sorted;

  try {
    if (!sorted) {
      const dayChats = await DayChat.find({
        createdBy: req.user.userId,
        date: { $lt: formattedToday },
      }).sort({ date: -1 });
      res.status(200).json(dayChats);
    } else {
      const dayChats = await DayChat.find({
        createdBy: req.user.userId,
        date: { $lt: formattedToday },
      }).sort({ date: 1 });
      res.status(200).json(dayChats);
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// const getAllDayChats = async (req, res) => {
//   const today = new Date();
//   const formattedToday = formatDateToStartOfDayUTC(today);

//   const { start, end, sorted } = req.query;

//   try {
//     // Build the query object
//     const query = {
//       createdBy: req.user.userId,
//       date: { $lt: today }, // Exclude today's chats
//     };

//     // Add date range to the query if provided
//     if (start && end) {
//       query.date.$gte = new Date(start);
//       if (end === formattedToday) {
//         query.date.$lt = new Date(end);
//       } else {
//         query.date.$lte = new Date(end); // Change $lte to $lt to exclude end date
//       }
//     }

//     // Determine sort order
//     const sortOrder = sorted ? 1 : -1;

//     const dayChats = await DayChat.find(query).sort({ date: sortOrder });
//     res.status(200).json(dayChats);
//   } catch (err) {
//     res.status(500).json({ message: err.message });
//   }
// };

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

module.exports = {
  getAllDayChats,
  createDayChat,
  getDayChat,
  updateDayChat,
  deleteDayChat,
  getDayChatByDate,
  uploadImage,
};
