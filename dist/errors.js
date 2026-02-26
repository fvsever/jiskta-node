"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitError = exports.InsufficientCreditsError = exports.AuthError = exports.JisktaError = void 0;
/** Base error for all Jiskta API errors. */
class JisktaError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = "JisktaError";
        this.statusCode = statusCode;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.JisktaError = JisktaError;
/** Invalid or missing API key (HTTP 401). */
class AuthError extends JisktaError {
    constructor(message = "Invalid API key.", statusCode) {
        super(message, statusCode);
        this.name = "AuthError";
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.AuthError = AuthError;
/** Not enough credits to complete the query (HTTP 402). */
class InsufficientCreditsError extends JisktaError {
    constructor(message = "Insufficient credits. Buy more at https://jiskta.com/pricing", statusCode) {
        super(message, statusCode);
        this.name = "InsufficientCreditsError";
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.InsufficientCreditsError = InsufficientCreditsError;
/** Server is overloaded — retry after backoff (HTTP 429). */
class RateLimitError extends JisktaError {
    constructor(message = "Server is busy; retry later.", statusCode) {
        super(message, statusCode);
        this.name = "RateLimitError";
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.RateLimitError = RateLimitError;
//# sourceMappingURL=errors.js.map