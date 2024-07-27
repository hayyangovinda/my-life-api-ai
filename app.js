require("dotenv").config();
require("express-async-errors");

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

const connectDB = require("./connect");

const authRouter = require("./routes/auth-route");
const authenticateUser = require("./middlewares/auth-middleware");
const userRouter = require("./routes/user-route");
const dayChatRouter = require("./routes/day-chat-route");
const aiRouter = require("./routes/ai-route");
const app = express();
const transcribeRouter = require("./routes/speech-route");

app.use(express.static("./public"));
app.use(express.json());

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("<h1>Welcome to My Life API</h1>");
});
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", authenticateUser, userRouter);
app.use("/api/v1/day-chat", authenticateUser, dayChatRouter);
app.use("/api/v1/ai", authenticateUser, aiRouter);
app.use("/api/v1/transcribe", transcribeRouter);

const PORT = process.env.PORT || 8000;

const start = async () => {
  try {
    await connectDB(process.env.MONGO_URI);
    app.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}`);
    });
  } catch (err) {
    console.log(err);
  }
};

start();
