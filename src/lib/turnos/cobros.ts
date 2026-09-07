// ============================================================================
// COBRO DE TURNOS — aritmética PURA (seña al reservar, saldo al completar, comisión).
// ============================================================================
//
// Cómo cobra CH Estética, en palabras de la dueña: "reservado → confirmado → realizado →
// completado, y la seña se cobra al momento de reservar el turno". Lo que había hasta acá
// era `confirmPayment`: UN `Payment` por el precio completo, 1:1 con el turno — sin seña,
// sin parciales. El QA midió el resultado: un turno cargado Confirmado y marcado Completado
// quedaba con ingreso $0, comisión $0 y la ficha de la clienta en $0.
//
// Este módulo es la REGLA, sin DB ni tenant, testeable aparte (src/lib/turnos/cobros.test.ts):
//   · Un turno puede tener VARIOS cobros (`Collection` con `appointmentId`, D9): seña + saldo,
//     o lo que la recepción registre. El SALDO se deriva: precio − Σ cobros. No se guarda.
//   · La seña es el `depositAmount` fijo del catálogo (PROVISIONAL A CONFIRMAR con la dueña:
//     si es monto fijo o porcentaje). Sin `depositAmount` no hay seña: se cobra el saldo.
//   · Completar exige que el turno haya OCURRIDO (`startsAt <= ahora`) y cobra el resto —o
//     lo deja explícitamente como saldo a cobrar (cuenta a cobrar derivada: COMPLETED con
//     saldo > 0), nunca un estado nuevo del enum (decisión de producto).
//   · La comisión se devenga sobre el SERVICIO PRESTADO (precio, en COMPLETED), nunca sobre
//     la seña: reservar y cobrar la seña no genera comisión.
//   · La seña se PIERDE con no-show (PROVISIONAL A CONFIRMAR: pasadas 24 h): queda cobrada,
//     no hay saldo que reclamar ni devolución automática.
//
// `Payment` (1:1 con el turno) NO desaparece: pasa a ser el AGREGADO de los cobros del turno
// (`amount` = Σ cobrado, `status` APPROVED desde el primer peso que entra). Así Reportes, la
// ficha de la clienta, comisiones y facturación —que suman `Payment`— ven el total sin tocar
// una línea, y coinciden con el libro de caja (que suma un asiento por cobro).
//
// Dinero: contrato `number` (ADR-057) con el redondeo único `round2`. La persistencia va en
// `Decimal(14,2)` y la conversión vive en el borde del repositorio (cobro-turno-repo.ts).

import { round2 } from "@/lib/round";
import { computeSettlement, validateNewCollection, type SettlementStatus } from "@/lib/settlement/collection";

export type EstadoTurno = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

// Un cobro ya registrado contra el turno (fila `Collection`).
export type CobroTurno = { amount: number; method: string };

// El `Payment` del turno tal como quedó ANTES de los cobros parciales: `confirmPayment`
// (manual) o Mercado Pago escribían UN pago por el total, sin `Collection`. Se lo respeta
// como cobrado para que los turnos ya cobrados no aparezcan como deuda.
export type PagoLegado = { status: string; amount: number } | null | undefined;

export type EstadoCobroTurno = {
  precio: number;
  cobrado: number;
  saldo: number;
  estado: SettlementStatus; // UNPAID | PARTIAL | PAID | OVERPAID
};

// Los montos que cuentan como cobrados: los cobros parciales si los hay; si no hay ninguno,
// el `Payment` aprobado previo a este cambio (legado). Nunca los dos: en cuanto el turno
// tiene cobros, `Payment` es su agregado (lo escribe el repositorio) y sumarlo duplicaría.
export function montosCobrados(cobros: readonly CobroTurno[], pagoLegado?: PagoLegado): number[] {
  if (cobros.length > 0) return cobros.map((c) => c.amount);
  if (pagoLegado && pagoLegado.status === "APPROVED" && Number.isFinite(pagoLegado.amount) && pagoLegado.amount > 0) {
    return [pagoLegado.amount];
  }
  return [];
}

// Estado de cobro del turno: precio, cobrado y saldo derivado (precio − Σ cobros).
export function estadoCobroTurno(input: {
  precio: number;
  cobros: readonly CobroTurno[];
  pagoLegado?: PagoLegado;
}): EstadoCobroTurno {
  const s = computeSettlement(input.precio, montosCobrados(input.cobros, input.pagoLegado));
  return { precio: s.totalCharged, cobrado: s.collected, saldo: s.balance, estado: s.status };
}

