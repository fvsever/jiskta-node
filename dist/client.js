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
        const resolvedKey = apiKey ?? (typeof process !== "undefined" ? process.env.JISKTA_API_KEY : undefined) ?? "";
        if (!resolvedKey)
            throw new Error("apiKey is required (or set JISKTA_API_KEY env var)");
        this.apiKey = resolvedKey;
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
        const { lat, lon, area, facilityId, start, end, variables = ["no2"], aggregate = "daily", threshold, percentile, sortBy, sortDir, unit, round, dryRun, missingNull, noHeader, includePolygon, } = options;
        if (!area && facilityId === undefined && lat === undefined)
            throw new Error("Either lat/lon, area, or facilityId is required");
        const params = {
            time_start: start,
            time_end: end,
            variables: variables.join(","),
            format: "csv",
            aggregate,
        };
        if (area) {
            params.area = area;
        }
        else if (facilityId !== undefined) {
            params.facility_id = String(facilityId);
        }
        else if (typeof lat === "number" && typeof lon === "number") {
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
        if (sortBy)
            params.sort_by = sortBy;
        if (sortDir)
            params.sort_dir = sortDir;
        if (unit)
            params.unit = unit;
        if (round !== undefined)
            params.round = String(round);
        if (dryRun)
            params.dry_run = "true";
        if (missingNull)
            params.missing = "null";
        if (noHeader)
            params.no_header = "true";
        if (includePolygon)
            params.include_polygon = "true";
        const data = await this._get("/api/v1/climate/query", params);
        const csv = data.output ?? "";
        const rows = csv.trim() ? parseCsv(csv) : [];
        const meta = {
            credits_used: Number(data.credits_used ?? 0),
            credits_remaining: Number(data.credits_remaining ?? 0),
            tiles_scanned: Number(data.tiles_scanned ?? 0),
            query_time_ms: Number(data.query_time_ms ?? 0),
        };
        const divergence = data.divergence ?? null;
        return { rows, meta, divergence };
    }
    /**
     * Return raw summary statistics without parsing rows.
     * Uses `format=stats` — cheapest format, no CSV output.
     */
    async stats(options) {
        const { lat, lon, area, start, end, variables = ["no2"] } = options;
        if (!area && !lat)
            throw new Error("Either lat/lon or area is required");
        const params = {
            time_start: start,
            time_end: end,
            variables: variables.join(","),
            format: "stats",
        };
        if (area) {
            params.area = area;
        }
        else {
            const [latMin, latMax] = lat;
            const [lonMin, lonMax] = lon;
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
    async queryWithMask(options) {
        const { lat_min, lat_max, lon_min, lon_max, start, end, variables = ["no2"], aggregate = "daily", mask, threshold, percentile, sortBy, sortDir, unit, round, missingNull, } = options;
        const body = {
            lat_min, lat_max, lon_min, lon_max,
            time_start: start,
            time_end: end,
            variables: variables.join(","),
            format: "csv",
            aggregate,
            mask,
        };
        if (threshold !== undefined) {
            body.threshold = threshold;
            body.aggregate = "exceedance";
        }
        if (percentile !== undefined) {
            body.percentile = percentile;
            body.aggregate = "percentile";
        }
        if (sortBy)
            body.sort_by = sortBy;
        if (sortDir)
            body.sort_dir = sortDir;
        if (unit)
            body.unit = unit;
        if (round !== undefined)
            body.round = round;
        if (missingNull)
            body.missing = "null";
        const data = await this._post("/api/v1/climate/query", body);
        const csv = data.output ?? "";
        const rows = csv.trim() ? parseCsv(csv) : [];
        const meta = {
            credits_used: Number(data.credits_used ?? 0),
            credits_remaining: Number(data.credits_remaining ?? 0),
            tiles_scanned: Number(data.tiles_scanned ?? 0),
            query_time_ms: Number(data.query_time_ms ?? 0),
        };
        return { rows, meta, divergence: null };
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
    async enrich({ lat, lon, year }) {
        const params = {
            lat: String(lat),
            lon: String(lon),
        };
        if (year !== undefined)
            params.year = String(year);
        const data = await this._get("/api/v1/enrich", params);
        return data;
    }
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
    async link(options) {
        const { lat_min, lat_max, lon_min, lon_max, area, start, end, datasets, resolution = "nuts3", compute, per_year, output_format } = options;
        if (!area && (lat_min === undefined || lat_max === undefined ||
            lon_min === undefined || lon_max === undefined)) {
            throw new Error("Either area or all of lat_min/lat_max/lon_min/lon_max must be provided.");
        }
        const body = {
            time_range: { start, end },
            resolution,
            datasets,
        };
        if (area) {
            body.area = area;
        }
        else {
            body.bbox = { lat_min, lat_max, lon_min, lon_max };
        }
        if (compute?.length)
            body.compute = compute;
        if (per_year)
            body.per_year = true;
        if (output_format)
            body.output_format = output_format;
        const data = await this._post("/api/v1/link", body);
        return data;
    }
    /**
     * Search named areas for use with the `area=` query parameter.
     *
     * @example
     * ```ts
     * const result = await client.areas({ q: "paris" });
     * console.log(result.areas[0]); // { id: 123, name: "Paris", ... }
     * ```
     */
    async areas(options) {
        const params = {};
        if (options.q !== undefined) {
            params.q = options.q;
        }
        else if (options.bbox !== undefined) {
            params.bbox = options.bbox.join(",");
        }
        else if (options.id !== undefined) {
            params.id = String(options.id);
        }
        else if (options.osm !== undefined) {
            params.osm = String(options.osm);
        }
        else {
            throw new Error("One of q, bbox, id, or osm must be provided.");
        }
        const data = await this._get("/api/v1/areas", params);
        return data;
    }
    /**
     * Return live data coverage for all datasets.
     * No authentication required.
     *
     * @example
     * ```ts
     * const cov = await client.coverage();
     * console.log(cov.coverage.nitrogen_dioxide["2023-01"].type); // "reanalysis"
     * ```
     */
    async coverage() {
        const data = await this._get("/api/v1/coverage", {});
        return data;
    }
    /**
     * Redeem a voucher code to add free credits to your account.
     *
     * @example
     * ```ts
     * const result = await client.redeem("WELCOME-2025");
     * console.log(result.credits_added);     // 500
     * console.log(result.credits_remaining); // 505
     * ```
     *
     * @throws {JisktaError} 404 if code is invalid, 409 if already redeemed, 410 if expired.
     */
    async redeem(code) {
        const data = await this._post("/api/v1/redeem", { code });
        return data;
    }
    /**
     * Search E-PRTR industrial facilities.
     *
     * Returns facilities matching location, bounding box, name query, or direct ID.
     * At least one of `lat`/`lon`/`radiusKm`, bbox, `q`, or `id` must be provided.
     *
     * @example
     * ```ts
     * // Facilities within 10 km of Ghent
     * const facs = await client.facilities({ lat: 51.05, lon: 3.72, radiusKm: 10 });
     * console.log(facs[0].name); // "ArcelorMittal Belgium"
     *
     * // Name search with emissions data
     * const facs = await client.facilities({ q: "arcelormittal", country: "BE", emissions: true });
     * console.log(facs[0].nox_kg?.[0]); // { year: 2013, total_kg: 45000000 }
     *
     * // Direct lookup
     * const [fac] = await client.facilities({ id: 1986304935103026946 });
     * const { rows, meta, divergence } = await client.query({
     *   facilityId: fac.inspire_hash,
     *   start: "2015-01", end: "2023-12",
     *   variables: ["no2"], aggregate: "trend",
     * });
     * console.log(divergence?.direction); // "consistent" | "overstated" | ...
     * ```
     *
     * @throws {JisktaError} If no search criterion is provided or the API returns an error.
     */
    async facilities(options) {
        const { lat, lon, radiusKm, latMin, latMax, lonMin, lonMax, q, country, sector, id, emissions, max } = options;
        const params = {};
        if (id !== undefined) {
            params.id = String(id);
        }
        else if (lat !== undefined && lon !== undefined) {
            params.lat = String(lat);
            params.lon = String(lon);
            if (radiusKm !== undefined)
                params.radius_km = String(radiusKm);
        }
        else if (latMin !== undefined) {
            params.lat_min = String(latMin);
            params.lat_max = String(latMax);
            params.lon_min = String(lonMin);
            params.lon_max = String(lonMax);
        }
        else if (q !== undefined) {
            params.q = q;
        }
        else {
            throw new Error("Provide one of: id, lat/lon[/radiusKm], latMin/latMax/lonMin/lonMax, or q.");
        }
        if (country)
            params.country = country;
        if (sector)
            params.sector = sector;
        if (emissions)
            params.emissions = "true";
        if (max !== undefined)
            params.max = String(max);
        const data = await this._get("/api/v1/facilities", params);
        // id= mode: API returns a single facility object (not an array)
        if (!Array.isArray(data) && data && typeof data === "object" && "inspire_hash" in data) {
            return [data];
        }
        return (Array.isArray(data) ? data : (data.facilities ?? []));
    }
    // ── Utilities ────────────────────────────────────────────────────────────
    /**
     * Check API server health. No authentication required.
     *
     * @example
     * ```ts
     * const { status } = await client.health();
     * console.log(status); // "healthy"
     * ```
     */
    async health() {
        const resp = await fetch(`${this.baseUrl}/health`);
        if (!resp.ok)
            throw new errors_js_1.JisktaError(`Health check failed: ${resp.status}`, resp.status);
        return resp.json();
    }
    /**
     * Return WRI Aqueduct 4.0 water risk scores for every 0.1° cell in a bounding box.
     *
     * Covers CSRD ESRS E3-1 §27 (water stress / water depletion) and ESRS E3-3 §38
     * (riverine flood risk / drought risk). Credits: 0 (static dataset).
     *
     * Scores: 1=Low, 2=Low-Medium, 3=Medium-High, 4=High, 5=Extremely High. null=no data.
     *
     * @example
     * ```ts
     * const result = await client.waterRisk({
     *   latMin: 48, latMax: 52, lonMin: 0, lonMax: 5,
     *   labels: true,
     * });
     * console.log(result.cells[0]);
     * // { lat: 48.05, lon: 0.05, bws: 2, bws_label: "Low-Medium", ... }
     * ```
     */
    async waterRisk(options) {
        const { latMin, latMax, lonMin, lonMax, format = "json", labels, vars } = options;
        const params = {
            lat_min: String(latMin),
            lat_max: String(latMax),
            lon_min: String(lonMin),
            lon_max: String(lonMax),
            format,
        };
        if (labels)
            params.labels = "true";
        if (vars)
            params.vars = vars;
        const data = await this._get("/api/v1/water-risk", params);
        return data;
    }
    // ── Internal ─────────────────────────────────────────────────────────────
    async _get(path, params) {
        const url = new url_1.URL(this.baseUrl + path);
        for (const [k, v] of Object.entries(params))
            url.searchParams.set(k, v);
        let delay = 500;
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
    async _post(path, body) {
        const url = this.baseUrl + path;
        const bodyStr = JSON.stringify(body);
        let delay = 500;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            if (attempt > 0)
                await sleep(delay);
            delay *= 2;
            let responseBody;
            let statusCode;
            try {
                ({ body: responseBody, statusCode } = await httpPost(url, bodyStr, { "X-API-Key": this.apiKey, "Content-Type": "application/json" }, this.timeout));
            }
            catch (err) {
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
                throw new errors_js_1.InsufficientCreditsError("Insufficient credits.", 402);
            let data;
            try {
                data = JSON.parse(responseBody);
            }
            catch {
                throw new errors_js_1.JisktaError(`Non-JSON response (${statusCode}): ${responseBody.slice(0, 200)}`);
            }
            if (statusCode !== 200) {
                const msg = data.error || data.message || responseBody.slice(0, 200);
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
function httpPost(url, body, headers, timeoutMs) {
    return new Promise((resolve, reject) => {
        const parsed = new url_1.URL(url);
        const lib = parsed.protocol === "https:" ? https_1.default : http_1.default;
        const req = lib.request(url, { method: "POST", headers: { ...headers, "Content-Length": Buffer.byteLength(body) } }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
            res.on("error", reject);
        });
        req.setTimeout(timeoutMs, () => req.destroy(new Error(`Request timed out after ${timeoutMs}ms`)));
        req.on("error", reject);
        req.write(body);
        req.end();
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