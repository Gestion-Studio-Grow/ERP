// ============================================================================
// Facturación de lo que entra por Mercado Pago — configuración por negocio y clasificación (PURO).
// ============================================================================
//
// Plan de la orquestadora (06/11/2026, PR2): lo que entra por MP NO se factura directo. Cada pago
// se CLASIFICA y, si corresponde, se arma una PROPUESTA. Sólo se emite solo cuando el negocio eligió
// «Automático» y el pago no supera el umbral de identificación sin documento del pagador; si lo
// supera, queda pendiente de datos. Se factura el BRUTO (la comisión de MP no cambia el importe).
//
// La configuración vive en `IntegracionConexion.config.facturacion` (JSON NO secreto, ya existe en la
// base: sin migración) y arranca APAGADA. Una cuenta de MP nueva arranca apagada otra vez.
//
// Sin base, sin red, sin React: se testea solo (mercadopago-clasificacion.test.ts).

import type { PagoMP } from "@/plugins/mercadopago";

export const MODOS_FACTURACION_MP = ["apagado", "proponer", "automatico"] as const;
export type ModoFacturacionMP = (typeof MODOS_FACTURACION_MP)[number];

/** 1 productos, 2 servicios, 3 productos y servicios (catálogo ARCA). */
export type ConceptoArca = 1 | 2 | 3;

export interface ConfigFacturacionMP {
  modo: ModoFacturacionMP;
  /** Punto de venta de los comprobantes de MP. null = el del negocio. */
  puntoVenta: number | null;
  concepto: ConceptoArca;
  /** Por debajo de este importe (pesos) no se factura (propinas, pruebas de $1). 0 = sin mínimo. */
  importeMinimo: number;
  /** Si la descripción del pago tiene alguna (sin distinguir mayúsculas ni tildes), no se factura. */
  palabrasExcluidas: string[];
}

export const CONFIG_FACTURACION_MP_APAGADA: ConfigFacturacionMP = Object.freeze({
  modo: "apagado",
  puntoVenta: null,
  concepto: 1,
  importeMinimo: 0,
  palabrasExcluidas: [],
}) as ConfigFacturacionMP;

const PUNTO_VENTA_MAX = 99998;
const IMPORTE_MAX = 1_000_000_000;
const PALABRAS_MAX = 20;
const PALABRA_LARGO_MAX = 40;

export type ResultadoConfig = { ok: true; config: ConfigFacturacionMP } | { ok: false; errores: Partial<Record<keyof ConfigFacturacionMP, string>> };

/** Valida lo que manda la pantalla. Los errores dicen qué revisar, en criollo. */
export function validarConfigFacturacionMP(crudo: unknown): ResultadoConfig {
  const o = (crudo && typeof crudo === "object" ? crudo : {}) as Record<string, unknown>;
  const errores: Partial<Record<keyof ConfigFacturacionMP, string>> = {};
  const modo = MODOS_FACTURACION_MP.includes(o.modo as ModoFacturacionMP) ? (o.modo as ModoFacturacionMP) : null;
  if (!modo) errores.modo = "Elegí si querés que lo de Mercado Pago se proponga, se facture solo o nada.";
  let puntoVenta: number | null = null;
  if (o.puntoVenta !== null && o.puntoVenta !== undefined && o.puntoVenta !== "") {
    const n = Number(o.puntoVenta);
    if (!Number.isInteger(n) || n < 1 || n > PUNTO_VENTA_MAX) errores.puntoVenta = "El punto de venta va del 1 al 99998.";
    else puntoVenta = n;
  }
  const concepto = Number(o.concepto ?? 1);
  if (concepto !== 1 && concepto !== 2 && concepto !== 3) errores.concepto = "Elegí productos, servicios o los dos.";
  const importeMinimo = Number(o.importeMinimo ?? 0);
  if (!Number.isFinite(importeMinimo) || importeMinimo < 0 || importeMinimo > IMPORTE_MAX) {
    errores.importeMinimo = "El importe mínimo tiene que ser 0 o un monto en pesos.";
  }
  const crudas = Array.isArray(o.palabrasExcluidas) ? o.palabrasExcluidas : [];
  const palabras = [...new Set(crudas.filter((p): p is string => typeof p === "string").map((p) => p.trim()).filter(Boolean))];
  if (crudas.length > PALABRAS_MAX || palabras.some((p) => p.length > PALABRA_LARGO_MAX)) {
    errores.palabrasExcluidas = `Hasta ${PALABRAS_MAX} palabras, de hasta ${PALABRA_LARGO_MAX} letras cada una.`;
  }
  if (Object.keys(errores).length > 0) return { ok: false, errores };
  return {
    ok: true,
    config: { modo: modo!, puntoVenta, concepto: concepto as ConceptoArca, importeMinimo: Math.round(importeMinimo * 100) / 100, palabrasExcluidas: palabras },
  };
}

