// Detección de marca por IA (v1) — RFC-004-B. Superficie pública del módulo.
// Puro (color/extract/propose) + un orquestador con red (detect). Ver el RFC para
// la integración al alta del tenant.
export { extractBrandSignals, type BrandSignals } from "./extract";
export { proposeBranding, nearestPreset, type BrandProposal, type Confidence } from "./propose";
export { detectBrandFromUrl, normalizeSiteUrl, type DetectResult, type FetchLike } from "./detect";
export * as color from "./color";
