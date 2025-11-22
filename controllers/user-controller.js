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

module.exports = {
  getUserById,
  updateUser,
  deleteUser,
  getEncryptedKey,
  setEncryptedKey,
};
