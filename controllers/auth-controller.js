const User = require("../models/user-model");
const Collection = require("../models/collection-model");
const jwt = require("jsonwebtoken");
const { sendVerificationEmail: sendVerificationEmailService, sendPasswordResetEmail: sendPasswordResetEmailService } = require("../utils/email-service");

const register = async (req, res) => {
  try {
    const user = await User.create({ ...req.body });

    // Create default Favorites collection for the new user
    await Collection.create({
      name: "Favorites",
      description: "Your favorite memories",
      icon: "⭐",
      isDefault: true,
      createdBy: user._id,
    });

    const token = user.createJWT();
    res.status(201).json({ token, userId: user._id });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email already exists" });
    }
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(401).json({ error: "Please provide email and password" });
  }
  const allUsers = await User.find();

  const user = await User.findOne({ email });

  if (!user) {
    return res.status(401).json({ error: "User does not exist" });
  }

  const isPasswordCorrect = await user.comparePassword(password);

  if (!isPasswordCorrect) {
    return res.status(401).json({ error: "Invalid Password" });
  }

  // Ensure user has a Favorites collection (for existing users)
  const favoritesExists = await Collection.findOne({
    createdBy: user._id,
    isDefault: true,
  });

  if (!favoritesExists) {
    await Collection.create({
      name: "Favorites",
      description: "Your favorite memories",
      icon: "⭐",
      isDefault: true,
      createdBy: user._id,
    });
  }

  const token = user.createJWT();
  res.status(200).json({ token, userId: user._id });
};

const sendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    // Find user to get their name
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const token = jwt.sign({ email }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    // Send email using Resend
    await sendVerificationEmailService(email, user.name, token);

    res.status(200).json({ message: "Verification email sent successfully", token });
  } catch (error) {
    console.error('Send verification email error:', error);
    res.status(500).json({ error: "Failed to send verification email" });
  }
};

const verifyEmail = async (req, res) => {
  const token = req.query.token;

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(400).send("Invalid token");
    }

    const user = await User.findOneAndUpdate(
      { email: decoded.email },
      { isVerified: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).send("User not found");
    }

    res.status(200).send("Email verified successfully");
  });
};

const checkVerificationStatus = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(401).json({ error: "Please provide email" });
  }

  const user = await User.findOne({ email });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.status(200).json({ isVerified: user.isVerified });
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const token = jwt.sign({ email }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    // Send password reset email using Resend
    await sendPasswordResetEmailService(email, user.name, token);

    res.status(200).json({ message: "Password reset email sent successfully" });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: "Failed to send password reset email" });
  }
};

const resetPassword = async (req, res) => {
  const { token } = req.query;

  const { password, confirmPassword } = req.body;

  if (!password || !confirmPassword) {
    return res
      .status(400)
      .json({ error: "Please provide password and confirm password" });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match" });
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const { email } = decoded;
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  user.password = password;
  await user.save();
  res.status(200).json({ message: "Password reset successful" });
};

module.exports = {
  register,
  login,
  sendVerificationEmail,
  verifyEmail,
  checkVerificationStatus,
  forgotPassword,
  resetPassword,
};
