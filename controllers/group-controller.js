const Group = require("../models/group-model");
//no neeed for try catch as using require("express-async-errors") in app.js

const getAllGroups = async (req, res) => {
  const group = await Group.find({
    createdBy: req.user.userId,
  });
  res.status(200).json(group);
};

const getGroup = async (req, res) => {
  const id = req.params.id;

  const group = await Group.find({
    _id: id,
    createdBy: req.user.userId,
  });
  res.status(200).json(group);
};

createGroup = async (req, res) => {
  req.body.createdBy = req.user.userId;
  const group = new Group(req.body);
  await group.save();
  res.status(201).json(group);
};

updateGroup = async (req, res) => {
  const updatedData = req.body;

  const group = await Group.findOneAndUpdate(
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

  if (!group) {
    return res.status(404).json({ message: "Group not found" });
  }

  res.status(200).json(group);
};

const deleteGroup = async (req, res) => {
  const group = await Group.findOneAndDelete({
    _id: req.params.id,
    createdBy: req.user.userId,
  });
  res.status(200).json(group);
};

module.exports = {
  getAllGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
};
