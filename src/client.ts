import https from "https";
import http from "http";
import { URL } from "url";
import {
  AuthError,
  InsufficientCreditsError,
  JisktaError,
  RateLimitError,
} from "./errors.js";

const DEFAULT_BASE_URL = "https://api.jiskta.com";

export type CamsVariable = "no2" | "pm2p5" | "pm10" | "o3";
export type Era5Variable = "t2m" | "u10" | "v10" | "blh" | "tp" | "wind_speed" | "wind_dir";
export type Variable = CamsVariable | Era5Variable;

export type Aggregate =
  | "hourly"
  | "daily"
  | "monthly"
  | "annual"
  | "area_hourly"
  | "area_daily"
  | "area_monthly"
  | "diurnal"
  | "exceedance"
  | "percentile"
  | "seasonal"
  | "trend"
  | "max"
  | "min"
  | "cumulative"
  | "stddev";

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
export class JisktaClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(apiKey: string, options: ClientOptions = {}) {
    if (!apiKey) throw new Error("apiKey is required");
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeout = options.timeout ?? 60_000;
    this.maxRetries = options.maxRetries ?? 3;
  }

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
  async query(options: QueryOptions): Promise<QueryResult> {
    const {
      lat, lon, area,
      start, end,
      variables = ["no2"],
      aggregate = "daily",
      threshold, percentile,
      sortBy, sortDir, unit, round, dryRun, missingNull, includePolygon,
    } = options;

    if (!area && lat === undefined) throw new Error("Either lat/lon or area is required");

    const params: Record<string, string> = {
      time_start: start,
      time_end: end,
      variables: variables.join(","),
      format: "csv",
      aggregate,
    };

    if (area) {
      params.area = area;
    } else if (typeof lat === "number" && typeof lon === "number") {
      // Point query — API snaps to nearest grid cell
      params.lat = String(lat);
      params.lon = String(lon as number);
    } else {
      const [latMin, latMax] = lat as [number, number];
      const [lonMin, lonMax] = lon as [number, number];
      params.lat_min = String(latMin);
      params.lat_max = String(latMax);
      params.lon_min = String(lonMin);
      params.lon_max = String(lonMax);
    }

    if (threshold !== undefined) { params.threshold = String(threshold); params.aggregate = "exceedance"; }
    if (percentile !== undefined) { params.percentile = String(percentile); params.aggregate = "percentile"; }
    if (sortBy) params.sort_by = sortBy;
    if (sortDir) params.sort_dir = sortDir;
    if (unit) params.unit = unit;
    if (round !== undefined) params.round = String(round);
    if (dryRun) params.dry_run = "true";
    if (missingNull) params.missing = "null";
    if (includePolygon) params.include_polygon = "true";

    const data = await this._get("/api/v1/climate/query", params);
    const csv = (data.output as string | undefined) ?? "";
    const rows = csv.trim() ? parseCsv(csv) : [];
    const meta: QueryMeta = {
      credits_used:      Number(data.credits_used      ?? 0),
      credits_remaining: Number(data.credits_remaining ?? 0),
      tiles_scanned:     Number(data.tiles_scanned     ?? 0),
      query_time_ms:     Number(data.query_time_ms     ?? 0),
    };
    return { rows, meta };
  }

  /**
   * Return raw summary statistics without parsing rows.
   * Uses `format=stats` — cheapest format, no CSV output.
   */
  async stats(options: StatsOptions): Promise<Record<string, unknown>> {
    const { lat, lon, area, start, end, variables = ["no2"] } = options;
    if (!area && !lat) throw new Error("Either lat/lon or area is required");

    const params: Record<string, string> = {
      time_start: start,
      time_end: end,
      variables: variables.join(","),
      format: "stats",
    };

    if (area) {
      params.area = area;
    } else {
      const [latMin, latMax] = lat!;
      const [lonMin, lonMax] = lon!;
      params.lat_min = String(latMin);
      params.lat_max = String(latMax);
      params.lon_min = String(lonMin);
      params.lon_max = String(lonMax);
    }

    return this._get("/api/v1/climate/query", params);
  }

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
  async queryWithMask(options: QueryWithMaskOptions): Promise<QueryResult> {
    const {
      lat_min, lat_max, lon_min, lon_max,
      start, end,
      variables = ["no2"],
      aggregate = "daily",
      mask,
      threshold, percentile,
      sortBy, sortDir, unit, round, missingNull,
    } = options;

    const body: Record<string, unknown> = {
      lat_min, lat_max, lon_min, lon_max,
      time_start: start,
      time_end: end,
      variables: variables.join(","),
      format: "csv",
      aggregate,
      mask,
    };

    if (threshold !== undefined) { body.threshold = threshold; body.aggregate = "exceedance"; }
    if (percentile !== undefined) { body.percentile = percentile; body.aggregate = "percentile"; }
    if (sortBy) body.sort_by = sortBy;
    if (sortDir) body.sort_dir = sortDir;
    if (unit) body.unit = unit;
    if (round !== undefined) body.round = round;
    if (missingNull) body.missing = "null";

    const data = await this._post("/api/v1/climate/query", body);
    const csv = (data.output as string | undefined) ?? "";
    const rows = csv.trim() ? parseCsv(csv) : [];
    const meta: QueryMeta = {
      credits_used:      Number(data.credits_used      ?? 0),
      credits_remaining: Number(data.credits_remaining ?? 0),
      tiles_scanned:     Number(data.tiles_scanned     ?? 0),
      query_time_ms:     Number(data.query_time_ms     ?? 0),
    };
    return { rows, meta };
  }

  /**
   * Return current credit balance with a minimal stats call (costs 0 credits
   * if the query matches no tiles — pass a tiny 1°×1° bbox that has data).
   * For production use, prefer reading `meta.credits_remaining` from `query()`.
   */
  async credits(): Promise<number> {
    const data = await this.stats({
      lat: [48.8, 48.9],
      lon: [2.3, 2.4],
      start: "2023-01",
      end: "2023-01",
      variables: ["no2"],
    });
    return Number(data.credits_remaining ?? 0);
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private async _get(
    path: string,
    params: Record<string, string>
  ): Promise<Record<string, unknown>> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    let delay = 500;
    let lastErr: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(delay);
      delay *= 2;

      let responseBody: string;
      let statusCode: number;

      try {
        ({ body: responseBody, statusCode } = await httpGet(
          url.toString(),
          { "X-API-Key": this.apiKey },
          this.timeout
        ));
      } catch (err) {
        lastErr = err as Error;
        if (attempt < this.maxRetries) continue;
        throw new JisktaError(`Network error: ${(err as Error).message}`);
      }

      if (statusCode === 429) {
        if (attempt < this.maxRetries) continue;
        throw new RateLimitError("Server is busy; retry later.", 429);
      }
      if (statusCode === 401) throw new AuthError("Invalid API key.", 401);
      if (statusCode === 402)
        throw new InsufficientCreditsError(
          "Insufficient credits. Buy more at https://jiskta.com/pricing",
          402
        );

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(responseBody) as Record<string, unknown>;
      } catch {
        throw new JisktaError(`Non-JSON response (${statusCode}): ${responseBody.slice(0, 200)}`);
      }

      if (statusCode !== 200) {
        const msg =
          (data.error as string) ||
          (data.message as string) ||
          responseBody.slice(0, 200);
        throw new JisktaError(msg, statusCode);
      }

      return data;
    }

    throw new JisktaError("Max retries exceeded", undefined);
  }

  private async _post(
    path: string,
    body: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const url = this.baseUrl + path;
    const bodyStr = JSON.stringify(body);
    let delay = 500;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) await sleep(delay);
      delay *= 2;

      let responseBody: string;
      let statusCode: number;

      try {
        ({ body: responseBody, statusCode } = await httpPost(
          url, bodyStr,
          { "X-API-Key": this.apiKey, "Content-Type": "application/json" },
          this.timeout
        ));
      } catch (err) {
        if (attempt < this.maxRetries) continue;
        throw new JisktaError(`Network error: ${(err as Error).message}`);
      }

      if (statusCode === 429) { if (attempt < this.maxRetries) continue; throw new RateLimitError("Server is busy; retry later.", 429); }
      if (statusCode === 401) throw new AuthError("Invalid API key.", 401);
      if (statusCode === 402) throw new InsufficientCreditsError("Insufficient credits.", 402);

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(responseBody) as Record<string, unknown>;
      } catch {
        throw new JisktaError(`Non-JSON response (${statusCode}): ${responseBody.slice(0, 200)}`);
      }

      if (statusCode !== 200) {
        const msg = (data.error as string) || (data.message as string) || responseBody.slice(0, 200);
        throw new JisktaError(msg, statusCode);
      }
      return data;
    }

    throw new JisktaError("Max retries exceeded", undefined);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface HttpResult {
  statusCode: number;
  body: string;
}

function httpGet(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;

    const req = lib.get(
      url,
      { headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
        res.on("error", reject);
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    req.on("error", reject);
  });
}

function httpPost(
  url: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;

    const req = lib.request(
      url,
      { method: "POST", headers: { ...headers, "Content-Length": Buffer.byteLength(body) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      }
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Request timed out after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/** Parse a CSV string into an array of typed row objects. */
function parseCsv(csv: string): Row[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row: Row = {};
    headers.forEach((h, i) => {
      const v = values[i] ?? "";
      const n = Number(v);
      row[h.trim()] = isNaN(n) || v.trim() === "" ? v.trim() : n;
    });
    return row;
  });
}
