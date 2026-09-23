"use server";

// Capability POS / Orden (ADR-003 "Orden/Venta", Fase 2 POS).
// Capability del CORE — sirve a cualquier vertical retail; la carnicería `magra`
// la usa para vender cortes por kg (venta por peso) y tomar pedidos de vidriera.
// Aislamiento multi-tenant: cada write escribe `tenantId` (getCurrentTenantId,
// fail-closed ADR-015) y cada read filtra por él, igual que el resto del Core.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditAdmin, auditPublic } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { retailWordingForSlug } from "@/blueprints/retail";
import { getStorefrontCopy } from "@/tenants/storefront";
import { insertOrder, buildOrderLines, orderSubtotal, type OrderPaymentMethod } from "@/lib/order-core";
import { recordCashSaleMovementInTx } from "@/lib/caja/cash-sale";
import { medioDeCobroRequerido, mensajeYaCobrado } from "@/lib/caja/medio-cobro";
import { permiteVenderSinStock, productosQuePuedenQuedarNegativos } from "@/lib/stock/pos-stock-rules";
import { tenantTransaction } from "@/lib/rls";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { cantidadOCero } from "@/lib/pos-peso";
import { fmtMoneyARS } from "@/components/ui/format";
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import { isFrozenDay } from "@/lib/caja/cierre-diario";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { logger } from "@/lib/logger";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { recordMovement, round3 } from "@/lib/stock/ledger";
import { round2 } from "@/lib/round";
import {
  anularVentaInTx,
  AnulacionVentaRechazada,
  fronteraDeVenta,
  planEdicionDeLineas,
  mensajeEdicionRechazada,
  deltasDeStock,
  detalleStockAjustadoPorEdicion,
  MOTIVO_ANULACION_SIN_TEXTO,
  EDICION_ACTOR_PREFIX,
} from "@/lib/order-anulacion";
import type { $Enums } from "@/generated/prisma/client";

type OrderStatus = $Enums.OrderStatus;

const ORDERS_PATH = "/admin/pedidos";

// Flujo de estados de un pedido. El mostrador lo empuja hacia adelante; no hay
// vuelta atrás (una cancelación es un estado terminal aparte). READY = listo para
// que el cliente retire o para despachar.
const STATUS_FLOW: Record<OrderStatus, OrderStatus | null> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "READY",
  READY: "DELIVERED",
  DELIVERED: null,
  CANCELLED: null,
};

// --- Loader de la pantalla POS / bandeja de pedidos ---

export async function getPosData() {
  await requireCapability("orders:read");
  // Endurecimiento defensivo (cinturón-y-tiradores sobre RLS): filtro `tenantId` EXPLÍCITO en
  // cada read del backoffice. RLS ya aísla en prod, pero el predicado explícito no depende de que
  // el flag esté ON y además ENCIENDE los índices `@@index([tenantId, ...])` que ya existen.
  const tenantId = await getCurrentTenantId();
  const [orders, products] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { items: true },
    }),
    // Solo productos vendibles: activos, no borrados, con algún precio cargado.
    prisma.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        active: true,
        OR: [{ price: { not: null } }, { pricePerKg: { not: null } }],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true, unit: true },
    }),
  ]);
  return { orders, products };
}

// --- Creación de orden: el Core compartido vive en `order-core.ts` ---
//
// `insertOrder` (importado arriba) es el único lugar donde se arma una orden: lo
// reusan el POS del backoffice (`createOrder`, con auth), la vidriera pública
// (`placeOnlineOrder`, sin auth) y la API de ingesta externa (ADR-020 §II). Acá
// solo quedan los adaptadores de FormData → OrderInput de las Server Actions.

type PaymentMethod = OrderPaymentMethod;

// Parsea las líneas (arrays paralelos productId[]/quantity[], patrón getAll del
// Core) de un FormData a la forma que espera insertOrder.
//
// La cantidad NO se lee con `Number()`. Con `Number("1,3")` —un kilo trescientos escrito
// como se escribe en Argentina— sale `NaN`; y el `<input type="number">` de antes ni
// siquiera dejaba llegar la coma: medido en Chromium 141, "1,3" tecleado quedaba "13" y el
// ticket salía por 13 kg (el detalle, en el campo de cantidad del PosForm y en pos-peso.ts).
// `cantidadOCero` lee coma y punto como el mismo separador decimal y redondea a gramos. Acá se
// vuelve a parsear aunque el navegador ya mande el valor canónico: el server NO confía en lo
// que le llega del cliente, y este mismo `parseItems` lo usa también la vidriera pública,
// donde el que tipea es un desconocido.
function parseItems(formData: FormData): { productId: string; qty: number }[] {
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map((q) => cantidadOCero(String(q)));
  return productIds.map((id, i) => ({ productId: id, qty: quantities[i] }));
}

