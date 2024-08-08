const express = require("express");
const router = express.Router();
const groupController = require("../controllers/group-controller");

router.get("/", groupController.getAllGroups);
router.get("/:id", groupController.getGroup);
router.post("/", groupController.createGroup);
router.patch("/:id", groupController.updateGroup);
router.delete("/:id", groupController.deleteGroup);

module.exports = router;
