export type CamsVariable = "no2" | "pm2p5" | "pm10" | "o3";
export type Era5Variable = "t2m" | "u10" | "v10" | "blh" | "tp";
export type Variable = CamsVariable | Era5Variable;
export type Aggregate = "hourly" | "daily" | "monthly" | "annual" | "area_hourly" | "area_daily" | "area_monthly" | "diurnal" | "exceedance" | "percentile";
/** A row from a CSV query result — keys depend on aggregate mode and variables. */
export type Row = Record<string, string | number>;
/** Metadata returned alongside query rows. */
export interface QueryMeta {
    credits_used: number;
    credits_remaining: number;
    tiles_scanned: number;
    query_time_ms: number;
}
/** Full result from a query call: rows + billing metadata. */
export interface QueryResult {
    rows: Row[];
    meta: QueryMeta;
}
export interface QueryOptions {
    /** ``[lat_min, lat_max]`` bounding box or a single number for a point query. */
    lat: number | [number, number];
    /** ``[lon_min, lon_max]`` bounding box or a single number for a point query. */
    lon: number | [number, number];
    /** Start date — ``"YYYY-MM-DD"`` or ``"YYYY-MM"``. */
    start: string;
    /** End date — ``"YYYY-MM-DD"`` or ``"YYYY-MM"``. */
    end: string;
    /** Variable(s) to query. Default: ``["no2"]``. */
    variables?: Variable[];
    /** Temporal aggregation. Default: ``"daily"``. */
    aggregate?: Aggregate;
    /** µg/m³ threshold for exceedance mode. */
    threshold?: number;
    /** Percentile 0–100 for percentile mode. */
    percentile?: number;
}
export interface StatsOptions {
    lat: [number, number];
    lon: [number, number];
    start: string;
    end: string;
    variables?: Variable[];
}
export interface ClientOptions {
    /** Override the API base URL (useful for testing). */
    baseUrl?: string;
    /** Request timeout in milliseconds. Default: 60 000. */
    timeout?: number;
    /** Retries on HTTP 429 / transient errors. Default: 3. */
    maxRetries?: number;
}
/**
 * Client for the Jiskta Climate Data API.
 *
 * @example
 * ```ts
 * import { JisktaClient } from "jiskta";
 *
 * const client = new JisktaClient({ apiKey: "sk_live_..." });
 *
 * const rows = await client.query({
 *   lat: [48.7, 49.0],
 *   lon: [2.2, 2.5],
 *   start: "2023-01",
 *   end: "2023-12",
 *   variables: ["no2", "pm2p5"],
 *   aggregate: "daily",
 * });
 * console.log(rows[0]);
 * // { lat: 48.75, lon: 2.25, date: "2023-01-01", no2_mean: 12.3, pm2p5_mean: 8.1 }
 * ```
 */
export declare class JisktaClient {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly timeout;
    private readonly maxRetries;
    constructor(apiKey: string, options?: ClientOptions);
    /**
     * Query climate data and return rows with billing metadata in one call.
     *
     * ```ts
     * const { rows, meta } = await client.query({ ... });
     * console.log(rows[0]);
     * // { lat: 48.85, lon: 2.35, year_month: "2023-01", no2_mean: 12.3 }
     * console.log(meta.credits_remaining); // e.g. 6492
     * ```
     *
     * Columns vary by aggregate mode:
     * - `daily`      → `{ lat, lon, date, no2_mean, … }`
     * - `monthly`    → `{ lat, lon, year_month, no2_mean, … }`
     * - `exceedance` → `{ lat, lon, hours_above, total_hours, pct_above }`
     *
     * @throws {AuthError} Invalid API key.
     * @throws {InsufficientCreditsError} Not enough credits.
     * @throws {RateLimitError} Server overloaded; retry after backoff.
     * @throws {JisktaError} Any other API error.
     */
    query(options: QueryOptions): Promise<QueryResult>;
    /**
     * Return raw summary statistics without parsing rows.
     * Uses `format=stats` — cheapest format, no CSV output.
     */
    stats(options: StatsOptions): Promise<Record<string, unknown>>;
    /**
     * Return current credit balance with a minimal stats call (costs 0 credits
     * if the query matches no tiles — pass a tiny 1°×1° bbox that has data).
     * For production use, prefer reading `meta.credits_remaining` from `query()`.
     */
    credits(): Promise<number>;
    private _get;
}
//# sourceMappingURL=client.d.ts.map