import { ErrorRequestHandler, Request, Response } from "express";
import AppError from "../utils/appError";

const sendErrorDevMode = (err: any, req: Request, res: Response) => {
  res.status(err.statusCode).json({
    status: err.status,
    statusCode: err.statusCode,
    message: err.message,
    error: err,
    stack: err.stack,
  });
};
const sendErrorProdMode = (err: any, req: Request, res: Response) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      statusCode: err.statusCode,
      message: err.message,
    });
  } else {
    res.status(500).json({
      status: "Error",
      message: "Something went wrong",
    });
  }
};

const handleDuplicateFieldsDBError = (err: Error) => {
  const message = "ER_DUP_ENTRY";
  return new AppError(message, 400);
};

export const globalErrorMiddleware: ErrorRequestHandler = (
  err,
  req,
  res,
  next
) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  if (err.message === "jwt_error") {
    res.clearCookie("jwt", {
      //  sameSite: "none",
      secure: process.env.NODE_ENV === "production",
    });
    res.status(401).json({ message: "jwt_error" });
  } else if (process.env.NODE_ENV === "development") {
    sendErrorDevMode(err, req, res);
  } else if (process.env.NODE_ENV === "production") {
    let error = { ...err, name: err.name, message: err.message };

    if (err.code === "ER_DUP_ENTRY")
      error = handleDuplicateFieldsDBError(error);

    sendErrorProdMode(error, req, res);
  }
};
