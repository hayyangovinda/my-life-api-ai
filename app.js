require("dotenv").config();
require("express-async-errors");

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const connectDB = require("./connect");
const app = express();

const authRouter = require("./routes/auth-route");
const authenticateUser = require("./middlewares/auth-middleware");
const userRouter = require("./routes/user-route");
const dayChatRouter = require("./routes/day-chat-route");
const aiRouter = require("./routes/ai-route");

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
