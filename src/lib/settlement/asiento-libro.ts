// ============================================================================
// CUENTAS CORRIENTES → LIBRO DE CAJA — el cobro del fiado y el pago al proveedor también
// son plata que entra o sale. PURO (la escritura vive en collection-repo.ts).
// ============================================================================
//
// POR QUÉ. Cobrar un fiado, pagarle a un proveedor o que se acredite un cheque grababa el
// `Collection` y NADA en el libro de caja: la plata entraba o salía del cajón sin pasar por
// el libro, y el cierre del día daba una diferencia fantasma (el propio cierre lo decía: "el
// fiado todavía no escribe el rastro"). Si alguien "arreglaba" esa diferencia a mano, se
// perdía el rastro de las dos cosas.
//
// LA REGLA (una sola, acá):
//   · el cobro de una cuenta a cobrar es un INGRESO; el pago de una cuenta a pagar (y el
//     cheque acreditado), un EGRESO. Mismo tipo que el libro ya sabe sumar y restar;
//   · el MEDIO es obligatorio y se traduce con la única tabla que hay entre los dos
//     vocabularios (`cashMethodFromPaymentMethod`, cierre-diario.ts). Nunca se supone
//     efectivo: un pago por transferencia asentado como efectivo descuadra el cajón;
//   · si HOY ya está cerrado en la caja, se rechaza: el movimiento caería en un día ya
//     contado, igual que un alta del libro (frontera-cierre.ts);
//   · la fila lleva el `collectionId` (clave de idempotencia `@@unique(tenantId,
//     collectionId, type)`) y la marca `cuenta-corriente:<collectionId>` en `createdBy`, que
//     es como el libro distingue lo que asentó el sistema de lo tipeado a mano.
//
// TODO DETRÁS DE `CUENTAS_CORRIENTES_ENABLED` (default apagado). Se prende sólo cuando
// `npm run medir:neon` muestre aplicado el lote de 5 (entre ellas, la que agrega
// `CashMovement.collectionId`): sin esa columna, el asiento fallaría y con él el cobro.
//
// Sin Prisma de valor: lo importan tests y, a través de la action, nada del cliente.

import {
  cashMethodFromPaymentMethod,
  formatDayLabel,
  isFrozenDay,
  nextDayKey,
  type DayKey,
} from "@/lib/caja/cierre-diario";
import type { CashMethod } from "@/lib/caja/cash-register";

/** ¿Los cobros y pagos de cuentas corrientes asientan en el libro? Default OFF. PURA. */
export function cuentasCorrientesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.CUENTAS_CORRIENTES_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/** Marca en `CashMovement.createdBy` de lo que asentó una cuenta corriente. */
export const CUENTA_CORRIENTE_ACTOR_PREFIX = "cuenta-corriente:";

/** `cuenta-corriente:<collectionId>`: el actor queda en `Collection.collectedBy`. */
export function cuentaCorrienteMarker(collectionId: string): string {
  return `${CUENTA_CORRIENTE_ACTOR_PREFIX}${collectionId}`;
}

/** ¿Esta fila del libro la asentó un cobro o pago de cuenta corriente? */
export function esAsientoDeCuentaCorriente(m: { createdBy?: string | null }): boolean {
  return String(m.createdBy ?? "").startsWith(CUENTA_CORRIENTE_ACTOR_PREFIX);
}

/** Los medios con los que se cobra o se paga una cuenta corriente (enum `PaymentMethod`). */
export const MEDIOS_CUENTA_CORRIENTE = ["EFECTIVO", "TRANSFERENCIA", "MERCADOPAGO"] as const;
export type MedioCuentaCorriente = (typeof MEDIOS_CUENTA_CORRIENTE)[number];

/** El medio que llegó del formulario, o `null` si no vino o no es uno de los tres. Sin default. */
export function leerMedio(raw: unknown): MedioCuentaCorriente | null {
  const s = String(raw ?? "").trim();
  return (MEDIOS_CUENTA_CORRIENTE as readonly string[]).includes(s) ? (s as MedioCuentaCorriente) : null;
}

export const MEDIO_OBLIGATORIO = "Elegí el medio: efectivo, transferencia o Mercado Pago. No se supone ninguno.";

/** De qué lado está la plata: cobro de una cuenta a cobrar o pago de una cuenta a pagar. */
export type OrigenCuentaCorriente = "RECEIVABLE" | "PAYABLE";

export interface AsientoLibro {
  type: "INGRESO" | "EGRESO";
  method: CashMethod;
  amount: number;
  reason: string;
}

export type DecisionAsiento = { ok: true; asiento: AsientoLibro } | { ok: false; error: string };

/**
 * Qué fila del libro corresponde a un cobro o pago de cuenta corriente, o por qué no se puede
 * asentar. PURA: el día y la frontera del cierre entran por parámetro.
 */
export function decidirAsiento(input: {
  origen: OrigenCuentaCorriente;
  medio: string | null | undefined;
  monto: number;
  detalle: string;
  /** Hoy, en el día del negocio. */
  hoy: DayKey;
  /** Hasta qué día está cerrada la caja (`lastClosedDayTx`), o `null`. */
  cerradoHasta: DayKey | null;
}): DecisionAsiento {
  const method = input.medio ? cashMethodFromPaymentMethod(input.medio) : null;
  if (!method) return { ok: false, error: MEDIO_OBLIGATORIO };
  if (!Number.isFinite(input.monto) || input.monto <= 0) {
    return { ok: false, error: "El monto tiene que ser mayor a cero." };
  }
  const que = input.origen === "RECEIVABLE" ? "cobro" : "pago";
  if (isFrozenDay(input.hoy, input.cerradoHasta)) {
    const abierto = nextDayKey(input.cerradoHasta!);
    return {
      ok: false,
      error:
        `La caja de hoy (${formatDayLabel(input.hoy)}) ya está cerrada: este ${que} caería en un día ya contado. ` +
        `Registralo el ${formatDayLabel(abierto)} y aclaralo en la nota; así entra al próximo cierre.`,
    };
  }
  return {
    ok: true,
    asiento: {
      type: input.origen === "RECEIVABLE" ? "INGRESO" : "EGRESO",
      method,
      amount: input.monto,
      reason: input.detalle.trim() || (input.origen === "RECEIVABLE" ? "Cobro de cuenta corriente" : "Pago a proveedor"),
    },
  };
}
