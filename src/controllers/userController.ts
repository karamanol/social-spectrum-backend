import { NextFunction, Request, Response } from "express";
import { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import tryCatchWrapper from "../utils/tryCatchWrapper";
import AppError from "../utils/appError";
import { dbConnection } from "../dbConnection";
import bcrypt from "bcrypt";
import { jwtVerifyPromisified } from "../utils/jwtVerifyPromisified";
import formidable from "formidable";
import fsPromises from "node:fs/promises";
import shortenFileName from "../utils/shortenFileName";
import supabase from "../supabase";
import { isCorrectPassword } from "./authController";
import { hasNoWhitespace } from "../utils/noWhitespacesRegEx";
import crypto from "node:crypto";

export interface IUser extends RowDataPacket {
  id: number;
  username: string;
  name: string;
  email: string;
  password: string;
  role: string;
  bgPicture: string | null;
  profilePicture: string | null;
  country: string | null;
  statusText: string | null;
  languages: string | null;
  visibility: string;
}

interface IPassword extends RowDataPacket {
  password: string;
}

export const getUser = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.params.userId;
    if (!userId || !parseInt(userId)) {
      return next(new AppError("Invalid user ID", 400));
    }

    const jwtFromRequest = req.cookies.jwt;
    if (!jwtFromRequest) return next(new AppError("jwt_error", 401));

    if (!process.env.JWT_SECRET)
      return next(new AppError("Server jwt related error", 500));
    await jwtVerifyPromisified(
      jwtFromRequest,
      process.env.JWT_SECRET as string
    );

    const sql = `SELECT * FROM users WHERE id = ?;`;
    const [results] = await dbConnection.query<IUser[]>(sql, [userId]);
    if (Array.isArray(results) && !results.length) {
      return next(new AppError("No user found with given id", 404));
    }

    const safeUserData = { ...results[0], password: undefined };

    res.status(200).json([safeUserData]);
  }
);

export const updateUser = tryCatchWrapper(
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

    const form = formidable({});
    const [fields, files] = await form.parse(req);

    const name = (fields?.name?.[0] ?? "").trim();
    const username = hasNoWhitespace(fields?.username?.[0] ?? " ")
      ? fields?.username?.[0]
      : "";
    const email = (fields?.email?.[0] ?? "").toLowerCase().trim();
    if (!name || !username || !email) {
      return next(new AppError("Some required fields are missing", 400));
    }

    const country = fields?.country?.[0];
    const statusText = fields?.statusText?.[0];
    const languages = fields?.languages?.[0];

    const uploadFileToSupabase = async (
      supaFolderName: string,
      file?: formidable.File
    ) => {
      if (!file) return null;
      const maxImageNameLength = 50;
      const shortFileName = shortenFileName(
        file.originalFilename || "noname",
        maxImageNameLength
      );
      const uniqueFileName = `${crypto.randomUUID()}-${shortFileName}`.replace(
        /\//g,
        ""
      );
      const rawData = await fsPromises.readFile(file.filepath);
      const { data, error: supaError } = await supabase.storage
        .from(supaFolderName)
        .upload(uniqueFileName, rawData, { contentType: "image/*" });
      if (supaError) {
        console.log("Supa error:", supaError);
        return next(new AppError("Something went wrong", 500));
      }
      const bucketUrl = process.env.SUPABASE_BUCKET_URL;
      return `${bucketUrl}/${supaFolderName}/${data.path}`;
    };

    const profilePicture = files?.["profilePicture[]"]?.[0];
    const profilePictureRemoteUrl = await uploadFileToSupabase(
      "profile-bg-pictures",
      profilePicture
    );

    const bgPicture = files?.["bgPicture[]"]?.[0];
    const bgPictureRemoteUrl = await uploadFileToSupabase(
      "profile-bg-pictures",
      bgPicture
    );

    const [userData] = await dbConnection.query<IUser[]>(
      `SELECT * FROM users WHERE id = ?;`,
      [userIdFromJWT]
    );
    const oldBgPictureUrl = userData?.[0]?.bgPicture || "";
    const oldProfilePictureUrl = userData?.[0]?.profilePicture || "";
    const imagesToDeleteFromSupa = [];
    bgPicture &&
      imagesToDeleteFromSupa.push(oldBgPictureUrl.split("/").pop() || ""); // Extracting only image name
    profilePicture &&
      imagesToDeleteFromSupa.push(oldProfilePictureUrl.split("/").pop() || "");
    if (imagesToDeleteFromSupa.length) {
      const { error } = await supabase.storage
        .from("profile-bg-pictures")
        .remove(imagesToDeleteFromSupa);
      if (error) {
        return next(
          new AppError("Error occurred while deleting old images", 500)
        );
      }
    }

    const sql = `UPDATE users 
    SET 
      name = ?, 
      username = ?, 
      email = ?, 
      country = ?, 
      statusText = ?, 
      languages = ?,
      bgPicture = ?, 
      profilePicture = ?
    WHERE 
      id = ?;`;

    const values = [
      name,
      username,
      email,
      country,
      statusText,
      languages,
      bgPictureRemoteUrl || oldBgPictureUrl,
      profilePictureRemoteUrl || oldProfilePictureUrl,
      userIdFromJWT,
    ];

    await dbConnection.query<ResultSetHeader>(sql, values);

    res.status(200).json({ status: "success" });
  }
);

