import express from "express";
import {
  addLikeToPost,
  removeLikeFromPost,
} from "../controllers/likeController";

const router = express.Router();

router.post("", addLikeToPost);
router.delete("/:postId", removeLikeFromPost);

export default router;
