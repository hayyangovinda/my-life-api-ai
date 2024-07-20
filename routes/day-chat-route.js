const express = require("express");
const router = express.Router();
const dayChatController = require("../controllers/dayChat-controller");

router.get("/", dayChatController.getAllDayChats);
router.post("/", dayChatController.createDayChat);
// router.get("/:id", dayChatController.getDayChat);
router.patch("/:id", dayChatController.updateDayChat);
router.delete("/:id", dayChatController.deleteDayChat);
router.get("/date", dayChatController.getDayChatByDate);
router.post("/image", dayChatController.uploadImage);

module.exports = router;
