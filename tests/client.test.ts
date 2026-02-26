/**
 * Tests for JisktaClient — mirrors tests/test_client.py from jiskta-python.
 * Uses nock to intercept HTTP requests without making real network calls.
 */

import nock from "nock";
import {
  JisktaClient,
  JisktaError,
  AuthError,
  InsufficientCreditsError,
  RateLimitError,
} from "../src/index.js";

const API = "https://api.jiskta.com";
const KEY = "sk_live_test";

const NO2_CSV =
  "lat,lon,date,no2_mean\n48.75,2.25,2023-01-01,12.3\n48.75,2.25,2023-01-02,11.1\n";
const MULTI_CSV =
  "lat,lon,date,no2_mean,pm2p5_mean\n48.75,2.25,2023-01-01,12.3,8.1\n48.75,2.25,2023-01-02,11.1,7.4\n";
const ERA5_CSV =
  "lat,lon,date,t2m_mean\n48.75,2.25,2023-01-01,278.5\n48.75,2.25,2023-01-02,279.1\n";
const CROSS_CSV =
  "lat,lon,date,no2_mean,t2m_mean\n48.75,2.25,2023-01-01,12.3,278.5\n48.75,2.25,2023-01-02,11.1,279.1\n";

function successReply(csv: string, credits = 1) {
  return { status: "success", output: csv, credits_used: credits, credits_remaining: 999 };
}

afterEach(() => nock.cleanAll());

// ── Basic query behaviour ─────────────────────────────────────────────────────

test("query returns array of row objects", async () => {
  nock(API).get("/api/v1/climate/query").query(true).reply(200, successReply(NO2_CSV));
  const client = new JisktaClient(KEY);
  const { rows } = await client.query({
    lat: [48.7, 49.0],
    lon: [2.2, 2.5],
    start: "2023-01",
    end: "2023-01",
  });
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveProperty("no2_mean", 12.3);
});

test("query returns meta with credits_remaining", async () => {
  nock(API).get("/api/v1/climate/query").query(true).reply(200, successReply(NO2_CSV, 3));
  const { rows, meta } = await new JisktaClient(KEY).query({
    lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01",
  });
  expect(rows).toHaveLength(2);
  expect(meta.credits_used).toBe(3);
  expect(meta.credits_remaining).toBe(999);
});

