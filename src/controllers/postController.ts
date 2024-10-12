import { NextFunction, Request, Response } from "express";
import tryCatchWrapper from "../utils/tryCatchWrapper";
import { dbConnection } from "../dbConnection";
import { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import AppError from "../utils/appError";
import { formatISO9075 } from "date-fns";
import formidable from "formidable";
import supabase from "../supabase";
import fsPromises from "node:fs/promises";
import shortenFileName from "../utils/shortenFileName";
import { jwtVerifyPromisified } from "../utils/jwtVerifyPromisified";
import sharp from "sharp";
import { encode } from "blurhash";
import crypto from "node:crypto";

interface IPost extends RowDataPacket {
  id: number;
  userId: number;
  textContent: string;
  image?: string;
  createdAt: string;
  blurhashString?: string;
}

interface IGetPost extends IPost {
  name: string;
  profilePicture?: string;
}

export const getPosts = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const jwtFromRequest = req.cookies.jwt;
    if (!jwtFromRequest) return next(new AppError("jwt_error", 401));
    if (!process.env.JWT_SECRET) return next(new AppError("Server error", 500));

    const decodedToken = await jwtVerifyPromisified(
      jwtFromRequest,
      process.env.JWT_SECRET as string
    );

    let userIdFromJWT;
    if (typeof decodedToken === "object" && "id" in decodedToken)
      userIdFromJWT = decodedToken["id"];
    if (!userIdFromJWT) return next(new AppError("jwt_error", 401));

    if (req.query.specificUserId) {
      // Querying for specific user own posts, w/o friends posts
      const sql = `SELECT 
        posts.*,
        users.name,
        users.profilePicture,
        COALESCE(likes_count.likesNum, 0) AS likesNum,
        COALESCE(comments_count.commentsNum, 0) AS commentsNum,
        COALESCE(current_user_likes.isPostLikedByCurrentUser, 0) AS isPostLikedByCurrentUser,
        COALESCE(current_user_saves.isPostSavedByCurrentUser, 0) AS isPostSavedByCurrentUser
      FROM 
        posts
      INNER JOIN 
        users ON users.id = posts.userId
      LEFT JOIN 
        (SELECT likePostId, COUNT(*) AS likesNum FROM likes GROUP BY likePostId) AS likes_count ON (posts.id = likes_count.likePostId)
      LEFT JOIN 
        (SELECT postId, COUNT(*) AS commentsNum FROM comments GROUP BY postId) AS comments_count ON (posts.id = comments_count.postId)
      LEFT JOIN 
        (SELECT likePostId, 1 AS isPostLikedByCurrentUser FROM likes WHERE likeUserId = ?) AS current_user_likes ON (posts.id = current_user_likes.likePostId)
      LEFT JOIN 
        (SELECT savedPostId, 1 AS isPostSavedByCurrentUser FROM saved_posts WHERE userId = ?) AS current_user_saves ON (posts.id = current_user_saves.savedPostId)
      WHERE 
        posts.userId = ?
      ORDER BY 
        posts.createdAt DESC
      LIMIT 200;`;

      const [results] = await dbConnection.query<IGetPost[]>(sql, [
        userIdFromJWT,
        userIdFromJWT,
        req.query.specificUserId,
      ]);

      res.status(200).json(results);
    } else {
      const sql = `SELECT 
        posts.*,
        users.name,
        users.profilePicture,
        COALESCE(likes_count.likesNum, 0) AS likesNum,
        COALESCE(comments_count.commentsNum, 0) AS commentsNum,
        COALESCE(current_user_likes.isPostLikedByCurrentUser, 0) AS isPostLikedByCurrentUser,
        COALESCE(current_user_saves.isPostSavedByCurrentUser, 0) AS isPostSavedByCurrentUser
      FROM 
        posts
      INNER JOIN 
        users ON users.id = posts.userId
      LEFT JOIN 
        user_relationships ON (posts.userId = user_relationships.isFollowedId AND user_relationships.isFollowingId = ?)
      LEFT JOIN 
        (SELECT likePostId, COUNT(*) AS likesNum FROM likes GROUP BY likePostId) AS likes_count ON (posts.id = likes_count.likePostId)
      LEFT JOIN 
        (SELECT postId, COUNT(*) AS commentsNum FROM comments GROUP BY postId) AS comments_count ON (posts.id = comments_count.postId)
      LEFT JOIN 
        (SELECT likePostId, 1 AS isPostLikedByCurrentUser FROM likes WHERE likeUserId = ?) AS current_user_likes ON (posts.id = current_user_likes.likePostId)
      LEFT JOIN 
        (SELECT savedPostId, 1 AS isPostSavedByCurrentUser FROM saved_posts WHERE userId = ?) AS current_user_saves ON (posts.id = current_user_saves.savedPostId)
      WHERE 
        user_relationships.isFollowingId IS NOT NULL 
        OR posts.userId = ?
      ORDER BY 
        posts.createdAt DESC
      LIMIT 200;`;

      const [results] = await dbConnection.query<IGetPost[]>(sql, [
        userIdFromJWT,
        userIdFromJWT,
        userIdFromJWT,
        userIdFromJWT,
        userIdFromJWT,
      ]);

      res.status(200).json(results);
    }
  }
);

