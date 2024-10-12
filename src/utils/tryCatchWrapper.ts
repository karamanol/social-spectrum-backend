import { NextFunction, Request, Response } from "express";

type ExpressMiddlewareType = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

export default function tryCatchWrapper(fn: ExpressMiddlewareType) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch((err) => next(err));
  };
}
