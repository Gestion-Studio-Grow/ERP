/**
 * Manifiesto del plugin ARCA — SHIM de compatibilidad.
 *
 * Desde ADR-054/055 la fuente de verdad es el `ModuleDescriptor` (`arcaModule` en
 * ./module.ts); `arcaManifest` (forma legada `PluginManifest`) se DERIVA de él. Este
 * archivo se mantiene solo para no romper las rutas de import existentes
 * (`@/plugins/arca/manifest`): re-exporta el tipo legado y el manifiesto derivado.
 *
 * El tipo `PluginManifest` ahora vive en `@/modules/contract` (junto al adaptador
 * `toLegacyPluginManifest`).
 */

export type { PluginManifest } from "@/modules/contract";
export { arcaManifest } from "./module";
