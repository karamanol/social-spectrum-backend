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
import blurhash, { encode } from "blurhash";
import crypto from "node:crypto";

interface IStory extends RowDataPacket {
  id: number;
  storyUserId: number;
  imageUrl: string;
  createdAt: string;
  blurhashString?: string;
}

export const addStory = tryCatchWrapper(
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

    const mysqlDate = formatISO9075(new Date());

    const form = formidable({});
    const [_fields, files] = await form.parse(req);

    const image = files?.image?.[0];

    let imageRemoteUrl = null;
    let blurhashString = null;
    if (image) {
      const maxImageNameLength = 50;
      const shortImageName = shortenFileName(
        image.originalFilename || "noname",
        maxImageNameLength
      );

      const uniqueImageName =
        `${crypto.randomUUID()}-${shortImageName}`.replace(/\//g, ""); // unique image name without slashes

      const rawDataImg = await fsPromises.readFile(image.filepath); // converting for supabase compatibility

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
        .from("stories")
        .upload(uniqueImageName, rawDataImg, { contentType: "image/*" });

      if (supaError) {
        console.log("Supa error:", supaError);
        return next(new AppError("Something went wrong", 500));
      }

      const bucketUrl = process.env.SUPABASE_BUCKET_URL;
      imageRemoteUrl = `${bucketUrl}/stories/${data.path}`;
    }

    const sql = `INSERT INTO stories
      (storyUserId, imageUrl, createdAt, blurhashString)
     VALUES
      (?, ?, ?, ?)`;

    const values = [userIdFromJWT, imageRemoteUrl, mysqlDate, blurhashString];

    await dbConnection.query<ResultSetHeader>(sql, values);

    res
      .status(201)
      .json({ success: true, message: "Story added successfully" });
  }
);

export const getStories = tryCatchWrapper(
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

    const specificUserId = req.query.userId;

    let sql;
    let values = [];

    if (specificUserId) {
      sql = `SELECT *
      FROM stories 
      WHERE stories.storyUserId = ?
      ORDER BY stories.createdAt DESC
      LIMIT 100`;
      values = [userIdFromJWT];
    } else {
      // Stroies of user + users he is following
      sql = `SELECT stories.*,
      users.name, 
      users.profilePicture
      FROM stories 
      INNER JOIN users ON (users.id = stories.storyUserId) 
      LEFT JOIN user_relationships ON (stories.storyUserId = user_relationships.isFollowedId AND user_relationships.isFollowingId = ?)
      WHERE user_relationships.isFollowingId = ?
      OR stories.storyUserId = ?
      GROUP BY stories.id
      ORDER BY stories.createdAt DESC
      LIMIT 100`;
      values = [userIdFromJWT, userIdFromJWT, userIdFromJWT];
    }

    const [results] = await dbConnection.query<IStory[]>(sql, values);

    res.status(200).json(results);
  }
);

export const deleteStory = tryCatchWrapper(
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

    const storyId = req.params.storyId;

    // checking if the user indeed is deleting OWN story
    const getStorySql =
      "SELECT storyUserId, imageUrl FROM stories WHERE id = ?";
    const [results] = await dbConnection.query(getStorySql, [storyId]);

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

    if (
      Array.isArray(results) &&
      "storyUserId" in results?.[0] &&
      results[0].storyUserId !== userIdFromJWT &&
      userIdFromJWT !== adminId
    ) {
      return next(
        new AppError("Only post owners are allowed to delete their posts", 403)
      );
    }

    // deleting story image
    const storyImageToDelete =
      Array.isArray(results) &&
      "imageUrl" in results?.[0] &&
      results[0]?.imageUrl
        ? results[0]?.imageUrl
        : null;
    if (storyImageToDelete) {
      const { error: bucketError } = await supabase.storage
        .from("stories")
        .remove([storyImageToDelete.split("/").pop() || ""]);
      if (bucketError) {
        return next(
          new AppError(
            "Something went wrong while deleting story. Try again later",
            500
          )
        );
      }
    }

    // deleting story
    const deleteStorySql = "DELETE FROM stories WHERE id =  ?";
    await dbConnection.query<ResultSetHeader>(deleteStorySql, [storyId]);

    res
      .status(200)
      .json({ success: true, message: "Story deleted successfully" });
  }
);