export const addPost = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const jwtFromRequest = req.cookies.jwt;
    if (!jwtFromRequest) return next(new AppError("jwt_error", 401));

    if (!process.env.JWT_SECRET) return next(new AppError("Server error", 500));
    const decodedToken = await jwtVerifyPromisified(
      jwtFromRequest,
      process.env.JWT_SECRET
    );

    let userIdFromJWT;
    let blurhashString = null;
    if (typeof decodedToken === "object" && "id" in decodedToken)
      userIdFromJWT = decodedToken["id"];

    if (!userIdFromJWT) return next(new AppError("jwt_error", 401));

    const mysqlDate = formatISO9075(new Date());

    const form = formidable({});
    const [fields, files] = await form.parse(req);

    const textContent = fields?.textContent?.[0];
    if (!textContent) return next(new AppError("Post cannot be empty", 400));

    const image = files?.image?.[0];

    let imageRemoteUrl = null;
    if (image) {
      const maxImageNameLength = 50;
      const shortImageName = shortenFileName(
        image.originalFilename || "noname",
        maxImageNameLength
      );

      const uniqueImageName =
        `${crypto.randomUUID()}-${shortImageName}`.replace(/\//g, ""); // unique image name without slashes

      const rawDataImg = await fsPromises.readFile(image.filepath); // for compatibility with supabase

      const imageBuffer = await sharp(image.filepath)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true }); // converting for blurhash compatibility
      const {
        info: { width, height },
        data: sharpImageData,
      } = imageBuffer;

      const imageData = new Uint8ClampedArray(sharpImageData);
      blurhashString = encode(imageData, width, height, 3, 3);

      const { data, error: supaError } = await supabase.storage
        .from("post-images")
        .upload(uniqueImageName, rawDataImg, { contentType: "image/*" });

      if (supaError) {
        console.log("Supa error:", supaError);
        return next(new AppError("Something went wrong", 500));
      }

      const bucketUrl = process.env.SUPABASE_BUCKET_URL;
      imageRemoteUrl = `${bucketUrl}/post-images/${data.path}`;
    }

    const sql = `INSERT INTO posts 
    (textContent, userId, image, createdAt, blurhashString) 
   VALUES 
    (?, ?, ?, ?, ?)`;

    const values = [
      textContent,
      userIdFromJWT,
      imageRemoteUrl,
      mysqlDate,
      blurhashString,
    ];

    await dbConnection.query<ResultSetHeader>(sql, values);

    res.status(201).json({ success: true, message: "Post added successfully" });
  }
);

export const deletePost = tryCatchWrapper(
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

    // checking if the user is deleting own post
    const getPostSql = "SELECT userId, image FROM posts WHERE id = ?";
    const [results] = await dbConnection.query(getPostSql, [postId]);
    if (
      Array.isArray(results) &&
      "userId" in results?.[0] &&
      results[0].userId !== userIdFromJWT
    ) {
      // checking if user is admin and is allowed to delete the post
      const sql = `SELECT email FROM users WHERE id = ?`;
      const [results] = await dbConnection.query(sql, [userIdFromJWT]);
      if (
        Array.isArray(results) &&
        "email" in results?.[0] &&
        results?.[0]?.email !== process.env.ADMIN_EMAIL
      ) {
        return next(
          new AppError(
            "Only post owners or admins are allowed to delete posts",
            403
          )
        );
      }
    }

    // deleting the post image if post has one
    const postImageToDelete =
      Array.isArray(results) && "image" in results?.[0] && results[0]?.image
        ? results[0]?.image
        : null;
    if (postImageToDelete) {
      const { error: bucketError } = await supabase.storage
        .from("post-images")
        .remove([postImageToDelete.split("/").pop() || ""]);
      if (bucketError) {
        return next(
          new AppError("Something went wrong deleting post image", 500)
        );
      }
    }

    // deleting post
    const deletePostSql = "DELETE FROM posts WHERE id = ?";
    await dbConnection.query<ResultSetHeader>(deletePostSql, [postId]);

    res
      .status(200)
      .json({ success: true, message: "Post deleted successfully" });
  }
);