// La seña que corresponde a un servicio: el `depositAmount` fijo del catálogo, acotado al
// precio (una seña no puede superar lo que cuesta el servicio). Null/0/negativo → sin seña.
// PROVISIONAL A CONFIRMAR con la dueña: monto fijo (asumido) vs. porcentaje.
export function seniaDelServicio(input: { depositAmount: number | null | undefined; precio: number }): number {
  const dep = input.depositAmount;
  if (dep == null || !Number.isFinite(dep) || dep <= 0) return 0;
  return round2(Math.min(dep, Math.max(0, input.precio)));
}

export type CobroSugerido = { tipo: "senia" | "saldo"; monto: number };

// Qué le propone el sistema cobrar a la recepción en este momento del turno:
//   · turno vivo (reservado/confirmado) con seña definida y NADA cobrado todavía → la seña;
//   · en cualquier otro caso → el saldo pendiente (lo que falta para saldar el servicio).
// Es una sugerencia (el formulario la precarga); el monto final lo valida `validarCobroTurno`.
export function cobroSugerido(input: {
  status: EstadoTurno | string;
  precio: number;
  depositAmount: number | null | undefined;
  cobros: readonly CobroTurno[];
  pagoLegado?: PagoLegado;
}): CobroSugerido {
  const estado = estadoCobroTurno(input);
  const senia = seniaDelServicio({ depositAmount: input.depositAmount, precio: input.precio });
  const vivo = input.status === "PENDING" || input.status === "CONFIRMED";
  if (vivo && estado.cobrado === 0 && senia > 0) {
    return { tipo: "senia", monto: Math.min(senia, estado.saldo) };
  }
  return { tipo: "saldo", monto: estado.saldo };
}

export type MotivoCobroRechazado =
  | "turno-cerrado" // cancelado o no se presentó: no se cobra más
  | "monto-invalido" // ≤ 0 o no finito
  | "excede-saldo"; // cobraría más de lo que falta

export type ValidacionCobro =
  | { ok: true; monto: number; saldoDespues: number; quedaSaldado: boolean }
  | { ok: false; motivo: MotivoCobroRechazado; saldo: number };

// ¿Se puede registrar ESTE cobro contra el turno? Guarda estructural del saldo (misma que
// el fiado, `validateNewCollection`): nunca ≤ 0, nunca por encima de lo que falta. Un turno
// cancelado o con no-show no acepta cobros: la seña ya retenida es todo lo que entra.
export function validarCobroTurno(input: {
  status: EstadoTurno | string;
  precio: number;
  cobros: readonly CobroTurno[];
  pagoLegado?: PagoLegado;
  monto: number;
}): ValidacionCobro {
  const estado = estadoCobroTurno(input);
  if (input.status === "CANCELLED" || input.status === "NO_SHOW") {
    return { ok: false, motivo: "turno-cerrado", saldo: estado.saldo };
  }
  const v = validateNewCollection(input.monto, estado.saldo);
  if (!v.ok) {
    return {
      ok: false,
      motivo: v.error === "EXCEEDS_BALANCE" ? "excede-saldo" : "monto-invalido",
      saldo: estado.saldo,
    };
  }
  const saldoDespues = round2(estado.saldo - v.amount);
  return { ok: true, monto: v.amount, saldoDespues, quedaSaldado: saldoDespues <= 0 };
}

// Monto del `Payment` AGREGADO después de registrar un cobro: lo que ya contaba como
// cobrado (cobros previos, o el pago legado si no había cobros) más este cobro. Así un
// turno con `Payment` legado parcial no pierde ese peso al pasar a cobros parciales.
export function montoPaymentAgregado(input: { cobradoAntes: number; monto: number }): number {
  return round2(Math.max(0, input.cobradoAntes) + Math.max(0, input.monto));
}

export type MotivoNoCompletable =
  | "no-confirmado" // sólo un turno CONFIRMED se puede completar (ciclo de la dueña)
  | "no-ocurrio"; // startsAt en el futuro: un turno no se presta antes de pasar

// ¿Se puede marcar como realizado? El QA completó un turno del martes estando domingo:
// `completeAppointment` validaba el estado pero no la fecha. Un turno no puede estar
// realizado antes de que empiece.
export function puedeCompletarse(input: {
  status: EstadoTurno | string;
  startsAt: Date;
  ahora: Date;
}): { ok: true } | { ok: false; motivo: MotivoNoCompletable } {
  if (input.status !== "CONFIRMED") return { ok: false, motivo: "no-confirmado" };
  if (input.startsAt.getTime() > input.ahora.getTime()) return { ok: false, motivo: "no-ocurrio" };
  return { ok: true };
}

