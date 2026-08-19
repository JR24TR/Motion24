/**
 * Typed API error with safe, user-friendly messages.
 * Unknown errors are never leaked to clients — logged server-side only.
 */
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const ERRORS = {
  UNAUTHORIZED: () => new ApiError(401, "UNAUTHORIZED", "You need to sign in to do that."),
  FORBIDDEN: () => new ApiError(403, "FORBIDDEN", "You don't have permission to perform this action."),
  SUSPENDED: () => new ApiError(403, "SUSPENDED", "This account is suspended. Contact the arena admin."),
  NOT_FOUND: (what = "page") => new ApiError(404, "NOT_FOUND", `Could not find that ${what}.`),
  BAD_REQUEST: (msg: string) => new ApiError(400, "BAD_REQUEST", msg),
  INSUFFICIENT_FUNDS: (cost: number, balance: number) =>
    new ApiError(
      400,
      "INSUFFICIENT_FUNDS",
      `You don't have enough ARC to play this game. Entry costs ${cost.toLocaleString()} ARC, you have ${balance.toLocaleString()}.`
    ),
  ALREADY_CLAIMED: () => new ApiError(400, "ALREADY_CLAIMED", "You've already claimed today's bonus. Come back tomorrow!"),
  SESSION_INVALID: () => new ApiError(400, "SESSION_INVALID", "That game session is no longer active."),
  RATE_LIMITED: () => new ApiError(429, "RATE_LIMITED", "Slow down a moment, then try again."),
};
