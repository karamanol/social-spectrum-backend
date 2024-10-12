import express from "express";
import {
  addComment,
  deleteComment,
  getComments,
} from "../controllers/commentController";

const router = express.Router();

router.get("", getComments);
router.post("", addComment);
router.delete("/:commentId", deleteComment);

export default router;