// Estado que las acciones del mostrador le devuelven a la pantalla.
//
// POR QUÉ SE DEVUELVE Y NO SE LANZA: un error LANZADO desde una Server Action llega al
// cliente con el mensaje REDACTADO (Next no reenvía `error.message` en producción), así que
// "el día de caja está cerrado" y "se cayó la base" se ven exactamente iguales — y la persona
// del mostrador no puede hacer nada con ninguno de los dos. Un valor DEVUELTO viaja entero.
export type OrderActionState = { ok: true; mensaje?: string } | { ok: false; error: string } | null;

function errorDeAccion(err: unknown, generico: string): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error && err.message ? err.message : generico };
}

// I7 (ADR-064): la imputación de la venta cobrada a la caja YA NO es una segunda tx
// best-effort. Ahora va ATÓMICA con la venta, dentro de la MISMA transacción:
//  - al CREAR la venta ya cobrada → `insertOrder(..., { imputarCajaActor })` (order+stock+caja
//    todo-o-nada);
//  - al marcar cobrado DESPUÉS (`cobrarPedido`) → update del pedido + asiento de caja en una
//    sola `tenantTransaction`.
// Un fallo real de DB en el asiento aborta toda la operación (la venta no queda cobrada sin su
// movimiento de caja → el arqueo nunca descuadra). Las condiciones benignas (no cobrada, medio
// que el libro no traduce, total <= 0, ya imputada) vuelven como { recorded:false } sin abortar:
// la venta se concreta. Los tres medios se asientan (MP y transferencia en la columna MP), y sin
// turno abierto también: con `sessionId` null (leído de caja/cash-sale.ts).

