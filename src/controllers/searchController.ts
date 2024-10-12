import { dbConnection } from "../dbConnection";
import AppError from "../utils/appError";
import { jwtVerifyPromisified } from "../utils/jwtVerifyPromisified";
import tryCatchWrapper from "../utils/tryCatchWrapper";
import { NextFunction, Request, Response } from "express";

export const getSearchResults = tryCatchWrapper(
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

    const searchString = req.query.searchString;

    if (!searchString) return next(new AppError("Invalid query", 400));

    const searchStringAsPattern = `%${searchString}%`;

    const sqlForNameSearch = `
		SELECT users.id, users.profilePicture, users.name, users.username
		FROM users
		WHERE users.name LIKE ? OR users.username LIKE ?
		LIMIT 5;`;

    const sqlForPostSearch = `
		SELECT posts.id, posts.userId, posts.textContent, posts.image
    FROM posts
    WHERE posts.textContent LIKE ?
		LIMIT 5;`;

    const [[namesSearch], [postsSearch]] = await Promise.all([
      await dbConnection.query(sqlForNameSearch, [
        searchStringAsPattern,
        searchStringAsPattern,
      ]),
      await dbConnection.query(sqlForPostSearch, [searchStringAsPattern]),
    ]);

    res.status(200).json({ namesSearch, postsSearch });
  }
);
