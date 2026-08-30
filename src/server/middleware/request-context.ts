import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const requestIdPattern = /^[A-Za-z0-9_-]{8,64}$/;

export function requestContext(request: Request, response: Response, next: NextFunction) {
  const provided = request.header("x-request-id");
  const requestId = provided && requestIdPattern.test(provided) ? provided : randomUUID();

  Object.assign(request, { requestId });
  response.setHeader("x-request-id", requestId);
  next();
}
