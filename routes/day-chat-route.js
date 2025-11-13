const express = require("express");
const router = express.Router();
const dayChatController = require("../controllers/dayChat-controller");
const fileUpload = require("express-fileupload");

router.get("/", dayChatController.getAllDayChats);
router.get("/search", dayChatController.searchDayChats);
router.get("/date", dayChatController.getDayChatByDate);
router.get("/:id", dayChatController.getDayChat);
router.post("/", dayChatController.createDayChat);
router.patch("/:id", dayChatController.updateDayChat);
router.delete("/:id", dayChatController.deleteDayChat);
router.post(
  "/image",
  fileUpload({ useTempFiles: true }),
  dayChatController.uploadImage
);
router.post(
  "/video",
  fileUpload({ useTempFiles: true }),
  dayChatController.uploadVideo
);

module.exports = router;
