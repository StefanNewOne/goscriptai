// API error codes (SCREAMING_SNAKE), messages in Macedonian (CLAUDE.md Conventions).
export const ERROR_CODES = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  WRONG_STATUS: 409,
  DUPLICATE_CODE: 409,
  COMMENT_REQUIRED: 422,
  MISSING_ACTOR: 422,
  BUDGET_EXCEEDED: 423,
  RATE_LIMITED: 429,
  AGENT_FAILED: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = ERROR_CODES[code];
    this.details = details;
  }
}
