const express = require("express");
const router = express.Router();
const dayChatController = require("../controllers/dayChat-controller");
const fileUpload = require("express-fileupload");

router.get("/", dayChatController.getAllDayChats);
router.post("/", dayChatController.createDayChat);
// router.get("/:id", dayChatController.getDayChat);
router.patch("/:id", dayChatController.updateDayChat);
router.delete("/:id", dayChatController.deleteDayChat);
router.get("/date", dayChatController.getDayChatByDate);
router.post(
  "/image",
  fileUpload({ useTempFiles: true }),
  dayChatController.uploadImage
);

module.exports = router;
