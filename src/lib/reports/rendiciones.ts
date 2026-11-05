// RENDICIÓN RECIBIDA: lo que la profesional del box le rinde a CH (docs/tenants/ch/NAIL-ARTIST.md §5).
//
// Es lo inverso de la comisión: ella cobra la seña y el saldo de sus servicios marcados
// (`Service.depositToProfessional`) y le rinde al salón un % de lo cobrado y/o un alquiler fijo del
// box. Este módulo es PURO: la cuenta, el período y los textos. La persistencia vive en
// `src/lib/rendicion-actions.ts`, que lee los turnos y le pasa sólo números.
//
// Regla del dinero: `porcentajeDe(…, "centavo")` y `sumarAlCentavo` (`@/lib/dinero/redondeo`), una
// sola vez cada cosa. Nunca `a * p / 100` suelto.
//
// PERÍODO: mensual en la zona del negocio — PROVISIONAL A CONFIRMAR con CH (§5). `desde` incluido,
// `hasta` excluido (el primer día del mes siguiente).

import { porcentajeDe, sumarAlCentavo } from "@/lib/dinero/redondeo";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { leerImporte } from "@/lib/dinero/leer";
import { claseDeCobro, cobroAnuladoPor } from "@/lib/turnos/anulacion";
import { pesosDelCobro } from "@/lib/turnos/cobro-dividido";
import { esNotaDeCobroProfesional } from "@/lib/turnos/senia-profesional";

/** Un `Collection` del turno: monto y la nota que marca anulaciones y condonaciones. */
export type CobroDelTurno = { amount: number; note: string | null };
/** Un turno COMPLETADO de un servicio marcado, de la profesional y del período. */
export type TurnoRendible = { id: string; cobros: readonly CobroDelTurno[] };
/** La config de la ficha. `null` = no se cargó. */
export type ConfigDeRendicion = { boxRentAmount: number | null; rentPercent: number | null };

export type Rendicion = {
  collectedTotal: number;
  rentPercent: number;
  percentAmount: number;
  rentAmount: number;
  amount: number;
  appointmentCount: number;
};

/** Un `Collection` con lo que dice a dónde fue la plata (para separar lo de ella de lo de CH). */
export type CobroConDestino = CobroDelTurno & {
  id: string;
  /** ¿El cobro dejó asiento en el libro de caja del negocio (`CashMovement.collectionId`)? */
  conAsientoEnCaja: boolean;
};

/**
 * Los cobros del turno que fueron A LA PROFESIONAL (§4: `Collection` sí, `CashMovement` no). Manda
 * lo que se decidió al COBRAR, no la marca de hoy: un cobro con asiento entró a la caja de CH y no
 * es de ella aunque el servicio se haya marcado después. Sin asiento, es de ella si la nota lo dice
 * (la seña al alias, fijada por el snapshot del pedido) o si el servicio está marcado (el saldo,
 * que se cobra sin nota propia). La anulación sigue a su cobro original; la condonación no es plata.
 */
export function cobrosDeLaProfesional(cobros: readonly CobroConDestino[], servicioMarcado: boolean): CobroDelTurno[] {
  const deElla = (c: CobroConDestino) => !c.conAsientoEnCaja && (esNotaDeCobroProfesional(c.note) || servicioMarcado);
  const porId = new Map(cobros.map((c) => [c.id, c]));
  return cobros
    .filter((c) => {
      const clase = claseDeCobro(c.note);
      if (clase === "cobro") return deElla(c);
      if (clase === "anulacion") {
        // Sigue a su cobro original; si el original no está entre los del turno, decide su propia fila.
        const original = porId.get(cobroAnuladoPor(c.note) ?? "");
        return original ? deElla(original) : deElla(c);
      }
      return false;
    })
    .map((c) => ({ amount: c.amount, note: c.note }));
}

/** Cuánto de lo cobrado en el turno fue a la profesional (neto de anulaciones; nunca negativo). */
export function cobradoPorLaProfesional(cobros: readonly CobroConDestino[], servicioMarcado: boolean): number {
  return cobradoDelTurno(cobrosDeLaProfesional(cobros, servicioMarcado));
}

/** ¿La profesional rinde? Alquiler o % mayor a cero. Sin config, no aparece en Rendiciones. */
export function tieneRendicion(c: ConfigDeRendicion): boolean {
  return (c.boxRentAmount ?? 0) > 0 || (c.rentPercent ?? 0) > 0;
}

/**
 * Lo que ella cobró en un turno: los cobros, menos lo anulado (la contra-fila `ANULACION:` resta
 * aunque venga con signo positivo); la condonación no es plata que entró. Nunca negativo.
 */
export function cobradoDelTurno(cobros: readonly CobroDelTurno[]): number {
  const filas: number[] = [];
  for (const c of cobros) {
    const clase = claseDeCobro(c.note);
    if (clase === "condonacion") continue;
    filas.push(clase === "anulacion" ? -Math.abs(c.amount) : c.amount);
  }
  return Math.max(0, sumarAlCentavo(filas));
}

/** La rendición del período. Sin config, todo en cero. Período sin turnos = sólo el alquiler. */
export function calcularRendicion(turnos: readonly TurnoRendible[], config: ConfigDeRendicion): Rendicion {
  const rentPercent = Math.max(0, config.rentPercent ?? 0);
  const rentAmount = Math.max(0, sumarAlCentavo([config.boxRentAmount ?? 0]));
  const collectedTotal = sumarAlCentavo(turnos.map((t) => cobradoDelTurno(t.cobros)));
  const percentAmount = rentPercent > 0 ? porcentajeDe(collectedTotal, rentPercent, "centavo") : 0;
  return {
    collectedTotal,
    rentPercent,
    percentAmount,
    rentAmount,
    amount: sumarAlCentavo([percentAmount, rentAmount]),
    appointmentCount: turnos.length,
  };
}

