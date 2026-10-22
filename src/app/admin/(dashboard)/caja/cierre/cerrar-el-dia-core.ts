// ============================================================================
// «CERRAR EL DÍA» EN TRES PASOS — lo que se decide sin pantalla. PURO.
// ============================================================================
//
// Reingeniería CH, Tanda 3 (§2.7, CH-038). Una sola URL (`/admin/caja/cierre?dia=…&paso=1|2|3`):
//   1 · Antes de contar → los turnos de ese día que quedaron sin cerrar, en la MISMA bandeja de
//       «Cerrar lo pendiente» (se resuelven ahí mismo, con su acción de siempre);
//   2 · Contá la plata  → el arqueo de siempre (`ContarYCerrar` + `cerrarDia`): con diferencia pide
//       «Qué pasó» y la diferencia queda asentada en el libro; se cierra deslizando (irreversible);
//   3 · Listo           → el resumen del día cerrado y «Mandar el cierre por WhatsApp» con
//       Efectivo / MP / Tarjeta y los turnos atendidos.
// No hay plata nueva acá: el cierre, la frontera del día cerrado y la aritmética son los de siempre
// (cierre-diario-actions.ts, frontera-cierre.ts, cierre-diario.ts). Esto decide el paso, los medios a
// contar y el texto del WhatsApp.
//
// ── TARJETA: CON Y SIN LA MIGRACIÓN M1 (contrato con 3-A) ────────────────────
// La tarjeta va en su columna (TARJETA) sólo si se cumplen LAS DOS:
//   · el código la traduce: `cashMethodFromPaymentMethod("DEBITO"|"CREDITO") === "TARJETA"`
//     (src/lib/caja/cierre-diario.ts, lo cambia 3-A; acá se LEE, no se toca);
//   · la base la tiene: el enum `PaymentMethod` trae DEBITO y CREDITO (M1 aplicada; lo lee
//     `tarjetaEnLaBase`, cerrar-el-dia.server.ts).
// Si falta cualquiera de las dos rige D6: la tarjeta se cobra como «Mercado Pago» y la caja lo dice
// con TEXTO_TARJETA_COMO_MP. Nada falla en ninguno de los dos casos (CH-031/032).

import type { CashMethod } from "@/lib/caja/cash-register";
import { CASH_METHODS } from "@/lib/caja/libro-caja";
import { mensajeCierreDeCaja } from "@/lib/turnos/mensajes-whatsapp";
import type { MedioDelComprobante } from "./comprobante";

export type Paso = 1 | 2 | 3;

export const PASOS: readonly { paso: Paso; titulo: string }[] = [
  { paso: 1, titulo: "Antes de contar" },
  { paso: 2, titulo: "Contá la plata" },
  { paso: 3, titulo: "Listo" },
];

/** `?paso=` de la URL. */
export function leerPaso(raw: string | string[] | null | undefined): Paso | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "1" ? 1 : v === "2" ? 2 : v === "3" ? 3 : null;
}

/**
 * En qué paso abre la pantalla. Un día cerrado siempre en el 3 (no se vuelve a contar); uno abierto
 * nunca en el 3 (no se llega a «Listo» sin cerrar). Sin pedir paso: si quedaron turnos sin cerrar ese
 * día, el 1; si no, directo a contar. `null` = no hay pasos (el día todavía no pasó, o quedó adentro
 * del cierre de otro día).
 */
export function pasoDelCierre(o: { pedido: Paso | null; estado: EstadoDelDia; pendientes: number }): Paso | null {
  if (o.estado === "cerrado") return 3;
  if (o.estado !== "abierto") return null;
  if (o.pedido === 1 || o.pedido === 2) return o.pedido;
  return o.pendientes > 0 ? 1 : 2;
}

export type EstadoDelDia = "abierto" | "cerrado" | "absorbido" | "futuro";

/** El estado del día que se mira, con lo que devuelve `getCierreDiarioData`. */
export function estadoDelDia(d: { yaCerrado: boolean; enElFuturo: boolean; tieneRegistro: boolean }): EstadoDelDia {
  if (d.yaCerrado) return d.tieneRegistro ? "cerrado" : "absorbido";
  return d.enElFuturo ? "futuro" : "abierto";
}

/** La URL de un paso (para el enlace compartible y el `replaceState`). */
export function hrefDelPaso(day: string, hoy: string, paso: Paso): string {
  return day === hoy ? `/admin/caja/cierre?paso=${paso}` : `/admin/caja/cierre?dia=${day}&paso=${paso}`;
}

