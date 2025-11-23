const User = require("../models/user-model");

getUserById = async (req, res) => {
  const userId = req.user.userId;

  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(200).json({ name: user.name, taskCompleted: user.taskCompleted });
};

updateUser = async (req, res) => {
  const userId = req.user.userId;

  const user = await User.findByIdAndUpdate(userId, req.body, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(200).json({ message: "User updated successfully" });
};

deleteUser = async (req, res) => {
  const userId = req.user.userId;
  const user = await User.findByIdAndDelete(userId);
  res.status(200).json(user);
};

// Get encrypted encryption key for client-side media encryption
getEncryptedKey = async (req, res) => {
  const userId = req.user.userId;

  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(200).json({
    encryptedKey: user.encryptedEncryptionKey,
    hasKey: !!user.encryptedEncryptionKey
  });
};

// Set encrypted encryption key for client-side media encryption
setEncryptedKey = async (req, res) => {
  const userId = req.user.userId;
  const { encryptedKey } = req.body;

  if (!encryptedKey) {
    return res.status(400).json({ message: "Encrypted key is required" });
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { encryptedEncryptionKey: encryptedKey },
    { new: true, runValidators: true }
  );

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(200).json({ message: "Encrypted key stored successfully" });
};

// Set or update passcode
setPasscode = async (req, res) => {
  const userId = req.user.userId;
  const { passcode } = req.body;

  if (!passcode || passcode.length !== 4 || !/^\d{4}$/.test(passcode)) {
    return res.status(400).json({ message: "Passcode must be exactly 4 digits" });
  }

  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  // Hash the passcode
  user.passcode = await user.hashPasscode(passcode);
  user.passcodeEnabled = true;
  await user.save();

  res.status(200).json({ message: "Passcode set successfully", passcodeEnabled: true });
};

// Verify passcode
verifyPasscode = async (req, res) => {
  const userId = req.user.userId;
  const { passcode } = req.body;

  if (!passcode) {
    return res.status(400).json({ message: "Passcode is required" });
  }

  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (!user.passcodeEnabled || !user.passcode) {
    return res.status(400).json({ message: "Passcode is not enabled" });
  }

  const isMatch = await user.comparePasscode(passcode);

  if (!isMatch) {
    return res.status(401).json({ message: "Invalid passcode", verified: false });
  }

  res.status(200).json({ message: "Passcode verified successfully", verified: true });
};

// Toggle passcode on/off
togglePasscode = async (req, res) => {
  const userId = req.user.userId;
  const { enabled } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ message: "Enabled flag must be a boolean" });
  }

  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  // If disabling, just set the flag
  if (!enabled) {
    user.passcodeEnabled = false;
    await user.save();
    return res.status(200).json({ message: "Passcode disabled", passcodeEnabled: false });
  }

  // If enabling, check if passcode exists
  if (!user.passcode) {
    return res.status(400).json({ message: "Please set a passcode first" });
  }

  user.passcodeEnabled = true;
  await user.save();

  res.status(200).json({ message: "Passcode enabled", passcodeEnabled: true });
};

// Get passcode status
getPasscodeStatus = async (req, res) => {
  const userId = req.user.userId;

  const user = await User.findById(userId);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(200).json({
    passcodeEnabled: user.passcodeEnabled,
    hasPasscode: !!user.passcode
  });
};

module.exports = {
  getUserById,
  updateUser,
  deleteUser,
  getEncryptedKey,
  setEncryptedKey,
  setPasscode,
  verifyPasscode,
  togglePasscode,
  getPasscodeStatus,
};