export type PlanCompletar =
  | { ok: true; cobro: { monto: number; method: string } | null; saldoACobrar: number }
  | { ok: false; motivo: "falta-medio" };

// Qué pasa con la plata al completar: si no falta nada, nada; si falta y la recepción cobra,
// UN cobro por el saldo con el medio elegido; si falta y se decide dejarlo, el turno queda
// COMPLETED con saldo > 0 = cuenta a cobrar derivada (no un estado nuevo).
export function planCompletar(input: {
  precio: number;
  cobros: readonly CobroTurno[];
  pagoLegado?: PagoLegado;
  dejarSaldoACobrar: boolean;
  method: string | null;
}): PlanCompletar {
  const estado = estadoCobroTurno(input);
  if (estado.saldo <= 0) return { ok: true, cobro: null, saldoACobrar: 0 };
  if (input.dejarSaldoACobrar) return { ok: true, cobro: null, saldoACobrar: estado.saldo };
  if (!input.method) return { ok: false, motivo: "falta-medio" };
  return { ok: true, cobro: { monto: estado.saldo, method: input.method }, saldoACobrar: 0 };
}

// Base sobre la que se devenga la comisión del profesional: el servicio PRESTADO (precio
// congelado al reservar) cuando el turno está COMPLETED; cero en cualquier otro estado. La
// seña cobrada al reservar NO devenga nada.
//
// ⚠️ NO ESTÁ CABLEADA, a propósito. La liquidación viva (`src/lib/commission-actions.ts:13`)
// devenga sobre lo EFECTIVAMENTE COBRADO (`payment.amount`, que ahora es el agregado de los
// cobros). Con el turno saldado las dos reglas dan lo mismo; difieren sólo si se completa
// "dejando saldo a cobrar" y se liquida antes de cobrarlo: bruto (esta función) vs. neto
// (la liquidación). Cuál vale es una decisión del dueño —la misma pregunta abierta de la
// comisión neta vs. bruta—, no una que se resuelva acá: cambiar la base mueve plata que ya
// se le paga a alguien. Queda escrita y testeada para el día que se decida.
export function baseComision(input: { status: EstadoTurno | string; precio: number }): number {
  if (input.status !== "COMPLETED") return 0;
  return round2(Math.max(0, input.precio));
}

// Seña que el negocio se queda cuando la clienta no se presenta: todo lo cobrado hasta ahí.
// PROVISIONAL A CONFIRMAR con la dueña (asumido: se pierde pasadas 24 h del no-show).
// ⚠️ Tampoco está cableada: hoy marcar no-show no toca la plata (la seña ya cobrada queda
// donde está, que es el comportamiento asumido). Existe para no perder la regla.
export function seniaRetenida(input: { status: EstadoTurno | string; cobrado: number }): number {
  if (input.status !== "NO_SHOW") return 0;
  return round2(Math.max(0, input.cobrado));
}

// ¿Este turno es una cuenta a cobrar? Se prestó (COMPLETED) y todavía se debe algo.
export function esCuentaACobrar(input: { status: EstadoTurno | string; saldo: number }): boolean {
  return input.status === "COMPLETED" && input.saldo > 0;
}

// Clave de idempotencia de los cobros que dispara el sistema solo (no un formulario): la seña
// al reservar y el saldo al completar son a lo sumo UNO por turno, así que la clave es natural.
// El "Registrar cobro" manual trae su propio uuid del formulario.
export function claveCobroTurno(tipo: "senia" | "saldo", appointmentId: string): string {
  return `${tipo}:${appointmentId}`;
}

export const METODOS_DE_PAGO = ["EFECTIVO", "MERCADOPAGO", "TRANSFERENCIA"] as const;
export type MetodoDePago = (typeof METODOS_DE_PAGO)[number];

export function esMetodoDePago(raw: string | null | undefined): raw is MetodoDePago {
  return (METODOS_DE_PAGO as readonly string[]).includes(String(raw ?? ""));
}

export const METODO_LABEL: Record<MetodoDePago, string> = {
  EFECTIVO: "Efectivo",
  MERCADOPAGO: "Mercado Pago",
  TRANSFERENCIA: "Transferencia",
};
