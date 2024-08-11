const User = require("../models/user-model");

getUserById = async (req, res) => {
  console.log("hello");

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

module.exports = {
  getUserById,
  updateUser,
  deleteUser,
};