// --- Crear pedido / venta de mostrador (el "checkout" del backoffice) ---
//
// Cubre los dos caminos operados por el mostrador: venta presencial (channel
// COUNTER, se cobra en el acto) y toma de pedido con retiro/delivery (channel
// ONLINE → PENDING). Requiere capability de mostrador.
export async function createOrder(formData: FormData): Promise<OrderActionState> {
  const user = await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();

  const channel = String(formData.get("channel") || "COUNTER") === "ONLINE" ? "ONLINE" : "COUNTER";
  const fulfillment =
    String(formData.get("fulfillment") || "PICKUP") === "DELIVERY" ? "DELIVERY" : "PICKUP";
  const scheduledRaw = String(formData.get("scheduledFor") || "").trim();
  const paid = String(formData.get("paid")) === "on" || String(formData.get("paid")) === "true";

  // CON QUÉ SE COBRÓ (MAG-1). Una venta cobrada sin medio ya no se graba como "no cobrada" en
  // silencio ni cae en EFECTIVO por default: se rechaza y la pantalla dice que falta elegirlo.
  // La decisión entera vive en `medioDeCobroRequerido` (caja/medio-cobro.ts, probada con
  // datos); acá sólo se usa el medio que ella devuelve. No va en `insertOrder`: la vidriera y
  // la ingesta externa no la heredan.
  const medio = medioDeCobroRequerido({ channel, paid, paymentMethod: formData.get("paymentMethod") });
  if (!medio.ok) return { ok: false, error: medio.error };
  const paymentMethod: PaymentMethod | null = medio.paymentMethod;

  // FRONTERA DEL DÍA CERRADO. El libro, el cierre diario, las compras, las comisiones, la
  // caja y los turnos rechazan escribir sobre un día ya arqueado y firmado; los DOS caminos de
  // cobro de este archivo —`createOrder` acá y `cobrarPedido` más abajo— eran los que no la
  // miraban. Cerrar la caja a las 20:00 y cobrar una venta a las 20:05 dejaba el arqueo
  // diciendo 6 movimientos y el libro del mismo día diciendo 8, y el descuadre aparecía recién
  // al mes siguiente, sin forma de saber cuál de las dos cifras era la buena.
  //
  // Se frena SÓLO la venta que va a escribir en la caja. Tomar un pedido sin cobrar no toca
  // el libro: bloquearlo también sería inventar un candado que no protege nada y dejar al
  // mostrador sin poder anotar el pedido de mañana.
  //
  // La DECISIÓN entera vive en `fronteraDeVenta` (pura, probada sin base); acá sólo se le
  // pasan los dos hechos que hay que ir a buscar: hasta qué día está cerrado y qué día es hoy
  // en la zona del negocio.
  const frontera = fronteraDeVenta({
    paid,
    paymentMethod,
    hoy: dateStrInBusinessTz(new Date()),
    cerradoHasta: await lastClosedDay(tenantId),
    esDiaCerrado: isFrozenDay,
  });
  if (frontera.bloquea) return { ok: false, error: frontera.error };

  // Idempotencia del ticket (A-1). La clave la genera el CLIENTE una vez por ticket y la
  // renueva al limpiarlo, no el server: con una clave fija el mostrador no podría vender dos
  // veces lo mismo a dos personas distintas (que es lo normal en una carnicería), y sin
  // ninguna clave el reintento de red, el botón "recargar" del navegador o la segunda pestaña
  // cobran DOS VECES — con ticket alto y en efectivo. `useFormStatus` sólo cierra la ventana
  // del doble clic dentro de la misma pestaña; esto la cierra a nivel base.
  const idempotencyKey = String(formData.get("idempotencyKey") || "").trim() || null;

  // MAG-4: qué líneas pueden dejar el stock en negativo en vez de abortar la venta. La unidad
  // de venta se lee del Product en la base (filtrado por tenant), NUNCA del formulario: el
  // navegador no decide qué se vende por peso. La regla (`productosQuePuedenQuedarNegativos`,
  // pos-stock-rules.ts) sólo abre la excepción para lo que se vende por peso en el mostrador;
  // un pedido ONLINE devuelve la lista vacía y bloquea como siempre. `insertOrder` recibe el
  // dato ya decidido: no lo infiere, así que la vidriera y la ingesta externa no lo heredan.
  const items = parseItems(formData);
  const permitirNegativoPorProducto = productosQuePuedenQuedarNegativos(
    await prisma.product.findMany({
      where: { tenantId, id: { in: items.map((l) => l.productId).filter(Boolean) } },
      select: { id: true, saleUnit: true },
    }),
    channel,
  );

  // I7 (ADR-064): la imputación a caja de la venta cobrada va ATÓMICA con la orden+stock
  // dentro de `insertOrder` (una sola tx, todo-o-nada). `imputarCajaActor` la activa: solo el
  // mostrador imputa caja física. Un fallo de DB al asentar la caja aborta toda la venta (no
  // queda cobrada sin su movimiento → el arqueo nunca descuadra).
  let result;
  try {
    result = await insertOrder(
      tenantId,
      {
        channel,
        fulfillment,
        customerName: String(formData.get("customerName") || "").trim() || "Mostrador",
        customerPhone: String(formData.get("customerPhone") || "").trim(),
        address: String(formData.get("address") || "").trim() || null,
        notes: String(formData.get("notes") || "").trim() || null,
        // scheduledFor es una preferencia blanda (horario de retiro/entrega); MVP la
        // interpreta en hora local del server (provisional; unificar con TZ del tenant).
        scheduledFor: scheduledRaw ? new Date(scheduledRaw) : null,
        paid,
        paymentMethod,
        items,
      },
      { imputarCajaActor: `user:${user.id}`, idempotencyKey, permitirNegativoPorProducto },
    );
  } catch (err) {
    // El mensaje de dominio (sin stock, sin precio, sin dirección) llega ENTERO a la pantalla
    // porque se devuelve en vez de lanzarse. Antes el POS mostraba siempre el mismo texto
    // genérico "revisá el stock", incluso cuando el problema era otro.
    return errorDeAccion(
      err,
      "No se pudo registrar la venta. Revisá las cantidades y volvé a intentar.",
    );
  }

  // Reintento deduplicado: el pedido ya existía. No se re-audita (el alta real ya dejó su
  // rastro) y no se vuelve a tocar el estado.
  if (result.dedup) {
    revalidatePath(ORDERS_PATH);
    return { ok: true, mensaje: "Esa venta ya estaba registrada (no se cobró dos veces)." };
  }

  // La venta de mostrador COBRADA y RETIRADA ya terminó: nace DELIVERED. **Sólo en rubro
  // MOSTRADOR.**
  //
  // Nacía CONFIRMED y la bandeja da por "abierto" todo lo que no sea DELIVERED/CANCELLED, así
  // que cada ticket de mostrador se quedaba ahí para siempre. Con 100 tickets al día, a las
  // dos horas el pedido online que SÍ hay que preparar no se ve: la bandeja deja de ser una
  // lista de trabajo y pasa a ser un historial que nadie mira. Se filtra por `status`
  // CONFIRMED para no pisar un estado que otra pestaña ya movió.
  //
  // POR QUÉ VA GATEADO POR RUBRO, y no para todos: en la bandeja, un pedido DELIVERED cae en
  // la lista de cerrados y deja de ofrecer sus acciones. Para una estética —que hace un puñado
  // de ventas de mostrador por día y no tiene la bandeja tapada— esto es sólo perder la forma
  // de corregir una venta, sin ganar nada a cambio. El problema que se está resolviendo es de
  // volumen, y el volumen es del rubro de mostrador. El día que la bandeja sepa mostrar las
  // acciones de un pedido cerrado, esta distinción sobra.
  const { isRetail } = await getTenantIdentity();
  const naceEntregada =
    isRetail && channel === "COUNTER" && fulfillment === "PICKUP" && paid && paymentMethod != null;
  if (naceEntregada) {
    await prisma.order.updateMany({
      where: { id: result.id, tenantId, status: "CONFIRMED" },
      data: { status: "DELIVERED" },
    });
  }

  await auditAdmin({
    action: "create",
    entity: "Order",
    entityId: result.id,
    changes: {
      code: result.code,
      channel,
      fulfillment,
      total: result.subtotal,
      lines: result.lines,
      ...(naceEntregada ? { status: "DELIVERED" } : {}),
    },
  });

  revalidatePath(ORDERS_PATH);
  return { ok: true };
}