/** Lee la configuración guardada en la conexión. Cualquier cosa rara → APAGADA (nunca factura de más). */
export function configDeLaConexion(configConexion: unknown): ConfigFacturacionMP {
  const f = (configConexion && typeof configConexion === "object" ? (configConexion as Record<string, unknown>).facturacion : null) ?? null;
  const v = validarConfigFacturacionMP(f);
  return v.ok ? v.config : CONFIG_FACTURACION_MP_APAGADA;
}

// ── Clasificación de un pago ─────────────────────────────────────────────────

export type MotivoExclusion =
  | "no_aprobado"
  | "no_es_venta" // operation_type distinto de regular_payment (transferencias, retiros, fondeos…)
  | "cuenta_propia" // el pagador tiene el mismo CUIT que el negocio
  | "bajo_minimo"
  | "palabra_excluida"
  | "monto_invalido";

export type DecisionPagoMP =
  | { tipo: "nada"; motivo: "apagado" }
  | { tipo: "excluir"; motivo: MotivoExclusion }
  | { tipo: "enlazar"; invoiceId: string } // la referencia ya está facturada: se enlaza, no se factura
  | { tipo: "proponer"; importe: number } // queda a la espera de un toque
  | { tipo: "pendiente_datos"; importe: number } // supera el umbral y no trae documento del pagador
  | { tipo: "emitir"; importe: number }; // automático y dentro del umbral

export interface ContextoClasificacion {
  config: ConfigFacturacionMP;
  /** CUIT del negocio (11 dígitos) para reconocer sus propios movimientos. */
  cuitNegocio: string | null;
  /** Pesos desde los cuales el comprobante a consumidor final exige identificar al receptor. */
  umbralIdentificacion: number;
  /** Si la `externalReference` del pago ya tiene comprobante, su id (se enlaza). */
  facturaDeLaReferencia: string | null;
}

/** «Café», «CAFE» y «cafe» son la misma palabra. */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Qué hacer con un pago de MP. El orden importa: primero lo que NUNCA se factura (para que una
 * transferencia o un retiro no aparezcan ni como propuesta), después el enlace con lo ya facturado,
 * el umbral de identificación y recién ahí el modo del negocio. La plata se compara en centavos (sin errores de coma flotante).
 */
export function clasificarPagoMP(pago: PagoMP, ctx: ContextoClasificacion): DecisionPagoMP {
  const { config } = ctx;
  if (config.modo === "apagado") return { tipo: "nada", motivo: "apagado" };
  if (pago.estado !== "approved") return { tipo: "excluir", motivo: "no_aprobado" };
  if (pago.tipoOperacionMP !== "regular_payment") return { tipo: "excluir", motivo: "no_es_venta" };
  const centavos = Math.round(Number(pago.monto) * 100);
  if (!Number.isSafeInteger(centavos) || centavos <= 0) return { tipo: "excluir", motivo: "monto_invalido" };
  const cuit = ctx.cuitNegocio?.replace(/\D/g, "") ?? "";
  if (cuit.length === 11 && pago.pagadorDoc?.numero === cuit) return { tipo: "excluir", motivo: "cuenta_propia" };
  if (centavos < Math.round(config.importeMinimo * 100)) return { tipo: "excluir", motivo: "bajo_minimo" };
  const descripcion = normalizar(pago.descripcion ?? "");
  if (config.palabrasExcluidas.some((p) => descripcion.includes(normalizar(p)))) return { tipo: "excluir", motivo: "palabra_excluida" };
  if (ctx.facturaDeLaReferencia) return { tipo: "enlazar", invoiceId: ctx.facturaDeLaReferencia };

  const importe = centavos / 100; // el BRUTO: la comisión de MP no se descuenta
  // Desde el umbral, sin documento del pagador no se puede emitir: en cualquier modo pide datos.
  if (!pago.pagadorDoc && centavos >= Math.round(ctx.umbralIdentificacion * 100)) return { tipo: "pendiente_datos", importe };
  return config.modo === "automatico" ? { tipo: "emitir", importe } : { tipo: "proponer", importe };
}
