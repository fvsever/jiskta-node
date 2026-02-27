/**
 * Jiskta Node.js SDK
 * ~~~~~~~~~~~~~~~~~~
 *
 * Simple client for the Jiskta Climate Data API.
 * https://jiskta.com/docs
 *
 * @example
 * ```ts
 * import { JisktaClient } from "jiskta";
 *
 * const client = new JisktaClient("sk_live_...");
 *
 * const { rows, meta } = await client.query({
 *   lat: [48.0, 49.0],
 *   lon: [2.0, 3.0],
 *   start: "2023-01",
 *   end: "2023-12",
 *   variables: ["no2", "pm2p5"],
 * });
 * console.log(rows[0]);
 * console.log(meta.credits_remaining);
 * ```
 */
export { JisktaClient } from "./client.js";
export type { ClientOptions, QueryOptions, QueryResult, QueryMeta, QueryWithMaskOptions, StatsOptions, Row, Variable, CamsVariable, Era5Variable, Aggregate, } from "./client.js";
export { JisktaError, AuthError, InsufficientCreditsError, RateLimitError, } from "./errors.js";
//# sourceMappingURL=index.d.ts.map