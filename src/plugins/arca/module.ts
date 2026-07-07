// ============================================================================
// ARCA como MÓDULO del catálogo — ejemplo de migración al contrato (ADR-054/055).
// ============================================================================
//
// Este es el primer módulo REAL migrado al patrón del repositorio de módulos. El
// `arcaModule` (ModuleDescriptor) es ahora la FUENTE DE VERDAD; el manifiesto legado
// `arcaManifest` (PluginManifest, la forma que consumían arca/index y mercadopago) se
// DERIVA de él con `toLegacyPluginManifest` — misma data, un solo lugar, sin romper a
// nadie. Prueba el contrato end-to-end: eventos in, comandos out, config con secretos,
// semver y compatibilidad de rubro.
//
// ARCA es kind: "plugin" (integración externa, ADR-022): no toca la DB del Core, se
// comunica por el evento `InvoiceCreated` (in) y el comando `RegisterFiscalDocument`
// (out). Compatibilidad "todos": cualquier rubro PUEDE facturar; la ASIGNACIÓN sigue
// siendo por tenant (solo se activa en los que facturan) — variante, no "todos con todo".

import { type ModuleDescriptor, toLegacyPluginManifest } from "@/modules/contract";

export const arcaModule: ModuleDescriptor = {
  id: "arca",
  version: "0.1.0", // scaffold contra stub; el lado Core está diferido (ver plugins/README).
  nombre: "ARCA — Facturación electrónica",
  descripcion:
    "Autorización fiscal de comprobantes ante ARCA (ex-AFIP): obtiene el CAE vía WSAA + WSFEv1. No calcula impuestos (eso vive en el Core, ADR-006).",
  kind: "plugin",
  rubros: "todos",
  consumeEventos: ["InvoiceCreated"],
  llamaComandos: ["RegisterFiscalDocument"],
  configSchema: {
    cuit: {
      tipo: "number",
      requerido: true,
      descripcion: "CUIT del emisor (por tenant).",
    },
    homologacion: {
      tipo: "boolean",
      descripcion: "true = ambiente de testing de ARCA; false = producción.",
    },
    puntoVenta: {
      tipo: "number",
      requerido: true,
      descripcion: "Punto de venta habilitado en ARCA para este tenant.",
    },
    certificadoPem: {
      tipo: "string",
      secreto: true,
      requerido: true,
      descripcion: "Certificado X.509 (PEM) del tenant para el WSAA.",
    },
    clavePrivadaPem: {
      tipo: "string",
      secreto: true,
      requerido: true,
      descripcion: "Clave privada (PEM) asociada al certificado.",
    },
  },
};

/**
 * Manifiesto legado, DERIVADO del descriptor. Se mantiene para no romper a quien
 * importa `arcaManifest` (arca/index.ts) ni el tipo `PluginManifest` (mercadopago).
 */
export const arcaManifest = toLegacyPluginManifest(arcaModule);
