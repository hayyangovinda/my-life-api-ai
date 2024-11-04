const multer = require("multer");
const path = require("path");
const fs = require("fs");
const os = require("os");

// Set up the directory path
let directory = "";
if (process.env.NODE_ENV === "production") {
  // Use OS temp directory in production
  directory = path.join(os.tmpdir(), "uploads");
} else {
  // Use local uploads directory in development
  directory = path.join(__dirname, "uploads");
}

// Ensure the directory exists
if (!fs.existsSync(directory)) {
  fs.mkdirSync(directory, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, directory);
  },
  filename: (req, file, cb) => {
    // Add file extension to ensure proper file naming
    const extension = path.extname(file.originalname);
    cb(null, `${Date.now()}${extension}`);
  },
});

// Initialize multer with storage engine
const upload = multer({
  storage: storage,
  limits: { fileSize: 10000000 }, // Limit file size to 10MB
  fileFilter: (req, file, cb) => {
    const fileTypes = /wav|mp3|aiff|aac|flac/;
    const extname = fileTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    console.log("extname: ", extname);

    const mimeType = fileTypes.test(file.mimetype);

    if (mimeType && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Error: Audio files only!"));
    }
  },
});

// Export both the upload middleware and the directory path
module.exports = { upload, directory };
