/** Base error for all Jiskta API errors. */
export class JisktaError extends Error {
  readonly statusCode: number | undefined;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "JisktaError";
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Invalid or missing API key (HTTP 401). */
export class AuthError extends JisktaError {
  constructor(message = "Invalid API key.", statusCode?: number) {
    super(message, statusCode);
    this.name = "AuthError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Not enough credits to complete the query (HTTP 402). */
export class InsufficientCreditsError extends JisktaError {
  constructor(
    message = "Insufficient credits. Buy more at https://jiskta.com/pricing",
    statusCode?: number
  ) {
    super(message, statusCode);
    this.name = "InsufficientCreditsError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Server is overloaded — retry after backoff (HTTP 429). */
export class RateLimitError extends JisktaError {
  constructor(message = "Server is busy; retry later.", statusCode?: number) {
    super(message, statusCode);
    this.name = "RateLimitError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
