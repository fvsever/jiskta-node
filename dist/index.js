"use strict";
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
 * const rows = await client.query({
 *   lat: [48.0, 49.0],
 *   lon: [2.0, 3.0],
 *   start: "2023-01",
 *   end: "2023-12",
 *   variables: ["no2", "pm2p5"],
 * });
 * console.log(rows[0]);
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitError = exports.InsufficientCreditsError = exports.AuthError = exports.JisktaError = exports.JisktaClient = void 0;
var client_js_1 = require("./client.js");
Object.defineProperty(exports, "JisktaClient", { enumerable: true, get: function () { return client_js_1.JisktaClient; } });
var errors_js_1 = require("./errors.js");
Object.defineProperty(exports, "JisktaError", { enumerable: true, get: function () { return errors_js_1.JisktaError; } });
Object.defineProperty(exports, "AuthError", { enumerable: true, get: function () { return errors_js_1.AuthError; } });
Object.defineProperty(exports, "InsufficientCreditsError", { enumerable: true, get: function () { return errors_js_1.InsufficientCreditsError; } });
Object.defineProperty(exports, "RateLimitError", { enumerable: true, get: function () { return errors_js_1.RateLimitError; } });
//# sourceMappingURL=index.js.map