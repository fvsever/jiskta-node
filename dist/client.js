"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JisktaClient = void 0;
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const url_1 = require("url");
const errors_js_1 = require("./errors.js");
const DEFAULT_BASE_URL = "https://api.jiskta.com";
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
class JisktaClient {
    constructor(apiKey, options = {}) {
        if (!apiKey)
            throw new Error("apiKey is required");
        this.apiKey = apiKey;
        this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
        this.timeout = options.timeout ?? 60000;
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
    async query(options) {
        const { lat, lon, start, end, variables = ["no2"], aggregate = "daily", threshold, percentile } = options;
        const params = {
            time_start: start,
            time_end: end,
            variables: variables.join(","),
            format: "csv",
            aggregate,
        };
        if (typeof lat === "number" && typeof lon === "number") {
            // Point query — API snaps to nearest grid cell
            params.lat = String(lat);
            params.lon = String(lon);
        }
        else {
            const [latMin, latMax] = lat;
            const [lonMin, lonMax] = lon;
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
        const csv = data.output ?? "";
        const rows = csv.trim() ? parseCsv(csv) : [];
        const meta = {
            credits_used: Number(data.credits_used ?? 0),
            credits_remaining: Number(data.credits_remaining ?? 0),
            tiles_scanned: Number(data.tiles_scanned ?? 0),
            query_time_ms: Number(data.query_time_ms ?? 0),
        };
        return { rows, meta };
    }
    /**
     * Return raw summary statistics without parsing rows.
     * Uses `format=stats` — cheapest format, no CSV output.
     */
    async stats(options) {
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
     * Return current credit balance with a minimal stats call (costs 0 credits
     * if the query matches no tiles — pass a tiny 1°×1° bbox that has data).
     * For production use, prefer reading `meta.credits_remaining` from `query()`.
     */
    async credits() {
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
    async _get(path, params) {
        const url = new url_1.URL(this.baseUrl + path);
        for (const [k, v] of Object.entries(params))
            url.searchParams.set(k, v);
        let delay = 500;
        let lastErr;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            if (attempt > 0)
                await sleep(delay);
            delay *= 2;
            let responseBody;
            let statusCode;
            try {
                ({ body: responseBody, statusCode } = await httpGet(url.toString(), { "X-API-Key": this.apiKey }, this.timeout));
            }
            catch (err) {
                lastErr = err;
                if (attempt < this.maxRetries)
                    continue;
                throw new errors_js_1.JisktaError(`Network error: ${err.message}`);
            }
            if (statusCode === 429) {
                if (attempt < this.maxRetries)
                    continue;
                throw new errors_js_1.RateLimitError("Server is busy; retry later.", 429);
            }
            if (statusCode === 401)
                throw new errors_js_1.AuthError("Invalid API key.", 401);
            if (statusCode === 402)
                throw new errors_js_1.InsufficientCreditsError("Insufficient credits. Buy more at https://jiskta.com/pricing", 402);
            let data;
            try {
                data = JSON.parse(responseBody);
            }
            catch {
                throw new errors_js_1.JisktaError(`Non-JSON response (${statusCode}): ${responseBody.slice(0, 200)}`);
            }
            if (statusCode !== 200) {
                const msg = data.error ||
                    data.message ||
                    responseBody.slice(0, 200);
                throw new errors_js_1.JisktaError(msg, statusCode);
            }
            return data;
        }
        throw new errors_js_1.JisktaError("Max retries exceeded", undefined);
    }
}
exports.JisktaClient = JisktaClient;
// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function httpGet(url, headers, timeoutMs) {
    return new Promise((resolve, reject) => {
        const parsed = new url_1.URL(url);
        const lib = parsed.protocol === "https:" ? https_1.default : http_1.default;
        const req = lib.get(url, { headers }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                resolve({
                    statusCode: res.statusCode ?? 0,
                    body: Buffer.concat(chunks).toString("utf8"),
                });
            });
            res.on("error", reject);
        });
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
        });
        req.on("error", reject);
    });
}
/** Parse a CSV string into an array of typed row objects. */
function parseCsv(csv) {
    const lines = csv.trim().split("\n");
    if (lines.length < 2)
        return [];
    const headers = lines[0].split(",");
    return lines.slice(1).map((line) => {
        const values = line.split(",");
        const row = {};
        headers.forEach((h, i) => {
            const v = values[i] ?? "";
            const n = Number(v);
            row[h.trim()] = isNaN(n) || v.trim() === "" ? v.trim() : n;
        });
        return row;
    });
}
//# sourceMappingURL=client.js.map