// --- Tomar pedido desde la vidriera pública (sin auth) ---
//
// La misma capability POS del Core, pero disparada por un cliente final en la
// vidriera: siempre ONLINE, siempre PENDING y SIN cobrar (el mostrador confirma y
// cobra al preparar). Escribe con el tenant actual (fail-closed ADR-015) y audita
// como acción pública. Al terminar redirige a la página de gracias con el nº.
export async function placeOnlineOrder(formData: FormData) {
  const tenantId = await getCurrentTenantId();

  const fulfillment =
    String(formData.get("fulfillment") || "PICKUP") === "DELIVERY" ? "DELIVERY" : "PICKUP";
  const customerName = String(formData.get("customerName") || "").trim();
  const customerPhone = String(formData.get("customerPhone") || "").trim();
  if (!customerName || !customerPhone) {
    throw new Error("Necesitamos tu nombre y un teléfono de contacto para tomar el pedido.");
  }

  // A-1: clave de idempotencia del carrito (la genera el cliente por pedido). Con el doble
  // submit del mobile —el camino infeliz #1— los dos envíos traen la MISMA clave → `insertOrder`
  // devuelve el mismo pedido en vez de crear otro y volver a descontar stock.
  const idempotencyKey = String(formData.get("idempotencyKey") || "").trim() || null;

  const result = await insertOrder(tenantId, {
    channel: "ONLINE",
    fulfillment,
    customerName,
    customerPhone,
    address: String(formData.get("address") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
    scheduledFor: null,
    paid: false,
    paymentMethod: null,
    items: parseItems(formData),
  }, { idempotencyKey });

  // Solo se audita el ALTA real: si `dedup` es true, el pedido ya existía (reintento) y ya se
  // auditó en el primer envío → no se duplica el rastro.
  if (!result.dedup) {
    await auditPublic({
      action: "create",
      entity: "Order",
      entityId: result.id,
      clientPhone: customerPhone,
      changes: { code: result.code, channel: "ONLINE", fulfillment, total: result.subtotal },
    });
    // El backoffice ve el pedido nuevo en su bandeja al revalidar.
    revalidatePath(ORDERS_PATH);
  }
  redirect(`/tienda/gracias?pedido=${result.code}`);
}

// --- Avanzar estado del pedido ---

export async function advanceOrderStatus(formData: FormData) {
  await requireCapability("orders:manage");
  const id = String(formData.get("id"));
  const current = await prisma.order.findUnique({ where: { id }, select: { status: true } });
  if (!current) return;
  const next = STATUS_FLOW[current.status];
  if (!next) return; // terminal (DELIVERED / CANCELLED): no avanza
  await prisma.order.update({ where: { id }, data: { status: next } });
  await auditAdmin({
    action: "update",
    entity: "Order",
    entityId: id,
    changes: { status: { from: current.status, to: next } },
  });
  revalidatePath(ORDERS_PATH);
}

// --- Marcar cobrado ---

async function setOrderPaidCore(
  id: string,
  methodRaw: string,
): Promise<OrderActionState> {
  const user = await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();
  if (!id) return { ok: false, error: "Falta identificar el pedido a cobrar." };

  // CON QUÉ SE COBRÓ (MAG-1), la misma regla que el alta. Antes acá cualquier valor vacío o
  // desconocido se convertía en EFECTIVO: el cobro con MP que llegaba sin medio se asentaba
  // en la columna del cajón. Ahora sin medio no se cobra, y la bandeja lo muestra.
  const medio = medioDeCobroRequerido({ paid: true, paymentMethod: methodRaw, contexto: "cobro" });
  if (!medio.ok) return { ok: false, error: medio.error };
  // `paid: true` garantiza que la regla devolvió un medio; el `!` sólo se lo dice a tsc.
  const method: PaymentMethod = medio.paymentMethod!;

  // MISMA FRONTERA QUE EL ALTA, y por la misma razón. Este camino también escribe una fila en
  // el libro (`recordCashSaleMovementInTx`, abajo) y tampoco la miraba: cobrar un pedido
  // pendiente después de haber cerrado la caja metía plata en un día ya arqueado y firmado.
  // Sin esta guarda, además, el mensaje que el POS le da a la persona cuando el día está
  // cerrado —"dejalo sin cobrar y cobralo mañana"— tendría una trampa: si lo cobraba desde la
  // bandeja el MISMO día, entraba igual.
  const frontera = fronteraDeVenta({
    paid: true,
    paymentMethod: method,
    hoy: dateStrInBusinessTz(new Date()),
    cerradoHasta: await lastClosedDay(tenantId),
    esDiaCerrado: isFrozenDay,
    contexto: "cobro",
  });
  if (frontera.bloquea) return { ok: false, error: frontera.error };

  // I7 (ADR-064): marcar cobrado + asentar la caja son ATÓMICOS (una sola tx). Si el asiento
  // de caja falla por un error de DB, el "cobrado" también se revierte. El asiento es
  // idempotente por orderId; sin turno abierto se asienta igual, con sessionId null.
  //
  // SÓLO SE COBRA LO QUE NO ESTABA COBRADO. Antes era `tx.order.update({ where: { id } })`,
  // sin mirar `paid`: el segundo «Cobrar» desde otra pestaña, con otro medio elegido,
  // reescribía `Order.paymentMethod` (EFECTIVO → MERCADOPAGO) mientras el asiento del libro se
  // quedaba en EFECTIVO: el asiento VENTA es uno por pedido (el pre-check de
  // `recordCashSaleMovementInTx` devuelve "already-recorded" y el @@unique(tenantId, orderId,
  // type) cierra la carrera), así que la tx commiteaba el medio nuevo sin asiento nuevo. Pedido
  // y libro quedaban diciendo cosas distintas (leído del código; no hay test contra base que lo
  // reproduzca). Con `updateMany` y `paid: false` en el filtro, el segundo cobro no toca nada
  // (count 0) y se le dice con qué medio había quedado.
  type Cobro =
    | { tipo: "cobrado"; order: { id: string; code: number; total: number } }
    | { tipo: "ya-cobrado"; code: number; medioRegistrado: string | null }
    | { tipo: "no-existe" };
  let cobro: Cobro;
  try {
    cobro = await tenantTransaction(
      async (tx): Promise<Cobro> => {
        const res = await tx.order.updateMany({
          where: { id, tenantId, paid: false },
          data: { paid: true, paymentMethod: method },
        });
        const order = await tx.order.findFirst({
          where: { id, tenantId },
          select: { id: true, code: true, total: true, paymentMethod: true },
        });
        if (!order) return { tipo: "no-existe" };
        if (res.count === 0) {
          return { tipo: "ya-cobrado", code: order.code, medioRegistrado: order.paymentMethod };
        }
        await recordCashSaleMovementInTx(tx, tenantId, {
          orderId: order.id,
          orderCode: order.code,
          paid: true,
          paymentMethod: method,
          total: order.total,
          actor: `user:${user.id}`,
        });
        return { tipo: "cobrado", order: { id: order.id, code: order.code, total: order.total } };
      },
      { tenantId },
    );
  } catch (e) {
    // Defensa que queda de A-5. Con `paid: false` en el filtro, el segundo cobro concurrente
    // espera el lock de la fila y sale por "ya-cobrado" sin llegar a asentar, así que este
    // choque del @@unique del asiento VENTA no debería darse. Si igual se diera, la tx aborta
    // entera —el `paid` también— y no hay nada que reparar: ni re-auditoría ni un 500.
    if (isUniqueViolation(e, "orderId")) {
      revalidatePath(ORDERS_PATH);
      return { ok: true, mensaje: "Ese pedido ya estaba cobrado." };
    }
    return errorDeAccion(e, "No se pudo marcar el pedido como cobrado.");
  }

  if (cobro.tipo === "no-existe") return { ok: false, error: "No se encontró el pedido a cobrar." };
  if (cobro.tipo === "ya-cobrado") {
    revalidatePath(ORDERS_PATH);
    return mensajeYaCobrado({ code: cobro.code, medioRegistrado: cobro.medioRegistrado, medioElegido: method });
  }

  const { order } = cobro;
  await auditAdmin({ action: "update", entity: "Order", entityId: order.id, changes: { paid: true, method } });

  revalidatePath(ORDERS_PATH);
  return { ok: true, mensaje: `Pedido #${order.code} cobrado: ${fmtMoneyARS(order.total)}.` };
}

/**
 * Cobrar un pedido desde la bandeja (`CobrarPedidoForm`): el motivo del rechazo —falta elegir
 * el medio, el día está cerrado, ya estaba cobrado con otro medio— llega entero a la pantalla.
 * Mantiene la firma `(prev, formData)` de `useActionState`, aunque hoy se invoca directo. Sin relleno: si no vino medio, la regla lo rechaza.
 *
 * (`setOrderPaid`, la versión muda que lanzaba y rellenaba con EFECTIVO, se sacó: su único
 * llamador era el botón viejo de la bandeja, y en un archivo "use server" cada export es un
 * endpoint público que hay que mantener cerrado.)
 */
export async function cobrarPedido(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  return setOrderPaidCore(
    String(formData.get("id") || "").trim(),
    String(formData.get("paymentMethod") || "").trim(),
  );
}

// --- Anular una venta (lo que antes era "Cancelar") ---
//
// Antes esta acción hacía UN `update` de estado y nada más: el pedido decía "Cancelado" y al
// mismo tiempo su plata seguía en el libro y en el arqueo, y su kilaje seguía descontado del
// stock. Ahora asienta la CONTRAPARTIDA y devuelve la mercadería, con el criterio que ya usa
// la anulación de cobros de turno (ver `src/lib/order-anulacion.ts` para el porqué completo).
//
// Y ADEMÁS ACEPTA PEDIDOS YA ENTREGADOS, que antes rechazaba en silencio (`status ===
// "DELIVERED"` → `return` sin decir nada). Desde que la venta de mostrador cobrada nace
// DELIVERED, rechazar el estado terminal dejaría sin corrección al caso que una carnicería
// corrige TODOS LOS DÍAS: el paquete decía 1,240 y eran 1,310.
async function anularVentaCore(
  orderId: string,
  motivo: string,
  devuelveStock: boolean,
): Promise<OrderActionState> {
  const user = await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();
  if (!orderId) return { ok: false, error: "Falta identificar el pedido a anular." };

  // La frontera se lee ANTES de abrir la transacción (no depende de nada que la tx cambie),
  // igual que en el libro y en el cierre diario.
  const cerradoHasta = await lastClosedDay(tenantId);

  let resultado;
  try {
    resultado = await tenantTransaction(
      (tx) =>
        anularVentaInTx(tx, tenantId, {
          orderId,
          motivo,
          actor: `user:${user.id}`,
          devuelveStock,
          diaCerradoHasta: cerradoHasta,
          esDiaCerrado: isFrozenDay,
          diaDe: dateStrInBusinessTz,
        }),
      { tenantId },
    );
  } catch (err) {
    if (err instanceof AnulacionVentaRechazada) return { ok: false, error: err.message };
    // Carrera real: dos anulaciones simultáneas: la 2ª choca el @@unique(tenantId, orderId,
    // type) al asentar el EGRESO. Ya está anulada, no hay nada que reparar.
    if (isUniqueViolation(err, "orderId")) {
      revalidatePath(ORDERS_PATH);
      return { ok: true, mensaje: "Esa venta ya estaba anulada." };
    }
    return errorDeAccion(err, "No se pudo anular la venta.");
  }

  if (!resultado.applied) {
    revalidatePath(ORDERS_PATH);
    return { ok: true, mensaje: "Esa venta ya estaba anulada." };
  }

  await auditAdmin({
    action: "update",
    entity: "Order",
    entityId: orderId,
    changes: {
      status: "CANCELLED",
      motivo,
      montoRevertido: resultado.montoRevertido,
      reversaId: resultado.reversaId,
      stockDevuelto: resultado.stockDevuelto,
    },
  });
  revalidatePath(ORDERS_PATH);

  // El mensaje DICE lo que se movió. Una anulación que sólo contesta "listo" obliga a ir a
  // mirar el libro y el stock para saber si hizo algo.
  const partes: string[] = [`Venta #${resultado.code} anulada.`];
  if (resultado.montoRevertido > 0) {
    partes.push(`Se devolvieron ${fmtMoneyARS(resultado.montoRevertido)} en el libro de caja.`);
  }
  if (resultado.stockDevuelto.length > 0) {
    partes.push(
      `Volvió al stock: ${resultado.stockDevuelto.map((d) => `${d.qty} de ${d.name}`).join(", ")}.`,
    );
  }
  return { ok: true, mensaje: partes.join(" ") };
}

/**
 * Acción con estado, para la pantalla que pide el MOTIVO (`useActionState`). Es la que
 * conviene cablear: el motivo es lo único que explica la plata faltante seis meses después.
 */
export async function anularVenta(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const motivo = String(formData.get("motivo") || "").trim() || MOTIVO_ANULACION_SIN_TEXTO;
  // "La mercadería no volvió" es una CASILLA, no el default: en el caso diario —se pesó mal y
  // se rehace la venta— la carne nunca salió del mostrador y tiene que volver al stock.
  const devuelveStock = String(formData.get("stockNoVolvio") || "") !== "on";
  return anularVentaCore(String(formData.get("id") || "").trim(), motivo, devuelveStock);
}

/**
 * Compatibilidad con el botón "Cancelar" que YA está vivo en la bandeja
 * (`pedidos/page.tsx`), que postea sin motivo y descarta el valor devuelto. Mantiene la firma
 * `Promise<void>` a propósito: cambiarla rompería el `<form action={...}>` de esa página.
 *
 * **NO LANZA, y es deliberado.** Este botón no tiene diálogo de confirmación y lo aprieta hoy
 * la dueña de la estética, el único tenant vivo. No hay `error.tsx` bajo `src/app/admin/`, así
 * que una excepción acá le vuela la pantalla entera y en producción Next redacta el mensaje:
 * vería un error genérico, sin saber qué pasó ni qué hacer. Un rechazo —hoy sólo uno: el día
 * del asiento ya está cerrado— deja el pedido como estaba y queda en el log; el saldo del día
 * cerrado, que es lo que la guarda protege, no se toca igual.
 *
 * Es una salida de compromiso hasta que la pantalla pase a `anularVenta`, que sí devuelve el
 * motivo para mostrarlo. Mientras tanto: el caso normal (revertir plata y stock) funciona, y
 * el caso raro no rompe nada.
 */
export async function cancelOrder(formData: FormData): Promise<void> {
  const id = String(formData.get("id") || "").trim();
  const r = await anularVentaCore(id, MOTIVO_ANULACION_SIN_TEXTO, true);
  if (r && !r.ok) {
    logger.warn("pedidos", "cancelOrder: la anulación se rechazó y la pantalla no puede mostrarlo", {
      orderId: id,
      motivo: r.error,
    });
  }
}

// --- Editar las líneas de un pedido todavía no cobrado (el peso real) ---
//
// La regla y el porqué están en `order-anulacion.ts` (`planEdicionDeLineas`). Acá sólo
// se persiste: recalcular líneas y total, y mover el stock por DELTA.
export async function updateOrderItems(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, error: "Falta identificar el pedido a editar." };

  const wanted = parseItems(formData).filter((l) => l.productId && l.qty > 0);

  let out: { code: number; total: number; antes: number };
  try {
    out = await tenantTransaction(
      async (tx) => {
        const order = await tx.order.findFirst({
          where: { tenantId, id },
          select: {
            id: true,
            code: true,
            status: true,
            paid: true,
            total: true,
            items: {
              select: {
                productId: true,
                name: true,
                quantity: true,
                product: { select: { trackStock: true } },
              },
            },
          },
        });

        // La invariante dura: si el pedido ya tiene plata asentada, no se edita. Se chequea
        // contra el LIBRO, no contra el flag `paid` (ver `planEdicionDeLineas`).
        const asiento = order
          ? await tx.cashMovement.findFirst({
              where: { tenantId, orderId: id },
              select: { id: true },
            })
          : null;

        const products = order
          ? await tx.product.findMany({
              where: {
                id: { in: wanted.map((l) => l.productId) },
                tenantId,
                deletedAt: null,
                active: true,
              },
              select: {
                id: true,
                name: true,
                saleUnit: true,
                price: true,
                pricePerKg: true,
                trackStock: true,
              },
            })
          : [];
        const lines = buildOrderLines(products, wanted);

        const plan = planEdicionDeLineas({
          existe: Boolean(order),
          paid: Boolean(order?.paid),
          status: String(order?.status ?? ""),
          tieneAsientoDeCaja: Boolean(asiento),
          lineasValidas: lines.length,
        });
        if (!plan.ok) throw new Error(mensajeEdicionRechazada(plan.motivo));

        // Stock por DELTA. Va ANTES de reescribir las líneas: si un aumento de peso no tiene
        // stock, `recordMovement` lanza, la tx se aborta entera y el pedido queda como estaba.
        //
        // Salvo (MAG-4) cuando el aumento es de un producto POR PESO: el paquete ya se pesó y
        // está en la mano, y que pese más de lo que el sistema cree es justamente el caso que
        // esta edición viene a corregir. Ahí la VENTA sale aunque el stock quede en negativo.
        // La unidad sale de `lines`, que se armó con el Product leído en ESTA tx, no del
        // formulario. Las devoluciones (delta < 0, AJUSTE positivo) no pasan por la guarda.
        for (const d of deltasDeStock(
          order!.items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            trackStock: Boolean(it.product?.trackStock),
          })),
          lines.map((l) => ({ productId: l.productId, quantity: l.quantity, trackStock: l.trackStock })),
        )) {
          // El nombre sale de la línea nueva o, si el producto se SACÓ del pedido, del
          // snapshot de la vieja: un movimiento de stock que dice "producto" no se investiga.
          const nombre =
            lines.find((l) => l.productId === d.productId)?.name ??
            order!.items.find((it) => it.productId === d.productId)?.name ??
            "producto";
          await recordMovement(tx, {
            tenantId,
            productId: d.productId,
            // Más peso del estimado → sale como VENTA (con la guarda anti-oversell). Menos
            // peso → vuelve como AJUSTE positivo, el mismo tipo que usa la anulación mientras
            // el enum de stock no tenga un valor propio para la devolución.
            type: d.delta > 0 ? "VENTA" : "AJUSTE",
            qty: d.delta > 0 ? d.delta : round3(-d.delta),
            orderId: id,
            createdBy: `${EDICION_ACTOR_PREFIX}user:${user.id}`,
            reason: detalleStockAjustadoPorEdicion(order!.code, nombre, d.delta),
            label: nombre,
            allowNegative:
              d.delta > 0 &&
              permiteVenderSinStock({
                saleUnit: lines.find((l) => l.productId === d.productId)?.saleUnit ?? "",
                contexto: "EDICION_PESO_REAL",
              }),
          });
        }

        await tx.orderItem.deleteMany({ where: { tenantId, orderId: id } });
        await tx.orderItem.createMany({
          data: lines.map((l) => ({
            tenantId,
            orderId: id,
            productId: l.productId,
            name: l.name,
            saleUnit: l.saleUnit,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
          })),
        });

        const subtotal = orderSubtotal(lines);
        await tx.order.updateMany({
          where: { tenantId, id },
          // `discount` sigue en 0 en todo el POS: subtotal y total son el mismo número.
          data: { subtotal, total: subtotal },
        });

        return { code: order!.code, total: subtotal, antes: round2(order!.total) };
      },
      { tenantId },
    );
  } catch (err) {
    return errorDeAccion(err, "No se pudo actualizar el pedido.");
  }

  await auditAdmin({
    action: "update",
    entity: "Order",
    entityId: id,
    changes: { total: { from: out.antes, to: out.total }, lines: wanted.length },
  });
  revalidatePath(ORDERS_PATH);
  const dif = round2(out.total - out.antes);
  return {
    ok: true,
    mensaje:
      dif === 0
        ? `Pedido #${out.code} actualizado. El total no cambió: ${fmtMoneyARS(out.total)}.`
        : `Pedido #${out.code} actualizado al peso real: ${fmtMoneyARS(out.antes)} → ${fmtMoneyARS(out.total)} (${dif > 0 ? "+" : "−"}${fmtMoneyARS(Math.abs(dif))}).`,
  };
}

