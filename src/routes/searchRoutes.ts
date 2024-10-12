import express from "express";
import { getSearchResults } from "../controllers/searchController";

const router = express.Router();

router.get("", getSearchResults);
export default router;
