const express = require("express");
const router = express.Router();
const collectionController = require("../controllers/collection-controller");

// Collection CRUD routes
router.get("/", collectionController.getAllCollections);
router.get("/:id", collectionController.getCollection);
router.post("/", collectionController.createCollection);
router.patch("/:id", collectionController.updateCollection);
router.delete("/:id", collectionController.deleteCollection);

// Story management routes
router.post("/:id/stories/:storyId", collectionController.addStoryToCollection);
router.delete("/:id/stories/:storyId", collectionController.removeStoryFromCollection);
router.get("/:id/stories", collectionController.getCollectionStories);

module.exports = router;
