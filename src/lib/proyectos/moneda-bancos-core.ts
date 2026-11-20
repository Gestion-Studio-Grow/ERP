// MIA-50 · T08 (GSG-MIA-150): moneda, bancos y a cobrar. Las reglas PURAS (sin base ni red), así se prueban solas
// (moneda-bancos-core.test.ts). Plata y cambio en centavos enteros: el cambio es «centavos de peso por 1 unidad»
// (US$ 1 = $ 1.000,50 → 100050), y un importe en pesos sale de multiplicar enteros y redondear una sola vez.
//
//  O39  el cambio de un movimiento es el del día del movimiento (o el último cargado antes); nunca uno posterior.
//  O31  la foto en pesos: original, cambio y pesos; la diferencia de cambio entre el comprobante y su pago.
//  O38  la huella de una línea del extracto: el mismo archivo dos veces (o a la vez) no duplica.
//  O36  las retenciones sufridas al cobrar: lo que entra a la cuenta más lo retenido no pasa lo que falta.

import { leerNumero, pesos, redondear } from "./core";
import { centavosDe } from "@/lib/dinero/redondeo";

/** «AAAA-MM-DD» del día en Argentina (UTC−3, sin horario de verano). */
export function diaArgentino(instante: Date): string {
  return new Date(instante.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

export const esDiaValido = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Pesos con centavos → centavos enteros (sin errores de coma flotante: 0,1 + 0,2 no se arrastra). */
export function aCentavos(pesos: number): number {
  return centavosDe(pesos);
}

export const deCentavos = (c: number | bigint): number => Number(c) / 100;

export interface CambioDelDia {
  dia: string;
  centavosPorUnidad: number;
}

/**
 * O39: el cambio que corresponde a un día es el último cargado ese día o antes. Uno cargado DESPUÉS nunca se usa para
 * un movimiento viejo (cambiar el de hoy no reescribe lo que ya pasó). Sin ninguno ≤ ese día: null (se pide cargarlo).
 */
export function cambioAplicable(historial: readonly CambioDelDia[], dia: string): CambioDelDia | null {
  let mejor: CambioDelDia | null = null;
  for (const c of historial) {
    if (c.dia > dia || !(c.centavosPorUnidad > 0)) continue;
    if (!mejor || c.dia > mejor.dia) mejor = c;
  }
  return mejor;
}

export interface FotoEnPesos {
  moneda: string;
  originalCentavos: number;
  cambioCentavos: number;
  pesosCentavos: number;
}

/** El cambio de un peso: 1 peso = 100 centavos por unidad. */
export const CAMBIO_PESO = 100;

/**
 * O31: la foto de un importe en su moneda al cambio de un día. En pesos, el cambio es 100 (1 a 1). Se redondea una
 * sola vez, al centavo, al final: US$ 33,33 a $ 1.000,50 → 3.333 × 100.050 / 100 = 3.334.666,5 → $ 33.346,67.
 */
export function fotoEnPesos(moneda: string, original: number, cambioCentavos: number): FotoEnPesos {
  const originalCentavos = aCentavos(original);
  const cambio = moneda === "ARS" ? CAMBIO_PESO : cambioCentavos;
  return { moneda, originalCentavos, cambioCentavos: cambio, pesosCentavos: Math.round((originalCentavos * cambio) / CAMBIO_PESO) };
}

/**
 * O31: la diferencia de cambio de pagar en otra moneda: lo que costó en pesos al pagarla menos lo que se registró al
 * cargar el comprobante. Positiva = se pagó más caro (pérdida); negativa = ganancia. Va a Administración, no al proyecto.
 */
export function diferenciaDeCambio(pesosAlPagar: number, pesosAlRegistrar: number): number {
  return pesosAlPagar - pesosAlRegistrar;
}

/** Criterio para el cambio del costo de un comprobante en otra moneda (`moneda.cambioDelCosto`). */
export type CriterioCambio = "MANUAL" | "DEL_COMPROBANTE" | "DEL_PAGO";
export const CRITERIOS_CAMBIO: readonly CriterioCambio[] = ["MANUAL", "DEL_COMPROBANTE", "DEL_PAGO"];
export const esCriterioCambio = (v: unknown): v is CriterioCambio => typeof v === "string" && (CRITERIOS_CAMBIO as readonly string[]).includes(v);

// ── Extracto (O38) ──────────────────────────────────────────────────────────

const claveDeLinea = (l: { fecha: Date; descripcion: string; importe: number }) =>
  `${l.fecha.getFullYear()}-${String(l.fecha.getMonth() + 1).padStart(2, "0")}-${String(l.fecha.getDate()).padStart(2, "0")}|${l.descripcion.trim().toLowerCase().replace(/\s+/g, " ")}|${aCentavos(l.importe)}`;

/**
 * La huella de cada línea: fecha, descripción, importe y cuántas iguales hubo antes en el MISMO archivo. Dos líneas
 * iguales en un archivo son dos movimientos (#1 y #2); volver a subir el archivo da las mismas huellas y el índice único
 * (tenantId, cuentaId, huella) no deja entrar ninguna dos veces, ni con dos importaciones a la vez.
 */
export function huellasDelExtracto<T extends { fecha: Date; descripcion: string; importe: number }>(lineas: readonly T[]): (T & { huella: string })[] {
  const vistas = new Map<string, number>();
  return lineas.map((l) => {
    const k = claveDeLinea(l);
    const n = (vistas.get(k) ?? 0) + 1;
    vistas.set(k, n);
    return { ...l, huella: `${k}|#${n}`.slice(0, 400) };
  });
}

/** Contra qué se concilia un movimiento del extracto que no es una cuota. */
export type OrigenConciliable = "COBRO" | "PAGO" | "ORDEN_PAGO" | "LIQUIDACION";
export const ORIGENES_CONCILIABLES: readonly OrigenConciliable[] = ["COBRO", "PAGO", "ORDEN_PAGO", "LIQUIDACION"];
export const esOrigenConciliable = (v: unknown): v is OrigenConciliable => typeof v === "string" && (ORIGENES_CONCILIABLES as readonly string[]).includes(v);

/** Un cobro entra a la cuenta (+); un pago, una orden o una liquidación salen (−). */
export const signoDelOrigen = (o: OrigenConciliable): 1 | -1 => (o === "COBRO" ? 1 : -1);

export type EstadoDelMovimiento = "CONCILIADO_CUOTA" | "CONCILIADO_MOVIMIENTO" | "SIN_CONCILIAR";
export function estadoDelMovimiento(m: { cuotaId: string | null; origenTipo?: string | null }): EstadoDelMovimiento {
  if (m.cuotaId) return "CONCILIADO_CUOTA";
  if (m.origenTipo) return "CONCILIADO_MOVIMIENTO";
  return "SIN_CONCILIAR";
}
export const ESTADO_MOVIMIENTO_LABEL: Record<EstadoDelMovimiento, string> = {
  CONCILIADO_CUOTA: "Conciliado con una cuota",
  CONCILIADO_MOVIMIENTO: "Conciliado con un movimiento",
  SIN_CONCILIAR: "Sin conciliar",
};

/** El saldo que sale de los movimientos: el inicial más lo que movió cada cobro, pago, orden o liquidación vigente. */
export function saldoDeMovimientos(inicialCentavos: number, movimientos: readonly { importeCentavos: number | bigint; anuladoEl?: Date | null }[]): number {
  return movimientos.reduce((s, m) => (m.anuladoEl ? s : s + Number(m.importeCentavos)), inicialCentavos);
}

// ── Retenciones sufridas (O36) ──────────────────────────────────────────────

export interface RetencionLeida {
  tipo: string;
  importe: number;
  certificado: string | null;
}

export const MEDIO_RETENCION = "RETENCION";

/**
 * O36: la nota del cobro RETENCION que muestra la ficha. Los tipos sin repetir; si un tipo ya dice «Retención…» (el
 * genérico del catálogo), va solo; si el negocio cargó otro nombre en la lista, lleva delante «Retención sufrida · ».
 */
export function notaDeRetencion(tipos: readonly string[]): string {
  const texto = [...new Set(tipos)].join(", ");
  return (/^retenci[oó]n/i.test(texto) ? texto : `Retención sufrida · ${texto}`).slice(0, 200);
}

/**
 * Lee las retenciones del formulario (listas paralelas `retTipo`, `retImporte`, `retCertificado`). Una fila vacía se
 * ignora; una con importe y sin tipo (o tipo fuera del catálogo) es un error; con tipo y sin importe, también.
 */
export function leerRetenciones(
  tipos: readonly unknown[],
  importes: readonly unknown[],
  certificados: readonly unknown[],
  permitidos: readonly string[],
): { ok: true; retenciones: RetencionLeida[] } | { ok: false; error: string } {
  const retenciones: RetencionLeida[] = [];
  const n = Math.max(tipos.length, importes.length);
  for (let i = 0; i < n; i++) {
    const tipo = String(tipos[i] ?? "").trim();
    const textoImporte = String(importes[i] ?? "").trim();
    const certificado = String(certificados[i] ?? "").trim().slice(0, 80) || null;
    if (!tipo && !textoImporte) continue;
    const importe = redondear(leerNumero(textoImporte));
    if (!tipo) return { ok: false, error: "Elegí el tipo de cada retención." };
    if (!permitidos.includes(tipo)) return { ok: false, error: `«${tipo}» no es un tipo de retención del negocio.` };
    if (!(importe > 0)) return { ok: false, error: `Escribí el importe de la retención de ${tipo}.` };
    retenciones.push({ tipo, importe, certificado });
  }
  if (retenciones.length > 10) return { ok: false, error: "Hasta 10 retenciones por cobro." };
  return { ok: true, retenciones };
}

/**
 * O36: lo que entra a la cuenta y lo retenido, en la moneda de la cuota. Sin «una parte», entra lo que falta menos lo
 * retenido. Con «una parte», entra esa parte. Lo que entra más lo retenido nunca pasa lo que falta; lo que entra es
 * mayor que 0 salvo que la retención cubra todo (un cobro 100 % retenido también salda).
 */
export function repartoDelCobro(pendiente: number, parte: number | null, retenido: number, moneda = "ARS"): { ok: true; entra: number; retenido: number } | { ok: false; error: string } {
  const ret = redondear(retenido);
  if (ret < 0) return { ok: false, error: "Las retenciones no pueden ser negativas." };
  const entra = parte !== null ? redondear(parte) : redondear(pendiente - ret);
  if (entra < 0 || redondear(entra + ret) > redondear(pendiente) + 0.005) return { ok: false, error: `Lo cobrado más lo retenido pasa lo que le falta a la cuota (${pesos(pendiente, moneda)}).` };
  if (!(entra > 0) && !(ret > 0)) return { ok: false, error: "No hay nada para cobrar." };
  return { ok: true, entra, retenido: ret };
}

// ── Cuota ↔ factura (O35) ───────────────────────────────────────────────────

export type TramoFactura = "ANTICIPO" | "SALDO" | "ADICIONAL";
export const TRAMOS_FACTURA: readonly TramoFactura[] = ["ANTICIPO", "SALDO", "ADICIONAL"];
export const TRAMO_LABEL: Record<TramoFactura, string> = { ANTICIPO: "Anticipo", SALDO: "Saldo", ADICIONAL: "Adicional" };
export const esTramo = (v: unknown): v is TramoFactura => typeof v === "string" && (TRAMOS_FACTURA as readonly string[]).includes(v);
