export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = "AppError";
  }
}

export const unauthorized = () =>
  new AppError(401, "UNAUTHENTICATED", "Authentication is required.");

export const forbidden = () =>
  new AppError(403, "FORBIDDEN", "You are not allowed to perform this action.");

export const emailVerificationRequired = () =>
  new AppError(403, "EMAIL_VERIFICATION_REQUIRED", "Please verify your email before accessing your private journal.");

export const notFound = () =>
  new AppError(404, "NOT_FOUND", "The requested resource was not found.");
