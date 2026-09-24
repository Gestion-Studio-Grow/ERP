// Lo que contesta el alta del mostrador cuando la clave del ticket YA estaba grabada.
//
// Lo llama `createOrder` (order-actions.ts) en su rama de reintento. Vive acá, y no adentro de la
// Server Action, por dos razones: un archivo "use server" publica cada export como endpoint (y
// esto recibe el `tenantId`), y así el test contra Postgres ejecuta ESTA función, la misma que
// corre en producción, sin sesión de Next.
//
// No es "use server": no es un endpoint. Recibe el `tenantId` ya resuelto (fail-closed, ADR-015)
// por quien lo llama, y lee con el cliente de siempre (RLS del negocio).

import { leerVentaGrabada, type InsertedOrder } from "@/lib/order-core";
import { montoDeCupon } from "@/lib/venta-reglas";
import { round2 } from "@/lib/round";
import { ventaDeOrden, type VentaTicket } from "@/app/admin/(dashboard)/vender/reglas-venta";
import {
  comoQuedo,
  contenidoGrabado,
  contenidoPedido,
  diferenciasConLoGrabado,
  mensajeDeYaGrabadaIgual,
  textoDeYaGrabada,
  type VentaYaGrabada,
} from "@/lib/reintento-de-venta";

export type RespuestaAlReintento =
  | { ok: true; mensaje: string; venta?: VentaTicket }
  | { ok: false; error: string; tipo: "ya-grabada-distinta"; grabada: VentaYaGrabada }
  | { ok: false; error: string; tipo: "sin-confirmar" };

/**
 * Se lee la venta GRABADA y se compara con lo que pidió este envío (`result.solicitado`, ya
 * decidido por el alta con los precios de la base y la ficha del teléfono):
 *   · igual y vigente → la grabada, con su ticket leído de la base, como siempre;
 *   · distinta, o anulada → `ya-grabada-distinta`: la grabada (#N, total, cliente, estado) y las
 *     diferencias en palabras. No se graba nada: lo que cambió, si hace falta, se cobra aparte.
 *
 * El descuento de un cupón lo decide la transacción del alta (y lo consume), así que el de este
 * envío se calcula con la regla del cupón GRABADO cuando es el mismo código (`montoDeCupon`, la
 * misma cuenta que hizo el alta, sin volver a mirar los usos: el último lo gastó justamente la
 * grabada); con otro código no se sabe, y la diferencia de cupón ya se dice sola.
 */
export async function respuestaAlReintento(
  tenantId: string,
  result: InsertedOrder,
  o: { conTicket: boolean },
): Promise<RespuestaAlReintento> {
  const grabada = await leerVentaGrabada(tenantId, result.id);
  if (!grabada) {
    // La fila estaba hace un instante y ya no (la app no borra ventas): no se sabe qué quedó.
    return {
      ok: false,
      tipo: "sin-confirmar",
      error: "No pudimos confirmar cómo quedó la venta grabada con este ticket. Fijate en Ventas del día antes de cobrarla de nuevo.",
    };
  }
  // Pedido o venta según lo GRABADO: es de lo que se habla.
  const esPedido = grabada.channel === "ONLINE";
  const ticket = ventaDeOrden(grabada);
  const s = result.solicitado;
  const regla = grabada.reglaDelCupon;
  const descuentoDelCupon =
    s?.cupon && regla && regla.codigo === s.cupon ? montoDeCupon(regla.tipo, regla.valor, round2(s.subtotal - (s.envio ?? 0))) : null;
  // Sin lo pedido no se puede decir que es lo mismo: se dice que no se pudo comparar.
  const diferencias = s
    ? diferenciasConLoGrabado(contenidoGrabado(grabada), contenidoPedido(s, descuentoDelCupon))
    : ["No se pudo comparar lo que mandaste con lo grabado."];
  if (diferencias.length === 0 && !ticket.anulada) {
    const mensaje = mensajeDeYaGrabadaIgual({ code: grabada.code, esPedido, cobrada: Boolean(grabada.paid && grabada.paymentMethod) });
    return o.conTicket ? { ok: true, mensaje, venta: ticket } : { ok: true, mensaje };
  }
  const g: VentaYaGrabada = {
    id: grabada.id,
    code: grabada.code,
    esPedido,
    total: grabada.total,
    como: comoQuedo(grabada, esPedido),
    cliente: ticket.cliente,
    telefono: ticket.telefono,
    anulada: ticket.anulada,
    diferencias,
    ...(o.conTicket ? { ticket } : {}),
  };
  return { ok: false, tipo: "ya-grabada-distinta", error: textoDeYaGrabada(g), grabada: g };
}
