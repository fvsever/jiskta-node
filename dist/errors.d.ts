/** Base error for all Jiskta API errors. */
export declare class JisktaError extends Error {
    readonly statusCode: number | undefined;
    constructor(message: string, statusCode?: number);
}
/** Invalid or missing API key (HTTP 401). */
export declare class AuthError extends JisktaError {
    constructor(message?: string, statusCode?: number);
}
/** Not enough credits to complete the query (HTTP 402). */
export declare class InsufficientCreditsError extends JisktaError {
    constructor(message?: string, statusCode?: number);
}
/** Server is overloaded — retry after backoff (HTTP 429). */
export declare class RateLimitError extends JisktaError {
    constructor(message?: string, statusCode?: number);
}
//# sourceMappingURL=errors.d.ts.map