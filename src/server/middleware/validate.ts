import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../errors.js";

export function validateBody<T>(schema: ZodType<T>) {
  return (request: Request, _response: Response, next: NextFunction) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      next(new AppError(400, "INVALID_REQUEST", "The request is invalid."));
      return;
    }

    request.body = result.data;
    next();
  };
}
