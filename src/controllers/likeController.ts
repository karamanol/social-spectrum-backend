import { dbConnection } from "../dbConnection";
import AppError from "../utils/appError";
import { jwtVerifyPromisified } from "../utils/jwtVerifyPromisified";
import tryCatchWrapper from "../utils/tryCatchWrapper";
import { NextFunction, Request, Response } from "express";

export const addLikeToPost = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const jwtFromRequest = req.cookies.jwt;
    if (!jwtFromRequest) return next(new AppError("jwt_error", 401));
    if (!process.env.JWT_SECRET) return next(new AppError("Server error", 500));

    const decodedToken = await jwtVerifyPromisified(
      jwtFromRequest,
      process.env.JWT_SECRET
    );

    let userIdFromJWT;
    if (typeof decodedToken === "object" && "id" in decodedToken)
      userIdFromJWT = decodedToken["id"];

    if (!userIdFromJWT) return next(new AppError("jwt_error", 401));

    const postId = req.body.postId;
    if (!postId) return next(new AppError("Post id is missing in body", 400));

    const sql = `INSERT INTO likes (likeUserId, likePostId) VALUES (?, ?)`;
    const values = [userIdFromJWT, postId];
    await dbConnection.query(sql, values);

    res.status(200).json(`Post ${postId} liked successfully`);
  }
);

export const removeLikeFromPost = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const jwtFromRequest = req.cookies.jwt;
    if (!jwtFromRequest) return next(new AppError("jwt_error", 401));
    if (!process.env.JWT_SECRET) return next(new AppError("Server error", 500));

    const decodedToken = await jwtVerifyPromisified(
      jwtFromRequest,
      process.env.JWT_SECRET
    );

    let userIdFromJWT;
    if (typeof decodedToken === "object" && "id" in decodedToken)
      userIdFromJWT = decodedToken["id"];

    if (!userIdFromJWT) return next(new AppError("jwt_error", 401));

    const postId = req.params.postId;
    if (!postId) return next(new AppError("Post id is missing as params", 400));

    const sql = `DELETE FROM likes WHERE likeUserId = ? AND likePostId = ?`;
    const values = [userIdFromJWT, postId];
    await dbConnection.query(sql, values);

    res.status(200).json(`Removed like from post ${postId}`);
  }
);