export type PeriodoMensual = { mes: string; desde: Date; hasta: Date };

/** "2026-11" → [1/11 00:00, 1/12 00:00) en la zona del negocio. Lo ilegible es `null`. */
export function periodoMensual(mes: unknown): PeriodoMensual | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes ?? "").trim());
  if (!m) return null;
  const anio = Number(m[1]);
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12 || anio < 2000 || anio > 2100) return null;
  const sig = mm === 12 ? `${anio + 1}-01` : `${anio}-${String(mm + 1).padStart(2, "0")}`;
  return { mes: `${m[1]}-${m[2]}`, desde: businessWallTimeToUtc(`${m[1]}-${m[2]}-01`, "00:00"), hasta: businessWallTimeToUtc(`${sig}-01`, "00:00") };
}

/** ¿El mes ya terminó? Una rendición se registra sobre un mes cerrado (no se congela lo que sigue sumando). */
export function periodoTerminado(p: PeriodoMensual, ahora: Date = new Date()): boolean {
  return p.hasta.getTime() <= ahora.getTime();
}

/** "2026-11-05" → "2026-11". */
export function mesDelDia(dia: string): string {
  return dia.slice(0, 7);
}

/** "2026-11" → "2026-10". */
export function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-11" → "noviembre 2026". */
export function nombreDelMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1] ?? mes} ${a}`;
}

/** El motivo del INGRESO en el libro de caja (§5). */
export function motivoDelIngreso(profesional: string, mes: string): string {
  return `Rendición Nail Artist · ${profesional} · ${nombreDelMes(mes)}`;
}

const NOMBRE_DEL_MEDIO: Record<string, string> = {
  EFECTIVO: "efectivo",
  MP: "Mercado Pago",
  TARJETA: "tarjeta",
  TRANSFERENCIA: "transferencia",
};

function porcentajeTexto(p: number): string {
  return `${String(Math.round(p * 100) / 100).replace(".", ",")} %`;
}

/**
 * Comprobante por WhatsApp a la profesional (§5). Lo que no aplica no se dice: sin % no hay «p % =»,
 * sin alquiler no hay «+ alquiler». El total va en negrita de WhatsApp (*…*).
 */
export function textoComprobanteRendicion(r: {
  mes: string;
  negocio: string;
  collectedTotal: number;
  appointmentCount: number;
  rentPercent: number;
  percentAmount: number;
  rentAmount: number;
  amount: number;
  recibidoEl: string;
  metodo: string;
}): string {
  const turnos = `${r.appointmentCount} ${r.appointmentCount === 1 ? "turno" : "turnos"}`;
  const partes: string[] = [];
  if (r.rentPercent > 0) partes.push(`${porcentajeTexto(r.rentPercent)} = ${pesosDelCobro(r.percentAmount)}`);
  if (r.rentAmount > 0) partes.push(`alquiler del box ${pesosDelCobro(r.rentAmount)}`);
  const cuenta = partes.length > 0 ? `${partes.join(" + ")} = *${pesosDelCobro(r.amount)}*` : `*${pesosDelCobro(r.amount)}*`;
  const medio = NOMBRE_DEL_MEDIO[r.metodo] ?? r.metodo.toLowerCase();
  return `Rendición ${nombreDelMes(r.mes)}: cobraste ${pesosDelCobro(r.collectedTotal)} en ${turnos}; ${cuenta}, recibido por ${r.negocio} el ${r.recibidoEl} por ${medio}. ¡Gracias!`;
}

export type ConfigLeida = { ok: true; config: ConfigDeRendicion } | { ok: false; error: string };

function leerNumero(raw: unknown): number | null | "invalido" {
  // El lector de pesos de todo el sistema (`@/lib/dinero/leer`): «150.000» son ciento cincuenta mil,
  // «150000,50» lleva centavos, «1.500,50» es criollo y «1500.5» lo que manda un input numérico.
  const l = leerImporte(String(raw ?? ""));
  return l.estado === "vacio" ? null : l.estado === "ok" ? l.valor : "invalido";
}

/**
 * Lee la config del formulario. Vacío = sin cargar. Alquiler en pesos (al centavo, ≥ 0); % entre 0 y 100
 * con dos decimales. Acepta «1.500,50» (criollo) y «1500.5» (lo que manda un input numérico).
 */
export function leerConfigDeRendicion(form: { boxRentAmount: unknown; rentPercent: unknown }): ConfigLeida {
  const alquiler = leerNumero(form.boxRentAmount);
  const pct = leerNumero(form.rentPercent);
  if (alquiler === "invalido" || (alquiler !== null && alquiler < 0)) return { ok: false, error: "El alquiler tiene que ser un monto en pesos (o vacío)." };
  if (pct === "invalido" || (pct !== null && (pct < 0 || pct > 100))) return { ok: false, error: "El porcentaje va de 0 a 100 (o vacío)." };
  return {
    ok: true,
    config: {
      boxRentAmount: alquiler === null ? null : sumarAlCentavo([alquiler]),
      rentPercent: pct === null ? null : Math.round(pct * 100) / 100,
    },
  };
}
