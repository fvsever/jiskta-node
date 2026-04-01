# jiskta

Node.js SDK for the [Jiskta Climate Data API](https://jiskta.com) — query historical air quality data (NO₂, PM2.5, PM10, O₃) and ERA5 meteorological data via a simple async interface.

## Install

```bash
npm install jiskta
```

No runtime dependencies — uses Node.js built-in `https`.

## Authentication

Get your API key from [jiskta.com/dashboard](https://jiskta.com/dashboard). You can pass it directly or set the `JISKTA_API_KEY` environment variable:

```bash
export JISKTA_API_KEY="sk_live_..."
```

```ts
import { JisktaClient } from "jiskta";

// From env var (recommended):
const client = new JisktaClient();

// Or explicitly:
const client = new JisktaClient("sk_live_...");
```

## Quick start

```ts
import { JisktaClient } from "jiskta";

const client = new JisktaClient(); // reads JISKTA_API_KEY env var

// Daily NO₂ and PM2.5 over Paris in 2023
const { rows } = await client.query({
  lat: [48.7, 49.0],
  lon: [2.2, 2.5],
  start: "2023-01",
  end: "2023-12",
  variables: ["no2", "pm2p5"],
  aggregate: "daily",
});

console.log(rows[0]);
// { lat: 48.75, lon: 2.25, date: '2023-01-01', no2_mean: 12.34, pm2p5_mean: 8.21 }
```

CommonJS works too:

```js
const { JisktaClient } = require("jiskta");
```

## Point query

Pass a single number for `lat`/`lon` to query a single grid cell (~0.1° resolution):

```ts
const { rows } = await client.query({
  lat: 48.85,   // Central Paris — snaps to nearest 0.1° grid cell
  lon: 2.35,
  start: "2023-01",
  end: "2023-12",
  variables: ["no2"],
  aggregate: "monthly",
});
```

## All options

```ts
const { rows, meta } = await client.query({
  lat: [lat_min, lat_max],   // bounding box  OR  single number for point query
  lon: [lon_min, lon_max],
  start: "YYYY-MM-DD",       // or "YYYY-MM"
  end:   "YYYY-MM-DD",
  variables: ["no2"],        // no2 | pm2p5 | pm10 | o3 | t2m | u10 | v10 | blh | tp
  aggregate: "daily",        // hourly | daily | monthly | annual
                             // area_hourly | area_daily | area_monthly
                             // diurnal | exceedance | percentile
  threshold: 40.0,           // µg/m³  — enables exceedance mode
  percentile: 95,            // 0–100  — enables percentile mode
});
console.log(meta.credits_remaining);
```

## Summary statistics

```ts
const result = await client.stats({
  lat: [48.7, 49.0],
  lon: [2.2, 2.5],
  start: "2023-01",
  end: "2023-01",
  variables: ["no2"],
});
console.log(result.output);
// "Rows matched: 744\nMin: 5.2\nMax: 38.1\nAverage: 14.3"
```

## Exceedance query

Count hours above a threshold (e.g. WHO NO₂ guideline of 25 µg/m³):

```ts
const { rows } = await client.query({
  lat: [48.7, 49.0],
  lon: [2.2, 2.5],
  start: "2023-01",
  end: "2023-12",
  variables: ["no2"],
  threshold: 25.0,
});
// [{ lat, lon, hours_above, total_hours, pct_above }, ...]
```

## Error handling

```ts
import {
  JisktaClient,
  AuthError,
  InsufficientCreditsError,
  RateLimitError,
  JisktaError,
} from "jiskta";

try {
  const { rows } = await client.query({ ... });
} catch (err) {
  if (err instanceof AuthError) {
    console.error("Invalid API key");
  } else if (err instanceof InsufficientCreditsError) {
    console.error("Buy more credits at https://jiskta.com/pricing");
  } else if (err instanceof RateLimitError) {
    console.error("Server busy — retry later");
  } else if (err instanceof JisktaError) {
    console.error(`API error ${err.statusCode}: ${err.message}`);
  }
}
```

## Client options

```ts
const client = new JisktaClient("sk_live_...", {
  baseUrl:    "https://api.jiskta.com",  // override for testing
  timeout:    60_000,                    // ms (default: 60 000)
  maxRetries: 3,                         // retries on 429 (default: 3)
});
```

## Credits

Each query costs `geo_tiles × months × variables` credits.  
1 credit ≈ €0.0015. Buy credits at [jiskta.com/pricing](https://jiskta.com/pricing).

## License

MIT
