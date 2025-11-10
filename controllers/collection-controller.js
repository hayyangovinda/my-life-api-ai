const Collection = require("../models/collection-model");
const DayChat = require("../models/day-chat-model");
//no neeed for try catch as using require("express-async-errors") in app.js

const getAllCollections = async (req, res) => {
  const collections = await Collection.find({
    createdBy: req.user.userId,
  }).sort({ isDefault: -1, name: 1 }); // Favorites first, then alphabetically
  res.status(200).json(collections);
};

const getCollection = async (req, res) => {
  const id = req.params.id;

  const collection = await Collection.find({
    _id: id,
    createdBy: req.user.userId,
  });
  res.status(200).json(collection);
};

createCollection = async (req, res) => {
  req.body.createdBy = req.user.userId;
  const collection = new Collection(req.body);
  await collection.save();
  res.status(201).json(collection);
};

updateCollection = async (req, res) => {
  const updatedData = req.body;

  const collection = await Collection.findOneAndUpdate(
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

  if (!collection) {
    return res.status(404).json({ message: "Collection not found" });
  }

  res.status(200).json(collection);
};

const deleteCollection = async (req, res) => {
  // Check if collection is the default Favorites collection
  const collection = await Collection.findOne({
    _id: req.params.id,
    createdBy: req.user.userId,
  });

  if (!collection) {
    return res.status(404).json({ message: "Collection not found" });
  }

  if (collection.isDefault) {
    return res
      .status(403)
      .json({ message: "Cannot delete the default Favorites collection" });
  }

  // Remove this collection from all day-chats that reference it
  await DayChat.updateMany(
    { collections: req.params.id },
    { $pull: { collections: req.params.id } }
  );

  // Delete the collection
  await Collection.findByIdAndDelete(req.params.id);

  res.status(200).json(collection);
};

const addStoryToCollection = async (req, res) => {
  const { id: collectionId, storyId } = req.params;

  // Verify collection exists and belongs to user
  const collection = await Collection.findOne({
    _id: collectionId,
    createdBy: req.user.userId,
  });

  if (!collection) {
    return res.status(404).json({ message: "Collection not found" });
  }

  // Verify story exists and belongs to user
  const story = await DayChat.findOne({
    _id: storyId,
    createdBy: req.user.userId,
  });

  if (!story) {
    return res.status(404).json({ message: "Story not found" });
  }

  // Add collection to story's collections array if not already present
  if (!story.collections.includes(collectionId)) {
    story.collections.push(collectionId);
    await story.save();
  }

  res.status(200).json({ message: "Story added to collection successfully", story });
};

const removeStoryFromCollection = async (req, res) => {
  const { id: collectionId, storyId } = req.params;

  // Verify story exists and belongs to user
  const story = await DayChat.findOne({
    _id: storyId,
    createdBy: req.user.userId,
  });

  if (!story) {
    return res.status(404).json({ message: "Story not found" });
  }

  // Remove collection from story's collections array
  story.collections = story.collections.filter(
    (colId) => colId.toString() !== collectionId
  );
  await story.save();

  res.status(200).json({ message: "Story removed from collection successfully", story });
};

const getCollectionStories = async (req, res) => {
  const { id: collectionId } = req.params;

  // Verify collection exists and belongs to user
  const collection = await Collection.findOne({
    _id: collectionId,
    createdBy: req.user.userId,
  });

  if (!collection) {
    return res.status(404).json({ message: "Collection not found" });
  }

  // Find all stories that have this collection in their collections array
  const stories = await DayChat.find({
    collections: collectionId,
    createdBy: req.user.userId,
  }).sort({ date: -1 }); // Most recent first

  res.status(200).json(stories);
};

module.exports = {
  getAllCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  addStoryToCollection,
  removeStoryFromCollection,
  getCollectionStories,
};
