"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GRAPH_HOST = exports.GRAPH_VERSION = void 0;
/**
 * The Graph API version, for every Meta integration in this repo.
 *
 * There were two hardcoded copies before — the Conversions API sat on v21.0 while the ads
 * CLI was on v25.0 — which is how a deployed function quietly ages into Meta's two-year
 * deprecation window while `doctor` reports everything green.
 *
 * `functions/scripts/meta/env.ts` re-exports these. src/ never imports from scripts/, so
 * the deployed bundle stays free of the CLI (and of its money-spending token).
 */
exports.GRAPH_VERSION = 'v25.0';
exports.GRAPH_HOST = 'https://graph.facebook.com';
//# sourceMappingURL=graph.js.map