// Saved posts handlers
export const getSavedPosts = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const jwtFromRequest = req.cookies.jwt;
    if (!jwtFromRequest) return next(new AppError("jwt_error", 401));
    if (!process.env.JWT_SECRET)
      return next(new AppError("Server jwt related error", 500));

    const decodedToken = await jwtVerifyPromisified(
      jwtFromRequest,
      process.env.JWT_SECRET as string
    );

    let userIdFromJWT;
    if (typeof decodedToken === "object" && "id" in decodedToken)
      userIdFromJWT = decodedToken["id"];
    if (!userIdFromJWT) return next(new AppError("jwt_error", 401));

    const sql = `
    SELECT 
     posts.*,
     users.name, 
     users.profilePicture,
     COUNT(likes.id) AS "likesNum",
     COUNT(comments.id) AS "commentsNum",
     SUM(IF(likes.likeUserId = ?, 1, 0)) AS "isPostLikedByCurrentUser"
    FROM 
     saved_posts 
    LEFT JOIN posts ON (posts.id = saved_posts.savedPostId)
    INNER JOIN users ON (users.id = posts.userId)  
    LEFT JOIN likes ON (likes.likePostId = posts.id)
    LEFT JOIN comments ON (comments.postId = posts.id)
    WHERE 
     saved_posts.userId = ?
    GROUP BY saved_posts.id
    LIMIT 200`;

    const [results] = await dbConnection.query<IGetPost[]>(sql, [
      userIdFromJWT,
      userIdFromJWT,
    ]);

    res.status(200).json(results);
  }
);

export const deleteSavedPost = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const jwtFromRequest = req.cookies.jwt;
    if (!jwtFromRequest) return next(new AppError("jwt_error", 401));
    if (!process.env.JWT_SECRET)
      return next(new AppError("Server jwt related error", 500));

    const decodedToken = await jwtVerifyPromisified(
      jwtFromRequest,
      process.env.JWT_SECRET as string
    );

    let userIdFromJWT;
    if (typeof decodedToken === "object" && "id" in decodedToken)
      userIdFromJWT = decodedToken["id"];
    if (!userIdFromJWT) return next(new AppError("jwt_error", 401));

    const postIdToUnbookmark = req.params.postId;
    if (!postIdToUnbookmark) return next(new AppError("Invalid post id", 400));

    const deleteBookmarkedPostSql =
      "DELETE FROM saved_posts WHERE savedPostId = ? AND userId = ?";
    await dbConnection.query<ResultSetHeader>(deleteBookmarkedPostSql, [
      postIdToUnbookmark,
      userIdFromJWT,
    ]);

    res.status(200).json({
      success: true,
      message: "Post deleted from bookmarks successfully",
    });
  }
);

export const addSavedPost = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const jwtFromRequest = req.cookies.jwt;
    if (!jwtFromRequest) return next(new AppError("jwt_error", 401));
    if (!process.env.JWT_SECRET)
      return next(new AppError("Server jwt related error", 500));

    const decodedToken = await jwtVerifyPromisified(
      jwtFromRequest,
      process.env.JWT_SECRET as string
    );

    let userIdFromJWT;
    if (typeof decodedToken === "object" && "id" in decodedToken)
      userIdFromJWT = decodedToken["id"];
    if (!userIdFromJWT) return next(new AppError("jwt_error", 401));

    const postId = req.body.postId;
    if (!postId)
      return next(
        new AppError(
          "Expected postId to be specified in the POST request body",
          400
        )
      );

    const sql = `INSERT INTO saved_posts 
    (userId, savedPostId) 
   VALUES 
    (?, ?)`;

    const values = [userIdFromJWT, postId];

    await dbConnection.query<ResultSetHeader>(sql, values);

    res
      .status(201)
      .json({ success: true, message: "Post bookmarked successfully" });
  }
);