export const checkUserPassword = tryCatchWrapper(
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

    const passwordFromBody = req.body.password;

    const sql = `SELECT password FROM users WHERE id = ?;`;
    const [results] = await dbConnection.query<IPassword[]>(sql, [
      userIdFromJWT,
    ]);
    const dbPassword = results?.[0]?.password;

    if (
      !dbPassword ||
      !(await isCorrectPassword(passwordFromBody, dbPassword))
    ) {
      return next(new AppError("Incorrect or missing password", 401));
    }
    res.status(200).json({ success: true });
  }
);

export const updateUserPassword = tryCatchWrapper(
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

    const { oldPassword, newPassword, newPasswordConfirmation } = req.body;
    if (
      !oldPassword ||
      !newPassword ||
      newPassword !== newPasswordConfirmation
    ) {
      return next(new AppError("Some fields are missing or not valid", 400));
    }

    const hashedWithSaltPassword = await bcrypt.hash(newPassword, 11);

    const sql = "UPDATE users SET password = ? WHERE id = ?;";
    const values = [hashedWithSaltPassword, userIdFromJWT];
    await dbConnection.query<ResultSetHeader>(sql, values);

    res.status(200).json({ success: true, message: "Password changed!" });
  }
);

export const updateUserVisibility = tryCatchWrapper(
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

    const userId = req.params.userId;

    if (!userId || userId !== String(userIdFromJWT))
      return next(
        new AppError("You do not have permission to change this property", 401)
      );

    const newStatus = req.body.visibility;

    if (newStatus !== "online" && newStatus !== "invisible")
      return next(new AppError("Unknown status: " + newStatus, 400));

    const sql = `UPDATE users 
    SET 
      visibility = ?
    WHERE 
      id = ?;
    `;

    await dbConnection.query<ResultSetHeader>(sql, [newStatus, userIdFromJWT]);

    res.status(200).json({ status: "success" });
  }
);

export const deleteUserAccount = tryCatchWrapper(
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

    const userId = req.params.userId;
    if (!userId) return next(new AppError("User not found", 404));

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
      "DELETE FROM users WHERE (users.id = ?) AND (users.id = ? OR ? = ?)";

    await dbConnection.query<ResultSetHeader>(sql, [
      userId,
      userIdFromJWT,
      userIdFromJWT,
      adminId,
    ]);

    userId == userIdFromJWT &&
      res.clearCookie("jwt", { sameSite: "none", secure: true });

    res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  }
);

export const getSuggestedUsers = tryCatchWrapper(
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

    // getting 5 random users that current user doesn't follow yet
    const sql = `
    SELECT 
        users.id,
        users.name,
        users.profilePicture
    FROM users
    LEFT JOIN user_relationships
    ON (users.id = user_relationships.isFollowedId AND user_relationships.isFollowingId = ?)
    WHERE user_relationships.isFollowedId IS NULL AND users.id <> ?
    LIMIT 5`;

    const values = [userIdFromJWT, userIdFromJWT];

    const [results] = await dbConnection.query<IUser[]>(sql, values);

    res.status(200).json(results);
  }
);

export const getFriendsOnline = tryCatchWrapper(
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

    const sql = `SELECT users.id, users.name, users.profilePicture
    FROM users
    LEFT JOIN user_relationships ON (user_relationships.isFollowedId = users.id)
    WHERE user_relationships.isFollowingId = ?
    AND users.visibility = 'online'
    LIMIT 10`;

    const values = [userIdFromJWT];

    const [results] = await dbConnection.query<IUser[]>(sql, values);

    res.status(200).json(results);
  }
);
