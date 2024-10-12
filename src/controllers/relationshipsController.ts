import { dbConnection } from "../dbConnection";
import AppError from "../utils/appError";
import { jwtVerifyPromisified } from "../utils/jwtVerifyPromisified";
import tryCatchWrapper from "../utils/tryCatchWrapper";
import { NextFunction, Request, Response } from "express";

export const getUserFollowers = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const sql = `SELECT isFollowingId FROM user_relationships WHERE isFollowedId = ?`;
    const userId = req.query.userId;
    if (!userId) return next(new AppError("Invalid user id", 404));

    const [results] = await dbConnection.query(sql, [userId]);

    res.status(200).json(results);
  }
);

export const getUsersAreFollowingMe = tryCatchWrapper(
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

    const sql = `
SELECT 
  users.id, 
  users.name, 
  users.profilePicture, 
  users.role, 
  users.statusText, 
  users.username,
  users.visibility 
FROM 
  user_relationships 
  INNER JOIN users ON (
    users.id = user_relationships.isFollowedId
  ) 
WHERE 
  isFollowingId = ?`;

    const [results] = await dbConnection.query(sql, [userIdFromJWT]);

    res.status(200).json(results);
  }
);

export const followUser = tryCatchWrapper(
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

    const userIdToFollow = req.body.userIdToFollow;
    if (!userIdToFollow)
      return next(new AppError("User id is missing in body", 400));

    const sql = `INSERT INTO user_relationships (isFollowingId, isFollowedId) VALUES (?, ?)`;

    const values = [
      userIdFromJWT,
      userIdToFollow,
      userIdFromJWT,
      userIdToFollow,
    ];
    await dbConnection.query(sql, values);

    res.status(200).json(`User ${userIdToFollow} followed`);
  }
);
export const unfollowUser = tryCatchWrapper(
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

    const userIdToUnfollow = req.query.userIdToUnfollow;
    if (!userIdToUnfollow)
      return next(new AppError("Missing user ID to unfollow", 400));

    const sql = `DELETE FROM user_relationships WHERE isFollowingId = ? AND isFollowedId = ?`;
    const values = [userIdFromJWT, userIdToUnfollow];
    await dbConnection.query(sql, values);

    res.status(200).json(`User ${userIdToUnfollow} unfollowed`);
  }
);
