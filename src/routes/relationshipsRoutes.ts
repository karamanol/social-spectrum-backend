import express from "express";
import {
  followUser,
  getUserFollowers,
  getUsersAreFollowingMe,
  unfollowUser,
} from "../controllers/relationshipsController";

const router = express.Router();

router.get("/followed-users", getUsersAreFollowingMe);
router.get("/", getUserFollowers);
router.post("/", followUser);
router.delete("/", unfollowUser);

export default router;
