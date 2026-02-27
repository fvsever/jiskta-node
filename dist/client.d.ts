export type CamsVariable = "no2" | "pm2p5" | "pm10" | "o3";
export type Era5Variable = "t2m" | "u10" | "v10" | "blh" | "tp" | "wind_speed" | "wind_dir";
export type Variable = CamsVariable | Era5Variable;
export type Aggregate = "hourly" | "daily" | "monthly" | "annual" | "area_hourly" | "area_daily" | "area_monthly" | "diurnal" | "exceedance" | "percentile" | "seasonal" | "trend" | "max" | "min" | "cumulative" | "stddev";
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
    /** ``[lat_min, lat_max]`` bounding box or single number for point query. Omit when using ``area``. */
    lat?: number | [number, number];
    /** ``[lon_min, lon_max]`` bounding box or single number for point query. Omit when using ``area``. */
    lon?: number | [number, number];
    /** Named area shortcut (e.g. ``"paris"``, ``"belgium"``, ``"france"``). Replaces lat/lon. */
    area?: string;
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
    /** Sort output by this column name. */
    sortBy?: string;
    /** Sort direction. */
    sortDir?: "asc" | "desc";
    /** Unit conversion — ``"ppb"`` for NO₂/O₃ gases. */
    unit?: "ppb";
    /** Decimal places in output values (default: 4). */
    round?: number;
    /** Estimate credit cost without executing the query. */
    dryRun?: boolean;
    /** Emit empty string for cells with no data instead of omitting them. */
    missingNull?: boolean;
    /** Include GeoJSON area_polygon in response for ``area`` queries. */
    includePolygon?: boolean;
}
export interface StatsOptions {
    /** ``[lat_min, lat_max]`` bounding box. Omit when using ``area``. */
    lat?: [number, number];
    /** ``[lon_min, lon_max]`` bounding box. Omit when using ``area``. */
    lon?: [number, number];
    /** Named area shortcut (e.g. ``"paris"``, ``"belgium"``). Replaces lat/lon. */
    area?: string;
    start: string;
    end: string;
    variables?: Variable[];
}
export interface QueryWithMaskOptions {
    lat_min: number;
    lat_max: number;
    lon_min: number;
    lon_max: number;
    start: string;
    end: string;
    variables?: Variable[];
    aggregate?: Aggregate;
    /** GeoJSON Polygon or MultiPolygon geometry to mask the query area. */
    mask: Record<string, unknown>;
    threshold?: number;
    percentile?: number;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    unit?: "ppb";
    round?: number;
    missingNull?: boolean;
}
export interface ClientOptions {
    /** Override the API base URL (useful for testing). */
    baseUrl?: string;
    /** Request timeout in milliseconds. Default: 60 000. */
    timeout?: number;
    /** Retries on HTTP 429 / transient errors. Default: 3. */
    maxRetries?: number;
}
/** Result of an enrich() call — NUTS3 region metadata for a point. */
export interface EnrichResult {
    status: string;
    nuts3_id: string;
    nuts3_name: string;
    country: string;
    lat: number;
    lon: number;
}
/** A single NUTS3 unit in a link() response. */
export interface LinkUnit {
    nuts3_id: string;
    nuts3_name: string;
    country: string;
    n_cells: number;
    [dataset: string]: string | number;
}
/** Options for link(). */
export interface LinkOptions {
    /** Bounding box. */
    lat_min: number;
    lat_max: number;
    lon_min: number;
    lon_max: number;
    /** Start date — "YYYY-MM-DD" or "YYYY-MM". */
    start: string;
    /** End date — "YYYY-MM-DD" or "YYYY-MM". */
    end: string;
    /**
     * Raster datasets to load. Each entry has:
     * - `name`: your alias (used in compute ops)
     * - `source`: one of cams_no2, cams_pm2p5, cams_pm10, cams_o3,
     *   era5_t2m, era5_blh, era5_tp, era5_u10, era5_v10
     */
    datasets: Array<{
        name: string;
        source: string;
        time_range?: {
            start: string;
            end: string;
        };
    }>;
    /** Spatial resolution: "nuts3" (default) | "country" | "cell". */
    resolution?: "nuts3" | "country" | "cell";
    /**
     * Cross-dataset compute operations. Each entry:
     * - `op`: "mean" | "sum" | "min" | "max" | "count" | "pearson_r" | "top_n"
     * - `input` (or `value`): dataset name for scalar ops
     * - `x`, `y`: dataset names for pearson_r
     * - `output`: key name in response
     * - `include_n`: include sample size for pearson_r
     * - `n`, `direction`: for top_n
     */
    compute?: Array<Record<string, unknown>>;
}
/** Result of a link() call. */
export interface LinkResult {
    status: string;
    query_time_ms: number;
    credits_used: number;
    credits_remaining: number;
    n_units: number;
    spatial_resolution: string;
    n_raster_cols: number;
    units: LinkUnit[];
    /** Scalar/object results from compute ops (keys match `output` field in each op). */
    [computeOutput: string]: unknown;
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
     * Query with a GeoJSON polygon/multipolygon mask via POST.
     * Only data points inside the mask geometry are returned.
     *
     * @example
     * ```ts
     * const result = await client.queryWithMask({
     *   lat_min: 49.5, lat_max: 51.5, lon_min: 2.5, lon_max: 6.5,
     *   start: "2023-01", end: "2023-12",
     *   variables: ["no2"],
     *   aggregate: "monthly",
     *   mask: { type: "Polygon", coordinates: [[[2.5,49.5],[6.5,49.5],[6.5,51.5],[2.5,51.5],[2.5,49.5]]] },
     * });
     * ```
     */
    queryWithMask(options: QueryWithMaskOptions): Promise<QueryResult>;
    /**
     * Return current credit balance with a minimal stats call (costs 0 credits
     * if the query matches no tiles — pass a tiny 1°×1° bbox that has data).
     * For production use, prefer reading `meta.credits_remaining` from `query()`.
     */
    credits(): Promise<number>;
    /**
     * Look up the NUTS3 administrative region for a geographic point.
     *
     * @example
     * ```ts
     * const region = await client.enrich({ lat: 48.85, lon: 2.35 });
     * console.log(region.nuts3_id);   // "FR101"
     * console.log(region.nuts3_name); // "Paris"
     * ```
     *
     * @param lat  Latitude (decimal degrees, WGS-84)
     * @param lon  Longitude (decimal degrees, WGS-84)
     */
    enrich({ lat, lon }: {
        lat: number;
        lon: number;
    }): Promise<EnrichResult>;
    /**
     * Aggregate raster climate data to NUTS3 administrative regions (spatial join).
     *
     * For each NUTS3 region in the bounding box, computes the mean of each raster
     * variable across the grid cells within that region. Optionally computes
     * cross-dataset statistics (correlations, top-N, etc.) across all regions.
     *
     * @example
     * ```ts
     * const result = await client.link({
     *   lat_min: 45, lat_max: 51, lon_min: -5, lon_max: 9,
     *   start: "2022-01-01", end: "2022-12-31",
     *   datasets: [
     *     { name: "no2",  source: "cams_no2"   },
     *     { name: "pm25", source: "cams_pm2p5" },
     *   ],
     *   compute: [
     *     { op: "mean", input: "no2",  output: "no2_mean"  },
     *     { op: "pearson_r", x: "no2", y: "pm25", output: "r", include_n: true },
     *   ],
     * });
     * console.log(result.n_units);   // 255
     * console.log(result.no2_mean);  // 9.62 (µg/m³ average across all NUTS3 units)
     * console.log(result.r);         // { r: 0.553, r2: 0.306, n: 255 }
     * // Sort units by NO2 descending:
     * result.units.sort((a, b) => (b.no2 as number) - (a.no2 as number));
     * ```
     */
    link(options: LinkOptions): Promise<LinkResult>;
    private _get;
    private _post;
}
//# sourceMappingURL=client.d.ts.map