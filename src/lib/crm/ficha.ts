// ============================================================================
// LA FICHA ÚNICA — todo lo de una clienta en un lugar. PURO.
// ============================================================================
//
// La ficha mostraba "Turnos totales" y "Total gastado" (sólo pagos aprobados). La recepción no
// veía lo que necesita ANTES de hablar con ella: si tiene turno, si debe plata, si falta sin
// avisar, si cumple, si pidió que no le escriban. Acá se resume eso desde las filas que trae la
// página, con las MISMAS reglas que el resto del sistema:
//   · el saldo de cada turno es `estadoCobroTurno` (precio − Σ cobros), como la lista de turnos
//     y el alta; sólo cuenta como deuda un turno COMPLETADO con saldo (`esCuentaACobrar`);
//   · un faltazo es un turno marcado "No se presentó";
//   · lo gastado es lo COBRADO en los últimos 365 días (turnos + pedidos cobrados), no lo
//     reservado. Un saldo dado de baja ("CONDONACION:") baja la deuda pero NO es plata que
//     entró: se separa con `desglosarCobros`, la misma regla de la fila del turno.

import { esCuentaACobrar, estadoCobroTurno, type CobroTurno, type PagoLegado } from "@/lib/turnos/cobros";
import { desglosarCobros } from "@/lib/turnos/anulacion";
import { esVentaACuenta } from "@/lib/venta-reglas";

export type TurnoDeFicha = {
  id: string;
  status: string;
  startsAt: Date;
  precio: number;
  /** Con su nota: distingue un cobro de un saldo dado de baja (`cobrosDetalladosPorTurno`). */
  cobros: readonly (CobroTurno & { note?: string | null })[];
  pagoLegado?: PagoLegado;
  servicio: string;
  profesional: string;
};

export type PedidoDeFicha = {
  id: string;
  status: string;
  createdAt: Date;
  total: number;
  paid: boolean;
  /** Sin medio y `paid`: venta a cuenta (`esVentaACuenta`), vendida pero no cobrada. */
  paymentMethod: string | null;
};

export type FiadoDeFicha = { id: string; saldo: number };

export type ResumenFicha = {
  proximoTurno: { startsAt: Date; servicio: string; profesional: string } | null;
  ultimaVisita: Date | null;
  faltazos: number;
  /** Saldo de turnos ya prestados sin terminar de cobrar. */
  saldoTurnos: number;
  /** Saldo del fiado (cuenta corriente), o null si no se pudo leer. */
  saldoFiado: number | null;
  /** Lo cobrado en los últimos 365 días. */
  gastadoAnio: number;
  visitas: number;
  pedidos: number;
};

const ANIO_MS = 365 * 86_400_000;

export function resumirFicha(input: {
  turnos: readonly TurnoDeFicha[];
  pedidos: readonly PedidoDeFicha[];
  fiado: readonly FiadoDeFicha[] | null;
  ahora: Date;
}): ResumenFicha {
  const desdeAnio = input.ahora.getTime() - ANIO_MS;
  let proximoTurno: ResumenFicha["proximoTurno"] = null;
  let ultimaVisita: Date | null = null;
  let faltazos = 0;
  let saldoTurnos = 0;
  let gastadoAnio = 0;
  let visitas = 0;
  for (const t of input.turnos) {
    const t0 = t.startsAt.getTime();
    if ((t.status === "PENDING" || t.status === "CONFIRMED") && t0 > input.ahora.getTime()) {
      if (!proximoTurno || t0 < proximoTurno.startsAt.getTime()) {
        proximoTurno = { startsAt: t.startsAt, servicio: t.servicio, profesional: t.profesional };
      }
    }
    if (t.status === "NO_SHOW") faltazos++;
    const plata = estadoCobroTurno({ precio: t.precio, cobros: t.cobros, pagoLegado: t.pagoLegado });
    if (t.status === "COMPLETED") {
      visitas++;
      if (!ultimaVisita || t0 > ultimaVisita.getTime()) ultimaVisita = t.startsAt;
      if (esCuentaACobrar({ status: t.status, saldo: plata.saldo })) saldoTurnos += plata.saldo;
    }
    // Lo cobrado cuenta aunque el turno no se haya completado (la seña de un turno futuro ya es
    // plata que entró), pero no la de uno cancelado: esa seña se devuelve o se retiene aparte.
    // Sin cobros propios (un pago viejo), manda el pago legado, como en `estadoCobroTurno`.
    const entro = t.cobros.length > 0 ? desglosarCobros(t.cobros).cobrado : plata.cobrado;
    if (t.status !== "CANCELLED" && t0 >= desdeAnio) gastadoAnio += entro;
  }
  for (const p of input.pedidos) {
    if (p.status === "CANCELLED") continue;
    if (!ultimaVisita || p.createdAt.getTime() > ultimaVisita.getTime()) ultimaVisita = p.createdAt;
    // Cobrado = pagado CON un medio. La venta a cuenta (fiado) todavía no es plata que entró.
    if (p.paid && !esVentaACuenta(p) && p.createdAt.getTime() >= desdeAnio) gastadoAnio += p.total;
  }
  return {
    proximoTurno,
    ultimaVisita,
    faltazos,
    saldoTurnos: Math.round(saldoTurnos * 100) / 100,
    saldoFiado: input.fiado === null ? null : Math.round(input.fiado.reduce((s, f) => s + f.saldo, 0) * 100) / 100,
    gastadoAnio: Math.round(gastadoAnio * 100) / 100,
    visitas,
    pedidos: input.pedidos.filter((p) => p.status !== "CANCELLED").length,
  };
}

/** ¿Hay que avisar de los faltazos al darle un turno? */
export function avisarFaltazos(faltazos: number, desde: number): boolean {
  return faltazos >= desde;
}
