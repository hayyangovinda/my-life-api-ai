const multer = require("multer");
const path = require("path");

let directory = "";
// Set up storage engine
if (process.env.NODE_ENV === "production") {
  directory = "tmp/";
} else {
  directory = "uploads/";
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Directory to store uploaded files
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

// Initialize multer with storage engine
const upload = multer({
  storage: storage,
  limits: { fileSize: 10000000 }, // Limit file size to 10MB
  fileFilter: (req, file, cb) => {
    const fileTypes = /wav|mp3|aiff|aac|flac/; // Allowed file types
    const extname = fileTypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    const mimeType = fileTypes.test(file.mimetype);

    if (mimeType && extname) {
      return cb(null, true);
    } else {
      cb("Error: Audio files only!");
    }
  },
});

module.exports = upload;
