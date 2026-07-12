// ============================================================================
// Descriptor del módulo BANCOS — importación de extractos bancarios (ADR-054/055).
// ============================================================================
//
// El corazón del producto "facturación automática para el comerciante simple":
// el comerciante sube el extracto de su banco (CSV/XLSX), el plugin detecta solo
// qué columna es qué (mapeador), separa ventas de lo que no se factura
// (clasificador) y genera PROPUESTAS de factura listas para confirmar (reglas).
//
// Es kind: "plugin" (mismo molde que ARCA, ADR-022): no toca la DB ni el código
// interno del Core. Su entrada NO es un evento del outbox sino un ARCHIVO que sube
// el usuario (por eso `consumeEventos: []`, igual que Mercado Pago con su webhook);
// su salida es el comando público `CreateInvoice` del Core, que calcula neto/IVA
// (ADR-006) y dispara la cadena InvoiceCreated → plugin ARCA → CAE.
//
// Compatibilidad "todos": cualquier rubro puede cobrar por banco. La ASIGNACIÓN
// sigue siendo por tenant (variante, ADR-055) — se activa solo donde se contrata.

import { type ModuleDescriptor, toLegacyPluginManifest } from "@/modules/contract";

export const bancosModule: ModuleDescriptor = {
  id: "bancos",
  version: "0.1.0", // dominio puro completo; el glue de src/lib + UI vienen después.
  nombre: "Bancos — Facturación desde el extracto",
  descripcion:
    "Importa extractos bancarios (CSV/XLSX), detecta solo las columnas, separa ventas de comisiones/impuestos/transferencias y propone las facturas. No calcula impuestos (eso vive en el Core, ADR-006).",
  kind: "plugin",
  capability: "billing:manage", // misma pantalla de Facturación del backoffice que ARCA (RBAC)
  rubros: "todos",
  grupo: "facturacion-cobros",
  // Núcleo de facturación del Comerciante: subir el extracto y facturar desde ahí (ADR-089 §Decisión 1).
  nucleoPara: ["comerciante", "pyme"],
  resumen: "Subís el extracto de tu banco y salen las facturas solas, sin cargar a mano.",
  fit: "Todo comercio que cobra por banco o transferencia.",
  scopeItems: [
    { label: "Subir extracto CSV/XLSX", ruta: "/admin/facturacion" },
    { label: "Detectar las columnas solo" },
    { label: "Separar ventas de comisiones e impuestos" },
    { label: "Proponer las facturas para confirmar" },
  ],
  consumeEventos: [], // entrada real: archivo subido por el usuario, no el outbox.
  llamaComandos: ["CreateInvoice"],
  configSchema: {
    umbralIdentificacion: {
      tipo: "number",
      descripcion:
        "Monto (pesos) desde el cual la factura exige identificar al receptor (CUIL/CUIT + nombre + descripción). Default 600.000 — regla comercial del dueño: el umbral LEGAL de ARCA es $10.000.000 desde 05/2025, este es MÁS ESTRICTO a propósito.",
    },
    capFacturasMes: {
      tipo: "number",
      descripcion:
        "Tope de facturas automáticas por mes (default 159). Al 90% se alerta; al 100% se bloquea la emisión automática (solo manual con confirmación).",
    },
    domicilioEmisor: {
      tipo: "string",
      requerido: true,
      descripcion: "Domicilio comercial del emisor — obligatorio en el comprobante.",
    },
    puntoVenta: {
      tipo: "number",
      requerido: true,
      descripcion: "Punto de venta habilitado en ARCA para este tenant.",
    },
  },
};

/**
 * Manifiesto legado, DERIVADO del descriptor (mismo patrón que ARCA: el
 * `ModuleDescriptor` es la única fuente de verdad; `PluginManifest` es una
 * proyección para los consumidores viejos).
 */
export const bancosManifest = toLegacyPluginManifest(bancosModule);
