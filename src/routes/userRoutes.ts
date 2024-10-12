import express from "express";
import {
  checkUserPassword,
  deleteUserAccount,
  getFriendsOnline,
  getSuggestedUsers,
  getUser,
  updateUser,
  updateUserPassword,
  updateUserVisibility,
} from "../controllers/userController";

const router = express.Router();

router.get("/suggested", getSuggestedUsers);
router.get("/online", getFriendsOnline);
router.get("/:userId", getUser);
router.patch("", updateUser);
router.patch("/password-update", updateUserPassword);
router.patch("/:userId/status", updateUserVisibility);
router.post("/password-check", checkUserPassword);
router.delete("/:userId", deleteUserAccount);

export default router;
