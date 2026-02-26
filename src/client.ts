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
export type Era5Variable = "t2m" | "u10" | "v10" | "blh" | "tp";
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
  | "percentile";

/** A row from a CSV query result — keys depend on aggregate mode and variables. */
export type Row = Record<string, string | number>;

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
   * Query climate data and return an array of row objects.
   *
   * Columns vary by aggregate mode:
   * - `daily`  → `{ lat, lon, date, no2_mean, … }`
   * - `monthly` → `{ lat, lon, year_month, no2_mean, … }`
   * - `exceedance` → `{ lat, lon, hours_above, total_hours, pct_above }`
   *
   * @throws {AuthError} Invalid API key.
   * @throws {InsufficientCreditsError} Not enough credits.
   * @throws {RateLimitError} Server overloaded; retry after backoff.
   * @throws {JisktaError} Any other API error.
   */
  async query(options: QueryOptions): Promise<Row[]> {
    const { lat, lon, start, end, variables = ["no2"], aggregate = "daily", threshold, percentile } = options;

    const params: Record<string, string> = {
      time_start: start,
      time_end: end,
      variables: variables.join(","),
      format: "csv",
      aggregate,
    };

    if (typeof lat === "number" && typeof lon === "number") {
      // Point query — API snaps to nearest 0.1° grid cell
      params.lat = String(lat);
      params.lon = String(lon);
    } else {
      const [latMin, latMax] = lat as [number, number];
      const [lonMin, lonMax] = lon as [number, number];
      params.lat_min = String(latMin);
      params.lat_max = String(latMax);
      params.lon_min = String(lonMin);
      params.lon_max = String(lonMax);
    }

    if (threshold !== undefined) {
      params.threshold = String(threshold);
      params.aggregate = "exceedance";
    }
    if (percentile !== undefined) {
      params.percentile = String(percentile);
      params.aggregate = "percentile";
    }

    const data = await this._get("/api/v1/climate/query", params);
    const csv = (data.output as string | undefined) ?? "";
    if (!csv.trim()) return [];
    return parseCsv(csv);
  }

  /**
   * Return raw summary statistics without parsing rows.
   * Uses `format=stats` — cheapest format, no CSV output.
   */
  async stats(options: StatsOptions): Promise<Record<string, unknown>> {
    const { lat, lon, start, end, variables = ["no2"] } = options;
    const [latMin, latMax] = lat;
    const [lonMin, lonMax] = lon;
    return this._get("/api/v1/climate/query", {
      lat_min: String(latMin),
      lat_max: String(latMax),
      lon_min: String(lonMin),
      lon_max: String(lonMax),
      time_start: start,
      time_end: end,
      variables: variables.join(","),
      format: "stats",
    });
  }

  /**
   * Return current credit balance.
   * @throws {Error} Not yet implemented — check https://jiskta.com/dashboard
   */
  credits(): never {
    throw new Error(
      "A dedicated /me endpoint is not yet available. " +
        "Check your balance at https://jiskta.com/dashboard"
    );
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
