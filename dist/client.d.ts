export type CamsVariable = "no2" | "pm2p5" | "pm10" | "o3";
export type Era5Variable = "t2m" | "u10" | "v10" | "blh" | "tp" | "wind_speed" | "wind_dir";
/** All queryable variables including VIIRS, GHSL, MODIS and ODIAC datasets. */
export type Variable = CamsVariable | Era5Variable | "viirs_radiance" | "ghsl_pop" | "ghsl_built" | "ghsl_built_nres" | "modis_urban" | "odiac_co2";
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
/** Full result from a query call: rows + billing metadata + optional divergence. */
export interface QueryResult {
    rows: Row[];
    meta: QueryMeta;
    /**
     * Satellite-vs-self-reported divergence signal.
     * Present only when `facilityId` + `aggregate: "trend"` + `variables: ["no2"|"pm2p5"|"pm10"]`
     * are all used together. `null` if the API did not return a divergence block.
     */
    divergence: DivergenceResult | null;
}
export interface QueryOptions {
    /** ``[lat_min, lat_max]`` bounding box or single number for point query. Omit when using ``area``. */
    lat?: number | [number, number];
    /** ``[lon_min, lon_max]`` bounding box or single number for point query. Omit when using ``area``. */
    lon?: number | [number, number];
    /** Named area shortcut (e.g. ``"paris"``, ``"belgium"``, ``"france"``). Replaces lat/lon. */
    area?: string;
    /**
     * E-PRTR facility ID (`inspire_hash` as string or number).
     * When provided, the query is snapped to the facility's location.
     * Combine with `aggregate: "trend"` to get the `divergence` signal in the result.
     * Use `client.facilities()` to look up IDs.
     */
    facilityId?: string | number;
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
    /** Omit the CSV header row. */
    noHeader?: boolean;
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
/** Result of an enrich() call — NUTS3 region metadata and optional scores for a point. */
export interface EnrichResult {
    status: string;
    nuts3_id?: string;
    nuts3_name?: string;
    country?: string;
    lat: number;
    lon: number;
    /** WRI Aqueduct 4.0 water risk scores (when server is configured with WATER_STRESS_INDEX). */
    water_stress?: {
        bws: number | null;
        bws_label: string;
        bwd: number | null;
        bwd_label: string;
        rfr: number | null;
        rfr_label: string;
        drr: number | null;
        drr_label: string;
        source: string;
    };
    /** Nearest E-PRTR industrial facility within 5 km (when EPRTR_DIR is configured). */
    nearest_facility?: {
        inspire_hash: number;
        name: string;
        country: string;
        sector: string;
        lat: number;
        lon: number;
        distance_km: number;
    };
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
    /** Bounding box lat extent. Optional when `area` is provided. */
    lat_min?: number;
    lat_max?: number;
    /** Bounding box lon extent. Optional when `area` is provided. */
    lon_min?: number;
    lon_max?: number;
    /**
     * Named area shortcut (e.g. `"paris"`, `"france"`, `"india"`).
     * Also accepts OSM relation IDs: `"osm:71525"`.
     * Replaces lat_min/lat_max/lon_min/lon_max when provided.
     */
    area?: string;
    /** Start date — "YYYY-MM-DD" or "YYYY-MM". */
    start: string;
    /** End date — "YYYY-MM-DD" or "YYYY-MM". */
    end: string;
    /**
     * Raster datasets to load. Each entry has:
     * - `name`: your alias (used in compute ops)
     * - `source`: one of `cams_no2`, `cams_pm2p5`, `cams_pm10`, `cams_o3`,
     *   `era5_t2m`, `era5_blh`, `era5_tp`, `era5_u10`, `era5_v10`,
     *   `viirs_radiance`,
     *   `wb_gdp_usd`, `wb_gdp_per_capita`, `wb_gdp_growth`, `wb_inflation_cpi`,
     *   `wb_co2_per_capita`, `wb_population`, `wb_exports_pct`, `wb_urban_pct`
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
    /**
     * If true, run one query per calendar year in [start, end] and return
     * a year-indexed result. Defaults to CSV output when true.
     */
    per_year?: boolean;
    /** Output format: "json" (default) | "csv" | "geojson". */
    output_format?: "json" | "csv" | "geojson";
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
/** Options for areas(). At least one of q, bbox, id, or osm must be provided. */
export interface AreasOptions {
    /** Name search (e.g. `"paris"`). Returns first match. */
    q?: string;
    /** `[lat_min, lat_max, lon_min, lon_max]` — returns up to 50 overlapping areas. */
    bbox?: [number, number, number, number];
    /** Direct area ID lookup. */
    id?: number;
    /** OSM relation ID lookup (e.g. `54094` for Paris). */
    osm?: number;
}
/** A single area entry from areas(). */
export interface AreaEntry {
    id: number;
    name: string;
    admin_level: number;
    parent: string;
    osm_id: number;
    lat_min: number;
    lat_max: number;
    lon_min: number;
    lon_max: number;
}
/** Result from areas(). */
export interface AreasResult {
    status: string;
    source: string;
    count: number;
    areas: AreaEntry[];
}
/** Result from coverage(). */
export interface CoverageResult {
    status: string;
    validated_lag_months?: number;
    interim_lag_months?: number;
    coverage: Record<string, Record<string, {
        type: string;
        downloaded_at: string;
        size_mb: number;
    }>>;
}
/** Result of a redeem() call. */
export interface RedeemResult {
    credits_added: number;
    credits_remaining: number;
    description: string;
}
/** One year of reported emissions for a facility. */
export interface FacilityEmissionYear {
    year: number;
    total_kg: number;
}
/** Divergence signal: CAMS satellite trend vs E-PRTR self-reported emissions. */
export interface DivergenceResult {
    /** CAMS trend slope in µg/m³/year (r²-weighted mean over grid cells). */
    cams_slope: number;
    /** CAMS regression r² — strength of the satellite trend. */
    cams_r2: number;
    /** E-PRTR OLS slope in kg/year. */
    eprtr_slope: number;
    /** E-PRTR pollutant matched: "nox" | "pm25" | "pm10". */
    eprtr_pollutant: string;
    /** E-PRTR regression r² — strength of the self-reported trend. */
    eprtr_r2: number;
    /**
     * Divergence direction:
     * - `consistent`        — both signals trend the same way.
     * - `overstated`        — CAMS↓ but E-PRTR↑ (satellite sees improvement, company reports growth).
     * - `understated`       — CAMS↑ but E-PRTR↓ (satellite sees worsening, company reports improvement).
     * - `insufficient_data` — r² < 0.1 or fewer than 5 E-PRTR years in window.
     */
    direction: "consistent" | "overstated" | "understated" | "insufficient_data";
    /** Confidence score = sqrt(cams_r2 × eprtr_r2). Range 0–1. */
    score: number;
}
/** A single E-PRTR industrial facility. */
export interface FacilityResult {
    inspire_hash: number;
    name: string;
    country: string;
    lat: number;
    lon: number;
    sector: string;
    /** Annual NOₓ emissions. Present when `emissions=true`. */
    nox_kg?: FacilityEmissionYear[];
    /** Annual PM10 emissions. Present when `emissions=true`. */
    pm10_kg?: FacilityEmissionYear[];
    /** Annual PM2.5 emissions. Present when `emissions=true`. */
    pm25_kg?: FacilityEmissionYear[];
    /** Annual CO₂ emissions. Present when `emissions=true`. */
    co2_kg?: FacilityEmissionYear[];
}
/** Options for facilities(). At least one search criterion must be provided. */
export interface FacilitiesOptions {
    /** Centre latitude for radius search. Requires `lon` and `radiusKm`. */
    lat?: number;
    /** Centre longitude for radius search. Requires `lat` and `radiusKm`. */
    lon?: number;
    /** Search radius in km around lat/lon. Max 500. */
    radiusKm?: number;
    /** Bounding box search. */
    latMin?: number;
    latMax?: number;
    lonMin?: number;
    lonMax?: number;
    /** Name substring search (e.g. `"arcelormittal"`). */
    q?: string;
    /** ISO-2 country filter (e.g. `"BE"`). Optional alongside `q`. */
    country?: string;
    /** PRTR sector substring filter (e.g. `"metals"`). */
    sector?: string;
    /** Direct lookup by `inspire_hash`. */
    id?: string | number;
    /** Include annual emission series (`nox_kg`, `pm10_kg`, etc.). Default: false. */
    emissions?: boolean;
    /** Maximum number of facilities to return. */
    max?: number;
}
/** Options for waterRisk(). */
export interface WaterRiskOptions {
    /** Bounding box min latitude. */
    latMin: number;
    /** Bounding box max latitude. */
    latMax: number;
    /** Bounding box min longitude. */
    lonMin: number;
    /** Bounding box max longitude. */
    lonMax: number;
    /** Output format: ``"json"`` (default) or ``"csv"``. */
    format?: "json" | "csv";
    /** Include text label strings alongside scores. */
    labels?: boolean;
    /** Comma-separated indicator filter: ``"bws"``, ``"bwd"``, ``"rfr"``, ``"drr"``. */
    vars?: string;
}
/** A single 0.1° grid cell in a waterRisk() response. */
export interface WaterRiskCell {
    lat: number;
    lon: number;
    bws: number | null;
    bwd: number | null;
    rfr: number | null;
    drr: number | null;
    bws_label?: string;
    bwd_label?: string;
    rfr_label?: string;
    drr_label?: string;
}
/** Result of a waterRisk() call. */
export interface WaterRiskResult {
    status: string;
    source: string;
    n_cells: number;
    cells: WaterRiskCell[];
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
    constructor(apiKey?: string, options?: ClientOptions);
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
    enrich({ lat, lon, year }: {
        lat: number;
        lon: number;
        year?: number;
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
    link(options: LinkOptions): Promise<LinkResult | string>;
    /**
     * Search named areas for use with the `area=` query parameter.
     *
     * @example
     * ```ts
     * const result = await client.areas({ q: "paris" });
     * console.log(result.areas[0]); // { id: 123, name: "Paris", ... }
     * ```
     */
    areas(options: AreasOptions): Promise<AreasResult>;
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
    coverage(): Promise<CoverageResult>;
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
    redeem(code: string): Promise<RedeemResult>;
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
    facilities(options: FacilitiesOptions): Promise<FacilityResult[]>;
    /**
     * Check API server health. No authentication required.
     *
     * @example
     * ```ts
     * const { status } = await client.health();
     * console.log(status); // "healthy"
     * ```
     */
    health(): Promise<{
        status: string;
        auth_enabled: boolean;
    }>;
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
    waterRisk(options: WaterRiskOptions): Promise<WaterRiskResult>;
    private _get;
    private _post;
}
//# sourceMappingURL=client.d.ts.map