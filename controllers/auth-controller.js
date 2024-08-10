const User = require("../models/user-model");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const register = async (req, res) => {
  const user = await User.create({ ...req.body });

  const token = user.createJWT();
  res.status(201).json({ token, userId: user._id });
};

const login = async (req, res) => {
  console.log("login");

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(401).json({ error: "Please provide email and password" });
  }

  const user = await User.findOne({ email });

  if (!user) {
    return res.status(401).json({ error: "User does not exist" });
  }

  const isPasswordCorrect = await user.comparePassword(password);

  if (!isPasswordCorrect) {
    return res.status(401).json({ error: "Invalid Password" });
  }

  const token = user.createJWT();
  res.status(200).json({ token, userId: user._id });
};

const sendVerificationEmail = (req, res) => {
  const { email } = req.body;
  console.log("userid", req.user.userId);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const token = jwt.sign({ email }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  const verificationLink = `https://my-life-api.onrender.com/api/v1/auth/verify-email?token=${token}`;

  const mailOptions = {
    from: "My Life <no-reply@mylife.com>",
    to: email,
    subject: "Email Verification",
    html: `<p>Please click the following link to verify your email: <a href="${verificationLink}">${verificationLink}</a></p>`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to send email" });
    } else {
      console.log("Email sent: " + info.response);
      res.status(200).json({ message: "Email sent successfully" });
    }
  });

  res.status(200).json({ token });
};

const verifyEmail = async (req, res) => {
  const token = req.query.token;
  console.log(token);
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
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const token = jwt.sign({ email }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  const resetUrl = `https://my-life-api.onrender.com/api/v1/auth/reset-password?token=${token}`;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "hayyan.gov@gmail.com",
      pass: "adpy jqmh xytg jbgc",
    },
  });

  const mailOptions = {
    to: user.email,
    from: process.env.EMAIL_USER,
    subject: "Password Reset",
    html: `
      <p>You are receiving this because you (or someone else) have requested the reset of the password for your account.</p>
     
      <p>You can reset your password by filling out the form below:</p>
      <form action="${resetUrl}" method="POST" style="max-width: 300px; margin: 0 auto; padding: 20px; border: 1px solid #ccc; border-radius: 5px;">
        <div style="margin-bottom: 15px;">
          <label for="password" style="display: block; margin-bottom: 5px;">New Password</label>
          <input type="password" name="password" id="password" placeholder="New password" required style="width: 93%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"/>
        </div>
        <div style="margin-bottom: 15px;">
          <label for="confirmPassword" style="display: block; margin-bottom: 5px;">Confirm New Password</label>
          <input type="password" name="confirmPassword" id="confirmPassword" placeholder="Confirm new password" required style="width: 93%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"/>
        </div>
        <button type="submit" style="width: 100%; padding: 10px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">Reset Password</button>
      </form>
      <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
    `,
  };
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to send email" });
    } else {
      console.log("Email sent: " + info.response);
      res.status(200).json({ message: "Email sent successfully" });
    }
  });
};

const resetPassword = async (req, res) => {
  console.log("caaliing");

  const { token } = req.query;

  const { password, confirmPassword } = req.body;

  console.log(req.body);

  if (!password || !confirmPassword) {
    return res
      .status(400)
      .json({ error: "Please provide password and confirm password" });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match" });
  }

  console.log(jwt);

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
