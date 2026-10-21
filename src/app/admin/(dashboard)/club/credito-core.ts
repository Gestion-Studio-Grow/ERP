// ============================================================================
// FIAR CON EL OK DEL DUEÑO — el pedido, el código de 6 letras y los 5 intentos. PURO.
// ============================================================================
//
// El flujo que validó el club (DIA-DE-PRUEBA.md, «Fiar»): si un cliente no tiene cuenta corriente, recepción pide
// el OK; al dueño le llega por WhatsApp, pone su PIN en el celular y le sale un código de 6 letras (ABC-DEF), que le
// manda a recepción; recepción lo tipea y ya puede pasar la cuenta a la cuenta corriente. Hay 5 intentos por
// pedido; con 5 mal, el pedido se traba 30 minutos. Las reglas son del motor (`solicitarCredito`,
// `codigoAprobacion`, `aprobarPorCodigo`): acá sólo se arma lo que se muestra y se traduce cada toque.
//
// En la DEMO no hay celular del dueño: `codigoDeLaDemo` calcula el código que le llegaría a un dueño de ejemplo, y
// la pantalla lo muestra rotulado como demo para poder recorrer el flujo entero. En el modo real eso no existe.

import { aprobarPorCodigo, cliente as clienteDe, codigoAprobacion, cuenta as cuentaDe, datosAprobacion, pesos, solicitarCredito } from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import type { Desenlace } from "./almacen";
import { INTENTOS_POR_PEDIDO, aCobrarDe, trabadoHasta } from "./buffet-core";

export { INTENTOS_POR_PEDIDO };

export interface VistaPedido {
  id: string;
  cliente: string;
  monto: number;
  pidio: string;
  /** Intentos que le quedan antes de trabarse. */
  quedan: number;
  /** «Trabado hasta las 19:40» si se equivocaron 5 veces. */
  trabado: string | null;
}

/** Los pedidos de crédito que esperan al dueño. */
export function pedidosPendientes(estado: EstadoClub, ahora: Ahora): VistaPedido[] {
  return estado.novedades
    .filter((n) => n.estado === "pendiente")
    .map((n) => ({
      id: n.id,
      cliente: clienteDe(estado, n.clienteId)?.nombre ?? "",
      monto: n.monto,
      pidio: n.pidio,
      quedan: INTENTOS_POR_PEDIDO - (n.intentos ?? 0),
      trabado: trabadoHasta(n.bloqueadoHasta, ahora),
    }));
}

/** Recepción pide fiar lo que debe una cuenta (con lo que paga de otros). */
export function pedirFiado(estado: EstadoClub, cuentaId: string, auth: Auth, ahora: Ahora): Desenlace {
  const c = cuentaDe(estado, cuentaId);
  if (!c || c.estado !== "abierta") return { ok: false, mensaje: "Esa cuenta no está abierta." };
  const monto = aCobrarDe(estado, c);
  const res = solicitarCredito(estado, { clienteId: c.clienteId ?? "", tipo: "fiado", monto, cuentaId }, auth, ahora);
  if (!res.ok) return { ok: false, mensaje: res.motivo };
  return { ok: true, mensaje: `Pedido enviado: fiarle ${pesos(monto)} a ${c.titular}. Avisale al dueño por WhatsApp y tipeá el código que te mande.` };
}

/** Recepción tipea el código del dueño. */
export function aprobarConCodigo(estado: EstadoClub, novedadId: string, codigo: string, auth: Auth, ahora: Ahora): Desenlace {
  const res = aprobarPorCodigo(estado, novedadId, { codigo }, auth, ahora);
  if (!res.ok) return { ok: false, mensaje: res.motivo };
  return { ok: true, mensaje: `Aprobado por ${res.aprobo}: ya podés pasar ${pesos(res.monto)} a su cuenta corriente.` };
}

/** SÓLO DEMO: el código que le saldría a un dueño de ejemplo en su celular (con su PIN de ejemplo). */
export function codigoDeLaDemo(estado: EstadoClub, novedadId: string): { duenio: string; codigo: string } | null {
  const d = datosAprobacion(estado, novedadId);
  const duenio = estado.usuarios.find((u) => u.rol === "duenio" && u.activo !== false && u.pin);
  if (!d || !duenio) return null;
  return { duenio: duenio.nombre, codigo: codigoAprobacion({ pin: duenio.pin, sal: estado.salPin, novedadId: d.id, clienteId: d.c, monto: d.m, fecha: d.f }) };
}

/** El mensaje de WhatsApp para el dueño (el texto; el link al celular del dueño es del modo real). */
export function mensajeParaElDuenio(estado: EstadoClub, novedadId: string): string | null {
  const d = datosAprobacion(estado, novedadId);
  if (!d) return null;
  const que = d.t === "fiado" ? `fiarle ${pesos(d.m)} a ${d.n}` : `habilitarle a ${d.n} la cuenta corriente hasta ${pesos(d.m)}`;
  return `Hola! ${d.p} pide tu OK para ${que}. Si estás de acuerdo, mandame el código que te da el sistema.`;
}
