import { CookieOptions, NextFunction, Request, Response } from "express";
import { dbConnection } from "../dbConnection";
import bcrypt from "bcrypt";
import tryCatchWrapper from "../utils/tryCatchWrapper";
import AppError from "../utils/appError";
import { ResultSetHeader } from "mysql2";
import { IUser } from "./userController";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { hasNoWhitespace } from "../utils/noWhitespacesRegEx";

dotenv.config({ path: "./config.env" });

const getUserByEmail = async (email: string) => {
  const sql = "SELECT * FROM users WHERE email = ?;";
  const [results] = await dbConnection.query<IUser[]>(sql, [email]);
  if (results.length) {
    return results[0];
  }
  return null;
};

export const register = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const {
      email: rawEmail,
      password,
      name: rawName,
      username: rawUsername,
    } = req.body;

    if (
      !rawEmail ||
      !(typeof rawEmail === "string") ||
      !rawUsername ||
      !(typeof rawUsername === "string") ||
      !rawName ||
      !(typeof rawName === "string") ||
      !password
    ) {
      return next(new AppError("Missing some felds", 400));
    }

    if (!hasNoWhitespace(rawUsername)) {
      return next(new AppError("No whitespaces are allowed", 400));
    }

    const username = rawUsername.toLowerCase().trim();
    const email = rawEmail.toLowerCase().trim();
    const name = rawName.trim();

    // Checking if user hasn't already registered
    if (await getUserByEmail(email)) {
      return next(new AppError(`User ${email} is already registered.`, 409));
    }

    // hashing the password
    const hashedWithSaltPassword = await bcrypt.hash(password, 11);

    // Creating a new user
    const sql =
      "INSERT INTO users (email, password, username, name) VALUES (?,?,?,?);";
    const values = [email, hashedWithSaltPassword, username, name];
    const [results] = await dbConnection.query<ResultSetHeader>(sql, values);
    const id = results.insertId;

    res.status(200).json({
      message: "User created successfully",
      createdUserId: id,
    });
  }
);

export const isCorrectPassword = async (
  userPassword: string,
  dbHashedPassword: string
) => {
  return await bcrypt.compare(userPassword, dbHashedPassword);
};

const generateAndSendJwt = (user: IUser, statusCode: number, res: Response) => {
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET as string, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

  const cookieOptions: CookieOptions = {
    expires: new Date(
      Date.now() +
        +(process.env.JWT_COOKIE_EXPIRES_IN as string) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    // sameSite: "none",
    secure: process.env.NODE_ENV === "production",
    // domain: process.env.BACKEND_DOMAIN,
  };

  const { password, ...userToSendBack } = user; // hiding password

  res.cookie("jwt", token, cookieOptions);

  res.status(statusCode).json({
    status: "success",
    token,
    data: {
      ...userToSendBack,
    },
  });
};

export const login = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    if (
      !email ||
      !password ||
      !(typeof email === "string") ||
      !(typeof password === "string")
    ) {
      return next(new AppError("Please enter a valid email and password", 400));
    }

    const emailLowerCased = email.toLowerCase().trim();

    const currentUser = await getUserByEmail(emailLowerCased);
    if (!currentUser) {
      return next(new AppError("No user found with this email", 409));
    }

    if (!(await isCorrectPassword(password, currentUser.password))) {
      return next(new AppError("Wrong email or password", 401));
    }

    generateAndSendJwt(currentUser, 200, res);
  }
);

export const logout = tryCatchWrapper(
  async (req: Request, res: Response, next: NextFunction) => {
    res.clearCookie("jwt", {
      //  sameSite: "none",
      secure: process.env.NODE_ENV === "production",
    });

    res.status(200).json({ status: "success" });
  }
);
