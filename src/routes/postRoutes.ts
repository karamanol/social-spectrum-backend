import express from "express";
import {
  addPost,
  addSavedPost,
  deletePost,
  deleteSavedPost,
  getPosts,
  getSavedPosts,
} from "../controllers/postController";

const router = express.Router();

router.get("/saved", getSavedPosts);
router.delete("/saved/:postId", deleteSavedPost);
router.post("/saved", addSavedPost);

router.get(["", "/:userId"], getPosts);
router.post("", addPost);
router.delete("/:postId", deletePost);

export default router;
