// ============================================================================
// LOS CAMPOS QUE VIAJAN — lo que la agenda nueva le manda a las acciones de siempre. PURO.
// ============================================================================
//
// La agenda nueva no tiene acciones propias: usa `registrarCobroTurno`, `completeAppointment`,
// `confirmarTurno`, `cancelAppointment`, `markNoShow`, `anularCobroTurno` y `condonarSaldoTurno`
// (src/lib/actions.ts) con los MISMOS campos que la fila de siempre (AppointmentRow.tsx). Acá se
// arman esos campos, y campos.test.ts los compara con lo que cada acción lee del FormData: si una
// acción cambia de campo, la prueba lo dice antes que la recepcionista.
//
// El monto viaja en la forma canónica (punto decimal, sin miles), leído con `leerImporte`: el
// servidor lo lee con `Number(…replace(",", "."))`, y un «22.000» tipeado llegaría como 22.

import { importeParaFormulario, leerImporte } from "@/lib/pos-peso";
import { esMetodoDePago, type MetodoDePago } from "@/lib/turnos/cobros";

export type Campos = readonly (readonly [string, string])[];

/** Un FormData con estos campos, en este orden. */
export function aFormData(campos: Campos): FormData {
  const fd = new FormData();
  for (const [k, v] of campos) fd.append(k, v);
  return fd;
}

export type LecturaDelMonto = { ok: true; monto: number } | { ok: false; error: string };

/** El monto tipeado («22.000», «22000», «$ 7.500,50»), o por qué no se puede cobrar. */
export function leerMontoDelCobro(texto: string, saldo: number): LecturaDelMonto {
  const l = leerImporte(texto);
  if (l.estado === "vacio") return { ok: false, error: "Escribí cuánto cobrás." };
  if (l.estado !== "ok") return { ok: false, error: "Eso no es un monto. Escribilo como 22.000 o 22.000,50." };
  if (!(l.valor > 0)) return { ok: false, error: "El monto tiene que ser mayor a cero." };
  // El servidor rechaza cobrar más de lo que falta (`validarCobroTurno`): se dice antes.
  if (l.valor > saldo + 0.004) return { ok: false, error: "Es más de lo que falta cobrar." };
  return { ok: true, monto: l.valor };
}

/** «Registrar cobro» (seña, saldo o parcial): los campos de `registrarCobroTurno`. */
export function camposDeCobro(p: { turnoId: string; clave: string; monto: number; metodo: MetodoDePago }): Campos {
  return [
    ["appointmentId", p.turnoId],
    ["idempotencyKey", p.clave],
    ["amount", importeParaFormulario(p.monto)],
    ["method", p.metodo],
  ];
}

/**
 * «Terminar»: los campos de `completeAppointment`. Sin saldo, sólo el turno. Con saldo, o el medio
 * con el que se cobra (un cobro por el saldo) o `saldo=a-cobrar` (queda como cuenta a cobrar). Nunca
 * los dos: la fila de siempre no manda el medio cuando se deja el saldo.
 */
export function camposDeTerminar(p: { turnoId: string; saldo: number; cobro: { metodo: MetodoDePago } | "dejar-a-cobrar" | null }): Campos {
  const base: [string, string][] = [["appointmentId", p.turnoId]];
  if (p.saldo <= 0 || p.cobro === null) return base;
  if (p.cobro === "dejar-a-cobrar") return [...base, ["saldo", "a-cobrar"]];
  return [...base, ["method", p.cobro.metodo]];
}

/** Confirmar, cancelar, no vino: sólo el turno. */
export function camposDelTurno(turnoId: string): Campos {
  return [["appointmentId", turnoId]];
}

/** Anular un cobro: el cobro, el turno y el motivo. */
export function camposDeAnular(p: { cobroId: string; turnoId: string; motivo: string }): Campos {
  return [
    ["collectionId", p.cobroId],
    ["appointmentId", p.turnoId],
    ["motivo", p.motivo.trim()],
  ];
}

/** Dar de baja el saldo: el turno y el motivo. */
export function camposDeCondonar(p: { turnoId: string; motivo: string }): Campos {
  return [
    ["appointmentId", p.turnoId],
    ["motivo", p.motivo.trim()],
  ];
}

/** El medio elegido, o `null` si todavía no eligió (no se asume efectivo: descuadra la caja). */
export function metodoElegido(raw: string | null | undefined): MetodoDePago | null {
  return esMetodoDePago(raw) ? raw : null;
}

/** La clave de idempotencia de un cobro a mano: una por intento (se renueva al cobrar). */
export function claveNueva(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random()}`;
}