test("query sends variables= param (not pollutants=)", async () => {
  let capturedQuery: Record<string, string> = {};
  nock(API)
    .get("/api/v1/climate/query")
    .query((q) => { capturedQuery = q as Record<string, string>; return true; })
    .reply(200, successReply(NO2_CSV));

  const client = new JisktaClient(KEY);
  await client.query({ lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01", variables: ["no2"] });

  expect(capturedQuery.variables).toBe("no2");
  expect(capturedQuery.pollutants).toBeUndefined();
});

test("query default variable is no2", async () => {
  let capturedQuery: Record<string, string> = {};
  nock(API)
    .get("/api/v1/climate/query")
    .query((q) => { capturedQuery = q as Record<string, string>; return true; })
    .reply(200, successReply(NO2_CSV));

  await new JisktaClient(KEY).query({ lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01" });
  expect(capturedQuery.variables).toBe("no2");
});

test("empty output returns empty array", async () => {
  nock(API).get("/api/v1/climate/query").query(true)
    .reply(200, { status: "success", output: "", credits_used: 1, credits_remaining: 998 });
  const { rows } = await new JisktaClient(KEY).query({ lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01" });
  expect(rows).toHaveLength(0);
});

// ── Point query ───────────────────────────────────────────────────────────────

test("point query sends lat=/lon= params instead of bbox", async () => {
  let capturedQuery: Record<string, string> = {};
  nock(API)
    .get("/api/v1/climate/query")
    .query((q) => { capturedQuery = q as Record<string, string>; return true; })
    .reply(200, successReply(NO2_CSV));

  await new JisktaClient(KEY).query({ lat: 48.85, lon: 2.35, start: "2023-01", end: "2023-01" });

  expect(capturedQuery.lat).toBe("48.85");
  expect(capturedQuery.lon).toBe("2.35");
  expect(capturedQuery.lat_min).toBeUndefined();
  expect(capturedQuery.lat_max).toBeUndefined();
});

// ── Multi-variable (columnar) output ─────────────────────────────────────────

test("two CAMS variables return columnar rows with two value columns", async () => {
  let capturedQuery: Record<string, string> = {};
  nock(API)
    .get("/api/v1/climate/query")
    .query((q) => { capturedQuery = q as Record<string, string>; return true; })
    .reply(200, successReply(MULTI_CSV, 2));

  const { rows } = await new JisktaClient(KEY).query({
    lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01",
    variables: ["no2", "pm2p5"],
  });

  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveProperty("no2_mean");
  expect(rows[0]).toHaveProperty("pm2p5_mean");
  expect(capturedQuery.variables).toBe("no2,pm2p5");
});

test("ERA5 variable query returns t2m_mean column", async () => {
  let capturedQuery: Record<string, string> = {};
  nock(API)
    .get("/api/v1/climate/query")
    .query((q) => { capturedQuery = q as Record<string, string>; return true; })
    .reply(200, successReply(ERA5_CSV));

  const { rows } = await new JisktaClient(KEY).query({
    lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01",
    variables: ["t2m"],
  });

  expect(rows[0]).toHaveProperty("t2m_mean", 278.5);
  expect(capturedQuery.variables).toBe("t2m");
});

test("cross-dataset CAMS + ERA5 variables return columnar output", async () => {
  nock(API).get("/api/v1/climate/query").query(true).reply(200, successReply(CROSS_CSV, 2));
  const { rows } = await new JisktaClient(KEY).query({
    lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01",
    variables: ["no2", "t2m"],
  });
  expect(rows[0]).toHaveProperty("no2_mean");
  expect(rows[0]).toHaveProperty("t2m_mean");
});

test("multiple ERA5 variables sent comma-separated", async () => {
  let capturedQuery: Record<string, string> = {};
  nock(API)
    .get("/api/v1/climate/query")
    .query((q) => { capturedQuery = q as Record<string, string>; return true; })
    .reply(200, successReply("lat,lon,date,u10_mean,v10_mean\n48.75,2.25,2023-01-01,2.1,-0.5\n", 2));

  const { rows } = await new JisktaClient(KEY).query({
    lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01",
    variables: ["u10", "v10"],
  });
  expect(rows[0]).toHaveProperty("u10_mean", 2.1);
  expect(capturedQuery.variables).toBe("u10,v10");
});

// ── stats() ───────────────────────────────────────────────────────────────────

test("stats() returns raw API response object", async () => {
  nock(API).get("/api/v1/climate/query").query(true)
    .reply(200, { status: "success", output: "Rows matched: 744\nMin: 5.2\nMax: 38.1\nAverage: 14.3" });
  const result = await new JisktaClient(KEY).stats({
    lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01",
  });
  expect(result.status).toBe("success");
});

test("stats() sends format=stats", async () => {
  let capturedQuery: Record<string, string> = {};
  nock(API)
    .get("/api/v1/climate/query")
    .query((q) => { capturedQuery = q as Record<string, string>; return true; })
    .reply(200, { status: "success", output: "Rows matched: 100" });

  await new JisktaClient(KEY).stats({ lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01" });
  expect(capturedQuery.format).toBe("stats");
  expect(capturedQuery.pollutants).toBeUndefined();
});

test("stats() sends variables= not pollutants=", async () => {
  let capturedQuery: Record<string, string> = {};
  nock(API)
    .get("/api/v1/climate/query")
    .query((q) => { capturedQuery = q as Record<string, string>; return true; })
    .reply(200, { status: "success", output: "Rows matched: 100" });

  await new JisktaClient(KEY).stats({
    lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01", variables: ["pm2p5"],
  });
  expect(capturedQuery.variables).toBe("pm2p5");
  expect(capturedQuery.pollutants).toBeUndefined();
});

// ── Threshold / percentile query modes ───────────────────────────────────────

test("threshold query sets aggregate=exceedance", async () => {
  let capturedQuery: Record<string, string> = {};
  nock(API)
    .get("/api/v1/climate/query")
    .query((q) => { capturedQuery = q as Record<string, string>; return true; })
    .reply(200, successReply("lat,lon,hours_above,total_hours,pct_above\n48.75,2.25,12,744,1.6\n"));

  const { rows } = await new JisktaClient(KEY).query({
    lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01",
    variables: ["no2"], threshold: 40.0,
  });
  expect(rows[0]).toHaveProperty("hours_above", 12);
  expect(capturedQuery.aggregate).toBe("exceedance");
  expect(capturedQuery.threshold).toBe("40");
});

test("percentile query sets aggregate=percentile", async () => {
  let capturedQuery: Record<string, string> = {};
  nock(API)
    .get("/api/v1/climate/query")
    .query((q) => { capturedQuery = q as Record<string, string>; return true; })
    .reply(200, successReply("lat,lon,p95\n48.75,2.25,28.4\n"));

  await new JisktaClient(KEY).query({
    lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-12",
    variables: ["no2"], percentile: 95,
  });
  expect(capturedQuery.aggregate).toBe("percentile");
  expect(capturedQuery.percentile).toBe("95");
});

// ── Error handling ────────────────────────────────────────────────────────────

test("HTTP 401 throws AuthError", async () => {
  nock(API).get("/api/v1/climate/query").query(true).reply(401, { error: "invalid key" });
  await expect(
    new JisktaClient(KEY).query({ lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01" })
  ).rejects.toBeInstanceOf(AuthError);
});

test("HTTP 402 throws InsufficientCreditsError", async () => {
  nock(API).get("/api/v1/climate/query").query(true).reply(402, { error: "no credits" });
  await expect(
    new JisktaClient(KEY).query({ lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01" })
  ).rejects.toBeInstanceOf(InsufficientCreditsError);
});

test("HTTP 429 exhausted throws RateLimitError", async () => {
  nock(API).get("/api/v1/climate/query").query(true).reply(429, {}).persist();
  const client = new JisktaClient(KEY, { maxRetries: 0 });
  await expect(
    client.query({ lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01" })
  ).rejects.toBeInstanceOf(RateLimitError);
});

test("non-JSON response throws JisktaError", async () => {
  nock(API).get("/api/v1/climate/query").query(true).reply(500, "Internal Server Error", { "content-type": "text/plain" });
  await expect(
    new JisktaClient(KEY).query({ lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01" })
  ).rejects.toBeInstanceOf(JisktaError);
});

test("missing apiKey throws Error", () => {
  expect(() => new JisktaClient("")).toThrow("apiKey is required");
});

test("credits() returns a number", async () => {
  nock(API).get("/api/v1/climate/query").query(true).reply(200, {
    status: "success",
    credits_used: 1,
    credits_remaining: 6492,
    tiles_scanned: 1,
    query_time_ms: 5,
    format: "stats",
    output: "Rows matched: 0\nMin: n/a\nMax: n/a\nAverage: n/a",
  });
  const balance = await new JisktaClient(KEY).credits();
  expect(typeof balance).toBe("number");
  expect(balance).toBe(6492);
});

// ── CSV parsing edge cases ────────────────────────────────────────────────────

test("numeric columns are parsed as numbers, string columns stay as strings", async () => {
  const csv = "lat,lon,year_month,no2_mean\n48.75,2.25,2023-01,14.5\n";
  nock(API).get("/api/v1/climate/query").query(true).reply(200, successReply(csv));
  const { rows } = await new JisktaClient(KEY).query({ lat: [48.7, 49.0], lon: [2.2, 2.5], start: "2023-01", end: "2023-01", aggregate: "monthly" });
  expect(typeof rows[0].lat).toBe("number");
  expect(typeof rows[0].year_month).toBe("string");
  expect(rows[0].no2_mean).toBeCloseTo(14.5);
});
