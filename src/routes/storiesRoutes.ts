import express from "express";
import {
  addStory,
  deleteStory,
  getStories,
} from "../controllers/storiesController";

const router = express.Router();

router.get("", getStories);
router.post("", addStory);
router.delete("/:storyId", deleteStory);

export default router;
