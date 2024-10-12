import jwt from "jsonwebtoken";
import AppError from "./appError";

export const jwtVerifyPromisified = (
  token: string,
  secret: string
): Promise<string | jwt.JwtPayload | undefined> => {
  if (!secret) {
    throw new AppError("Server error", 500);
  }
  return new Promise((resolve, reject) => {
    jwt.verify(token, secret, (err, payload) => {
      if (err) {
        reject(new AppError("jwt_error", 401));
      } else {
        resolve(payload);
      }
    });
  });
};
