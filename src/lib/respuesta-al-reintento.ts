// Lo que contesta el alta del mostrador cuando la clave del ticket YA estaba grabada.
//
// Lo llama `createOrder` (order-actions.ts) en su rama de reintento. Vive acá, y no adentro de la
// Server Action, por dos razones: un archivo "use server" publica cada export como endpoint (y
// esto recibe el `tenantId`), y así el test contra Postgres ejecuta ESTA función, la misma que
// corre en producción, sin sesión de Next.
//
// No es "use server": no es un endpoint. Recibe el `tenantId` ya resuelto (fail-closed, ADR-015)
// por quien lo llama, y lee con el cliente de siempre (RLS del negocio).

import { leerVentaGrabada, pedidoConClave, type InsertedOrder, type OrderInput } from "@/lib/order-core";
import { leerMedioDeCobro } from "@/lib/caja/medio-cobro";
import { cantidadOCero } from "@/lib/pos-peso";
import { horarioDelFormulario } from "@/lib/order-anulacion";
import { descuentoDelFormulario, lineasAManoDelFormulario } from "@/lib/venta-reglas";
import { prisma } from "@/lib/prisma";
import { ventaDeOrden, type VentaTicket } from "@/app/admin/(dashboard)/vender/reglas-venta";
import {
  comoQuedo,
  compararConLoGrabado,
  mensajeDeYaGrabadaIgual,
  pedidoDelReintento,
  textoDeYaGrabada,
  type PedidoDelReintento,
  type VentaYaGrabada,
} from "@/lib/reintento-de-venta";

export type RespuestaAlReintento =
  | { ok: true; mensaje: string; venta?: VentaTicket; yaEstaba: true }
  | { ok: false; error: string; tipo: "ya-grabada-distinta"; grabada: VentaYaGrabada }
  | { ok: false; error: string; tipo: "sin-confirmar" };

/**
 * Se lee la venta GRABADA y se compara con lo que pidió este envío (`result.solicitado`: sólo lo
 * que controla quien cobra, sin re-cotizar ni re-buscar la ficha):
 *   · igual y vigente → la grabada, con su ticket leído de la base, como siempre;
 *   · distinta, o anulada → `ya-grabada-distinta`: la grabada (#N, total, cliente, estado), las
 *     diferencias en palabras y, si todo lo distinto es "de más", lo que falta cobrar aparte.
 *     No se graba nada.
 *
 * La única lectura además de la grabada es el NOMBRE (y la unidad) de un producto que no está en
 * ella, para decir "Entraña 0,95 kg" en vez de un id. Nunca un precio.
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
  if (!s) {
    // Sin lo pedido no se puede decir que es lo mismo (no pasa con `insertOrder`, que siempre lo trae).
    return {
      ok: false,
      tipo: "sin-confirmar",
      error: "No pudimos comparar lo que mandaste con la venta grabada con este ticket. Fijate en Ventas del día antes de cobrarla de nuevo.",
    };
  }
  const enLaGrabada = new Set(grabada.items.map((it) => it.productId).filter(Boolean));
  const nuevos = [...new Set(s.productos.map((l) => l.productId))].filter((id) => !enLaGrabada.has(id));
  const catalogo = new Map(
    (nuevos.length
      ? await prisma.product.findMany({ where: { tenantId, id: { in: nuevos } }, select: { id: true, name: true, saleUnit: true } })
      : []
    ).map((p) => [p.id, { nombre: p.name, porPeso: p.saleUnit === "WEIGHT" }]),
  );
  const { diferencias, faltante } = compararConLoGrabado(grabada, s, catalogo);
  if (diferencias.length === 0 && !ticket.anulada) {
    const mensaje = mensajeDeYaGrabadaIgual({ code: grabada.code, esPedido, cobrada: Boolean(grabada.paid && grabada.paymentMethod) });
    return o.conTicket ? { ok: true, mensaje, venta: ticket, yaEstaba: true } : { ok: true, mensaje, yaEstaba: true };
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
    diferencias: diferencias.map((x) => x.texto),
    // Anulada, no hay "lo que falta": lo cargado entero es otra venta.
    faltante: ticket.anulada ? null : faltante,
    ...(o.conTicket ? { ticket } : {}),
  };
  return { ok: false, tipo: "ya-grabada-distinta", error: textoDeYaGrabada(g), grabada: g };
}

/**
 * Lo que pide el formulario de `createOrder`, SÓLO para comparar un reintento con lo grabado
 * (`pedidoDelReintento`): se lee tal cual, sin validar ni decidir nada, porque la clave se busca
 * ANTES de validar. No escribe nada: el medio que se GRABA sale de `medioDeCobroRequerido`
 * adentro de la action (lo exige medio-cobro.test.ts); acá el medio crudo sólo se compara.
 */
export function pedidoDelFormulario(
  formData: FormData,
  d: { channel: "COUNTER" | "ONLINE"; fulfillment: "PICKUP" | "DELIVERY"; scheduledRaw: string; aCuenta: boolean },
): PedidoDelReintento {
  const pagada = !d.aCuenta && (String(formData.get("paid")) === "on" || String(formData.get("paid")) === "true");
  const desc = descuentoDelFormulario(formData.get("descuentoTipo"), formData.get("descuentoValor"));
  const aMano = lineasAManoDelFormulario((campo) => formData.getAll(campo).map(String));
  const cantidades = formData.getAll("quantity").map((q) => cantidadOCero(String(q)));
  const pedido: OrderInput = {
    channel: d.channel,
    fulfillment: d.fulfillment,
    customerName: "",
    customerPhone: String(formData.get("customerPhone") || "").trim(),
    address: String(formData.get("address") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
    scheduledFor: horarioDelFormulario(d.scheduledRaw),
    paid: pagada,
    paymentMethod: pagada ? leerMedioDeCobro(formData.get("paymentMethod")) : null,
    items: formData.getAll("productId").map((id, i) => ({ productId: String(id), qty: cantidades[i] ?? 0 })),
    lineasAMano: aMano.ok ? aMano.lineas : [],
  };
  return pedidoDelReintento(pedido, {
    cupon: formData.get("cupon") as string | null,
    descuento: desc.ok && desc.pedido ? { pedido: desc.pedido } : null,
    aCuenta: d.aCuenta,
  });
}

/**
 * El alta rechazó por una regla de negocio (sin stock, sin precio): ¿hay una venta con esta
 * clave? Se busca DESPUÉS del rechazo. Si un envío anterior con la misma clave estaba en vuelo
 * (el corte), su transacción tenía tomada la fila del stock y la de este envío esperó a que
 * terminara (READ COMMITTED: el UPDATE espera el candado y vuelve a mirar). Entonces:
 *   · quedó grabada → es un reintento: se contesta con ella (`respuestaAlReintento`);
 *   · no hay nada → el rechazo va con `claveLibre`: la pantalla deja de decir "puede que esta
 *     misma venta ya se grabó" y dice "no se cobró" (refutador M4).
 * Lo que no cubre: un envío anterior que todavía no empezó su transacción (llegaría después).
 */
export async function rechazoDelAltaConClave(
  tenantId: string,
  clave: string,
  motivo: string,
  o: { solicitado: PedidoDelReintento; conTicket: boolean },
): Promise<RespuestaAlReintento | { ok: false; error: string; claveLibre: true }> {
  const previa = await pedidoConClave(tenantId, clave);
  if (previa) return respuestaAlReintento(tenantId, { ...previa, solicitado: o.solicitado }, { conTicket: o.conTicket });
  return { ok: false, error: motivo, claveLibre: true };
}
