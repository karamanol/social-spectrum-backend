import { ResultSetHeader, RowDataPacket } from "mysql2";
import { dbConnection } from "../dbConnection";
import tryCatchWrapper from "../utils/tryCatchWrapper";
import { NextFunction, Request, Response } from "express";
import AppError from "../utils/appError";
import { formatISO9075 } from "date-fns";
import { jwtVerifyPromisified } from "../utils/jwtVerifyPromisified";

interface IGetComments extends RowDataPacket {
  id: number;
  textContent: string;
  createdAt: Date;
  commentUserId: number;
  postId: number;
  name: string;
  profilePicture?: string;
}

export const getComments = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const queryPostId = req.query.postId;

    if (!queryPostId)
      return next(new AppError("Probably post does not exist", 404));

    const sql = `
   SELECT 
		comments.*, 
		users.name, 
		users.profilePicture,
		users.id AS userId 
	 FROM 
		comments 
	 INNER JOIN users ON (comments.commentUserId = users.id) 
	 WHERE 
		comments.postId = ?
	 ORDER BY comments.createdAt DESC
   LIMIT 10`;

    const [results] = await dbConnection.query<IGetComments[]>(sql, [
      queryPostId,
    ]);

    res.status(200).json(results);
  }
);

export const addComment = tryCatchWrapper(
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

    const { textContent, postId } = req.body;
    const mysqlDate = formatISO9075(new Date());

    const sql = `INSERT INTO comments 
    (textContent, commentUserId, postId, createdAt) 
   VALUES 
    (?, ?, ?, ?)`;

    const values = [textContent, userIdFromJWT, postId, mysqlDate];

    await dbConnection.query<ResultSetHeader>(sql, values);

    res
      .status(201)
      .json({ success: true, message: "Comment added successfully" });
  }
);

export const deleteComment = tryCatchWrapper(
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

    const commentId = req.params.commentId;
    if (!commentId) return next(new AppError("No comment id provided", 400));

    // allowing admin also to perform deletion
    let adminId;
    const sqlForAdminId = `SELECT id FROM users WHERE email = ?`;
    const [adminIdResult] = await dbConnection.query(sqlForAdminId, [
      process.env.ADMIN_EMAIL,
    ]);
    if (
      Array.isArray(adminIdResult) &&
      adminIdResult.length &&
      "id" in adminIdResult[0]
    ) {
      adminId = adminIdResult?.[0].id;
      if (!adminId) {
        return next(new AppError("Server error", 500));
      }
    } else {
      return next(new AppError("Server error", 500));
    }

    const sql =
      "DELETE FROM comments WHERE (comments.id = ?) AND (comments.commentUserId = ? OR ? = ?)";

    await dbConnection.query<ResultSetHeader>(sql, [
      commentId,
      userIdFromJWT,
      userIdFromJWT,
      adminId,
    ]);

    res.status(200).json({
      success: true,
      message: "Comment deleted successfully",
    });
  }
);