// --- Loader público de la vidriera (sin auth) ---
//
// Lo consume la vidriera pública por tenant (`/tienda`). Devuelve el nombre del
// negocio, su branding (BusinessSettings), el **wording del rubro** (para que la
// vidriera se sienta hecha para ese negocio) y el catálogo vendible del tenant
// actual. Sin capability: es una página pública. El aislamiento lo da
// getCurrentTenantId (fail-closed) + el filtro por tenantId en cada query.
export async function getStorefront() {
  const tenantId = await getCurrentTenantId();
  const [tenant, settings, products] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } }),
    prisma.businessSettings.findUnique({
      where: { tenantId },
      select: {
        shortLabel: true,
        city: true,
        addressLine: true,
        hoursLabel: true,
        whatsapp: true,
        instagram: true,
        email: true,
        contactNote: true,
      },
    }),
    prisma.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        active: true,
        OR: [{ price: { not: null } }, { pricePerKg: { not: null } }],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, saleUnit: true, price: true, pricePerKg: true, unit: true },
    }),
  ]);
  // Wording GENÉRICO del rubro (blueprint retail) + copy PROPIO del tenant (voz firma),
  // ambos resueltos por slug. `copy` es null para tenants sin copy → cae al wording.
  const wording = retailWordingForSlug(tenant?.slug);
  const copy = getStorefrontCopy(tenant?.slug);
  return {
    name: tenant?.name ?? "Tienda",
    slug: tenant?.slug ?? null,
    branding: settings ?? null,
    wording,
    copy,
    products,
  };
}