// ── Tarjeta ──────────────────────────────────────────────────────────────────

export type ModoTarjeta = "separada" | "como-mp";

/** D6 (provisional mientras M1 no se aplica). Debe decir «hoy la tarjeta se registra como Mercado Pago». */
export const TEXTO_TARJETA_COMO_MP =
  "Hoy la tarjeta se registra como Mercado Pago: lo que entra por el Point está sumado en la línea de Mercado Pago.";

export function modoTarjeta(o: { mapea: (medio: string) => CashMethod | null; enumTieneTarjeta: boolean }): ModoTarjeta {
  const codigo = o.mapea("DEBITO") === "TARJETA" && o.mapea("CREDITO") === "TARJETA";
  return codigo && o.enumTieneTarjeta ? "separada" : "como-mp";
}

/** ¿El enum de la base trae los dos valores de tarjeta? (de la lista de `pg_enum`). */
export function enumTieneTarjeta(valores: readonly string[]): boolean {
  return valores.includes("DEBITO") && valores.includes("CREDITO");
}

// ── Los medios a contar (paso 2) ─────────────────────────────────────────────

export type MedioAContarCore = {
  medio: CashMethod;
  etiqueta: string;
  ayuda: string;
  esperado: number;
  seMovio: boolean;
};

type PreviewPorMedio = Record<CashMethod, { opening: number; ingresos: number; egresos: number; expected: number }>;

export function mediosAContar(porMedio: PreviewPorMedio, modo: ModoTarjeta): MedioAContarCore[] {
  return CASH_METHODS.map((m) => {
    const x = porMedio[m];
    const seMovio = x.opening !== 0 || x.ingresos !== 0 || x.egresos !== 0;
    if (m === "EFECTIVO") return { medio: m, etiqueta: "Efectivo", ayuda: "El cajón. Obligatorio, aunque sea 0.", esperado: x.expected, seMovio };
    if (m === "MP") {
      return modo === "como-mp"
        ? { medio: m, etiqueta: "Mercado Pago, transferencias y tarjeta", ayuda: "La app de Mercado Pago: incluye lo cobrado con el Point.", esperado: x.expected, seMovio }
        : { medio: m, etiqueta: "Mercado Pago y transferencias", ayuda: "El saldo de la app y lo acreditado hoy.", esperado: x.expected, seMovio };
    }
    return {
      medio: m,
      etiqueta: "Tarjeta (débito y crédito)",
      ayuda: modo === "separada" ? "El cierre de lote del posnet. Opcional: se liquida a los días." : "Sólo lo cargado a mano como tarjeta en el libro.",
      esperado: x.expected,
      seMovio,
    };
  });
}

// ── El WhatsApp del cierre (paso 3) ──────────────────────────────────────────

const columna = (m: MedioDelComprobante | undefined) =>
  m ? { monto: m.declarado ?? m.esperado, diferencia: m.declarado === null ? null : m.diferencia } : null;

/**
 * «Cierre jue 24: Efectivo $118.000 (−$2.000), MP/Transf. $64.000, Tarjeta $30.000 · 12 turnos. Qué
 * pasó: faltó cambio. Cerró Lu.» — con lo contado (o lo que decía el libro, si ese medio no se contó).
 * Sin el comprobante por medio no se arma (no se inventa un número): devuelve "".
 */
export function mensajeDelCierre(o: {
  day: string;
  medios: readonly MedioDelComprobante[] | null;
  turnos: number | null;
  nota: string | null;
  quien: string | null;
}): string {
  if (!o.medios || o.medios.length === 0) return "";
  const de = (m: CashMethod) => o.medios!.find((x) => x.medio === m);
  const efectivo = columna(de("EFECTIVO")) ?? { monto: 0, diferencia: null };
  return mensajeCierreDeCaja({
    dia: o.day,
    efectivo,
    mercadoPago: columna(de("MP")),
    tarjeta: columna(de("TARJETA")),
    turnos: o.turnos,
    nota: o.nota,
    quien: o.quien,
  });
}

/** El enlace de WhatsApp sin número (se elige a quién mandárselo: la dueña, el grupo del local). */
export function waDelCierre(mensaje: string): string | null {
  return mensaje ? `https://wa.me/?text=${encodeURIComponent(mensaje)}` : null;
}
