"use server";

// Capability POS / Orden (ADR-003 "Orden/Venta", Fase 2 POS).
// Capability del CORE — sirve a cualquier vertical retail; la carnicería `magra`
// la usa para vender cortes por kg (venta por peso) y tomar pedidos de vidriera.
// Aislamiento multi-tenant: cada write escribe `tenantId` (getCurrentTenantId,
// fail-closed ADR-015) y cada read filtra por él, igual que el resto del Core.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditAdmin, auditPublic, requestIp } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { alcanceDeAnulacion } from "@/lib/capabilities";
import { retailWordingForSlug } from "@/blueprints/retail";
import { getStorefrontCopy } from "@/tenants/storefront";
import {
  insertOrder,
  cobrarPedidoEnTx,
  anularVentaConSuCuentaEnTx,
  pedidoConClave,
  tomarPedidoOnlineGuarded,
  AnulacionDeCuentaRechazada,
  CobroDePedidoAnulado,
  type CobroDePedido,
  type OrderPaymentMethod,
} from "@/lib/order-core";
import { medioDeCobroRequerido, mensajeYaCobrado } from "@/lib/caja/medio-cobro";
import { requireAppAccion, AppNoDisponibleError } from "@/lib/require-app";
import { cuentasCorrientesEnabled } from "@/lib/settlement/asiento-libro";
import { facturarOrden } from "@/lib/invoice-from-order";
import { getFiscalProfile, isInvoicingEnabled, PerfilFiscalIncompletoError } from "@/lib/fiscal";
import { buildWhatsAppHref, sanitizePhone } from "@/lib/whatsapp-cta";
import { logger } from "@/lib/logger";
import { normalizarCodigoDeCupon, topeDePrecioAMano, CUPON_NO_VALE } from "@/lib/venta-reglas";
import { frenoDeCupones, rechazoPublicoDelCupon, CUPON_FRENADO } from "@/lib/cupones/prueba-publica";
import {
  disponibilidadDe,
  mensajeWhatsAppDelPedido,
  problemasDeLaBolsa,
  MENSAJE_BOLSA_CON_PROBLEMAS,
  MENSAJE_NO_SE_PUDO,
  type EstadoPedidoOnline,
} from "@/app/tienda/reglas-tienda";
import {
  estadoDeFactura,
  faltanteFiscalEnPalabras,
  puedeFacturarVenta,
  SIN_FACTURA,
  type FacturaDeVenta,
  type PerfilParaFacturar,
} from "@/app/admin/(dashboard)/ventas/factura";
import { permiteVenderSinStock, productosQuePuedenQuedarNegativos } from "@/lib/stock/pos-stock-rules";
import { tenantTransaction } from "@/lib/rls";
import { isUniqueViolation } from "@/lib/prisma-errors";
import { cantidadOCero, formatearCantidad } from "@/lib/pos-peso";
import { fmtMoneyARS } from "@/components/ui/format";
import { lastClosedDay } from "@/lib/caja/frontera-cierre";
import { isFrozenDay } from "@/lib/caja/cierre-diario";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { getTenantIdentity } from "@/lib/identidad-rubro";
import { round2 } from "@/lib/round";
import { buscarFichaPorTelefono } from "@/lib/clientes/ficha-por-telefono";
import {
  AnulacionVentaRechazada,
  reglasDeAnulacion,
  fronteraDeVenta,
  ajustarPedidoInTx,
  type AjustarPedidoResult,
  wherePedidosAbiertos,
  wherePedidosCerrados,
  entregarPedidoGuarded,
  siguienteEstado,
  horarioDelFormulario,
} from "@/lib/order-anulacion";
import {
  descuentoDelFormulario,
  lineasAManoDelFormulario,
  topeDeDescuento,
  ventaDeOrden,
  type VentaTicket,
} from "@/app/admin/(dashboard)/vender/reglas-venta";

const ORDERS_PATH = "/admin/pedidos";
// Las otras dos pantallas del mostrador que muestran ventas: se revalidan junto con la bandeja
// para que una venta cobrada o anulada aparezca en las tres sin esperar.
const VENDER_PATH = "/admin/vender";
const VENTAS_PATH = "/admin/ventas";

function revalidarMostrador() {
  revalidatePath(ORDERS_PATH);
  revalidatePath(VENDER_PATH);
  revalidatePath(VENTAS_PATH);
}

// --- Loader de la pantalla POS / bandeja de pedidos ---

// Cuántos cerrados muestra la bandeja: es historial, no trabajo pendiente.
const CERRADOS_EN_BANDEJA = 20;

export async function getPosData() {
  await requireCapability("orders:read");
  // Endurecimiento defensivo (cinturón-y-tiradores sobre RLS): filtro `tenantId` EXPLÍCITO en
  // cada read del backoffice. RLS ya aísla en prod, pero el predicado explícito no depende de que
  // el flag esté ON y además ENCIENDE los índices `@@index([tenantId, ...])` que ya existen.
  const tenantId = await getCurrentTenantId();
  // Abiertos y cerrados en DOS consultas. Antes era una sola con `take: 100` y la separación
  // se hacía después: con 100 tickets de mostrador en el día, el pedido online de ayer quedaba
  // fuera del corte y desaparecía de la bandeja. Los abiertos van SIN tope porque son trabajo
  // pendiente; los `where` salen de order-anulacion.ts (ver ahí el porqué de cada uno).
  const [abiertos, cerrados, products] = await Promise.all([
    prisma.order.findMany({
      where: wherePedidosAbiertos(tenantId),
      orderBy: { createdAt: "desc" },
      include: { items: true },
    }),
    prisma.order.findMany({
      where: wherePedidosCerrados(tenantId),
      orderBy: { createdAt: "desc" },
      take: CERRADOS_EN_BANDEJA,
      select: { id: true, code: true, status: true, customerName: true, total: true, createdAt: true, paid: true, paymentMethod: true },
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
  return { abiertos, cerrados, products };
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
//
// `venta`: la venta recién cobrada, para el ticket (WhatsApp o 58 mm). Sólo la pide /admin/vender
// (`conTicket`); el POS de la bandeja no la usa y no paga la lectura extra.
export type OrderActionState =
  | { ok: true; mensaje?: string; venta?: VentaTicket }
  | { ok: false; error: string }
  | null;

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
  // «A CUENTA» (Vender): la venta queda en la cuenta corriente del cliente. No es un medio de
  // cobro —no entra plata—, así que no pasa por `medioDeCobroRequerido` ni por la frontera del
  // día cerrado: no escribe el libro. Va detrás del flag de cuentas corrientes (las deudas
  // tienen que poder cobrarse con asiento) y de la app Cuentas a cobrar (módulo y rol): una app
  // escondida no es una app protegida.
  const aCuenta = String(formData.get("aCuenta") || "") === "1";
  if (aCuenta) {
    if (!cuentasCorrientesEnabled()) {
      return {
        ok: false,
        error: "Las cuentas corrientes todavía no están encendidas en este negocio: cobrá la venta con un medio o dejala sin cobrar.",
      };
    }
    try {
      await requireAppAccion("cuentas-a-cobrar");
    } catch (e) {
      if (e instanceof AppNoDisponibleError) return { ok: false, error: e.message };
      throw e;
    }
    if (channel !== "COUNTER") {
      return { ok: false, error: "«A cuenta» es para la venta de mostrador. Un pedido se deja sin cobrar y se cobra al entregarlo." };
    }
  }
  const paid = !aCuenta && (String(formData.get("paid")) === "on" || String(formData.get("paid")) === "true");
  // Cupón: el código tal cual lo escribió el cajero. Se valida y se consume en la transacción del
  // alta (order-core.ts). No se suma a un descuento a mano: es uno o el otro.
  const cupon = normalizarCodigoDeCupon(formData.get("cupon")) || null;

  // CON QUÉ SE COBRÓ (MAG-1). Una venta cobrada sin medio ya no se graba como "no cobrada" en
  // silencio ni cae en EFECTIVO por default: se rechaza y la pantalla dice que falta elegirlo.
  // La decisión entera vive en `medioDeCobroRequerido` (caja/medio-cobro.ts, probada con
  // datos); acá sólo se usa el medio que ella devuelve. No va en `insertOrder`: la vidriera y
  // la ingesta externa no la heredan.
  const medio = medioDeCobroRequerido({ channel, paid, paymentMethod: formData.get("paymentMethod") });
  if (!medio.ok) return { ok: false, error: medio.error };
  const paymentMethod: PaymentMethod | null = medio.paymentMethod;

  // DESCUENTO Y PRECIO A MANO (/admin/vender). Se leen acá y se deciden con las mismas reglas
  // que usa la pantalla (vender/reglas-venta.ts): lo que la pantalla deja pasar, el servidor
  // lo acepta, y lo que no, se rechaza con el mismo texto. El tope del descuento sale del ROL
  // de la sesión, nunca del formulario; y el monto se calcula en `insertOrder` sobre los
  // precios de la base. El POS de la bandeja no manda ninguno de los dos campos: para él esto
  // no cambia nada.
  const descuentoPedido = descuentoDelFormulario(formData.get("descuentoTipo"), formData.get("descuentoValor"));
  if (!descuentoPedido.ok) return { ok: false, error: descuentoPedido.error };
  const aMano = lineasAManoDelFormulario((campo) => formData.getAll(campo).map(String));
  if (!aMano.ok) return { ok: false, error: aMano.error };

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
        // El horario de retiro o envío se lee en la ZONA DEL NEGOCIO (`horarioDelFormulario`):
        // antes era `new Date(raw)` y en el servidor (UTC) "sábado 10:00" quedaba a las 7.
        scheduledFor: horarioDelFormulario(scheduledRaw),
        paid,
        paymentMethod,
        items,
        lineasAMano: aMano.lineas,
      },
      {
        imputarCajaActor: `user:${user.id}`,
        idempotencyKey,
        permitirNegativoPorProducto,
        descuento: descuentoPedido.pedido
          ? { pedido: descuentoPedido.pedido, topePct: topeDeDescuento(user.role) }
          : null,
        cupon,
        aCuenta: aCuenta ? { createdBy: `user:${user.id}` } : null,
        // El tope del precio a mano sale del ROL de la sesión, igual que el del descuento.
        topePrecioAMano: topeDePrecioAMano(user.role),
      },
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
    revalidarMostrador();
    const mensaje = "Esa venta ya estaba registrada (no se cobró dos veces).";
    // El reintento después de perder la respuesta también da el ticket (Vender lo pide con
    // `conTicket`): es la venta que QUEDÓ grabada en el primer envío, leída de la base.
    if (String(formData.get("conTicket") || "") !== "1") return { ok: true, mensaje };
    return { ok: true, mensaje, venta: (await ventaParaTicket(tenantId, result.id)) ?? undefined };
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
  //
  // La venta A CUENTA de mostrador también terminó: la mercadería se fue y la deuda ya está en
  // la cuenta corriente del cliente, no en la bandeja.
  const { isRetail } = await getTenantIdentity();
  const naceEntregada =
    isRetail && channel === "COUNTER" && fulfillment === "PICKUP" && ((paid && paymentMethod != null) || aCuenta);
  if (naceEntregada) {
    await prisma.order.updateMany({
      where: { id: result.id, tenantId, status: "CONFIRMED" },
      data: { status: "DELIVERED" },
    });
  }

  // Lo nuevo (descuento, precio a mano, ficha) va en el rastro sólo cuando existe: la venta de
  // siempre deja la misma fila de siempre. El descuento lleva QUIÉN lo aplicó y el precio a
  // mano su MOTIVO: es lo que la dueña mira después en Ventas del día.
  const descuento = result.descuento ?? 0;
  await auditAdmin({
    action: "create",
    entity: "Order",
    entityId: result.id,
    changes: {
      code: result.code,
      channel,
      fulfillment,
      total: result.total ?? result.subtotal,
      lines: result.lines,
      ...(naceEntregada ? { status: "DELIVERED" } : {}),
      ...(descuento > 0 && descuentoPedido.pedido
        ? {
            subtotal: result.subtotal,
            descuento: {
              tipo: descuentoPedido.pedido.tipo,
              valor: descuentoPedido.pedido.valor,
              monto: descuento,
              por: user.name,
              rol: user.role,
            },
          }
        : {}),
      ...(aMano.lineas.length > 0 ? { preciosAMano: aMano.lineas, por: user.name } : {}),
      ...(result.clientId ? { clientId: result.clientId } : {}),
      // El cupón queda con su monto y quién lo cargó: es lo que suma Promociones.
      ...(result.cupon ? { cupon: { codigo: result.cupon, monto: descuento, por: user.name } } : {}),
      ...(aCuenta ? { aCuenta: true, por: user.name } : {}),
    },
  });

  revalidarMostrador();
  const mensaje = aCuenta ? `Venta #${result.code} a cuenta: queda en la cuenta corriente del cliente.` : undefined;
  if (String(formData.get("conTicket") || "") !== "1") return { ok: true, ...(mensaje ? { mensaje } : {}) };
  return {
    ok: true,
    ...(mensaje ? { mensaje } : {}),
    venta: (await ventaParaTicket(tenantId, result.id)) ?? undefined,
  };
}

/**
 * La venta como la muestra el ticket, leída de la base (lo que QUEDÓ grabado, no lo que mandó
 * la pantalla). No es una action: no se exporta, así que no es un endpoint.
 */
async function ventaParaTicket(tenantId: string, id: string): Promise<VentaTicket | null> {
  const o = await prisma.order.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      code: true,
      createdAt: true,
      subtotal: true,
      discount: true,
      total: true,
      paymentMethod: true,
      paid: true,
      customerName: true,
      customerPhone: true,
      status: true,
      items: {
        select: { productId: true, name: true, saleUnit: true, quantity: true, unitPrice: true, lineTotal: true },
        orderBy: { id: "asc" },
      },
    },
  });
  return o ? ventaDeOrden(o) : null;
}

// --- Tomar pedido desde la vidriera pública (sin auth) ---
//
// La misma capability POS del Core, pero disparada por un cliente final en la
// vidriera: siempre ONLINE, siempre PENDING y SIN cobrar (el mostrador confirma y
// cobra al preparar). Escribe con el tenant actual (fail-closed ADR-015) y audita
// como acción pública. Al terminar redirige a la página de gracias con el nº.
//
// EL RECHAZO VUELVE CON SU MOTIVO Y LA BOLSA NO SE PIERDE. Antes tiraba: pedir más stock del
// que había terminaba en la pantalla genérica de error (Next redacta el mensaje de lo lanzado)
// y el cliente perdía la bolsa entera. Ahora devuelve el estado (`EstadoPedidoOnline`): el
// motivo general y, si es de un producto, el aviso de ESA línea, sin decir cuánto stock hay.
//
// Además, lo que antes la vidriera mostraba y no registraba:
//   · el ENVÍO lo calcula el servidor con la tarifa de la marca y entra como línea del pedido;
//   · el CUPÓN se valida y se consume en la transacción del alta;
//   · «Pedir por WhatsApp» (`via=whatsapp`) REGISTRA el pedido y recién después devuelve el
//     link del chat, con el número de pedido: el local lo encuentra en la bandeja.
export async function placeOnlineOrder(
  _prev: EstadoPedidoOnline,
  formData: FormData,
): Promise<EstadoPedidoOnline> {
  const tenantId = await getCurrentTenantId();

  const fulfillment =
    String(formData.get("fulfillment") || "PICKUP") === "DELIVERY" ? "DELIVERY" : "PICKUP";
  const customerName = String(formData.get("customerName") || "").trim().slice(0, 120);
  const customerPhone = String(formData.get("customerPhone") || "").trim().slice(0, 40);
  if (!customerName || !customerPhone) {
    return { ok: false, error: "Necesitamos tu nombre y un teléfono de contacto para tomar el pedido.", campo: "datos" };
  }
  const address = String(formData.get("address") || "").trim().slice(0, 300) || null;
  if (fulfillment === "DELIVERY" && !address) {
    return { ok: false, error: "Para el envío a domicilio necesitamos la dirección.", campo: "datos" };
  }
  const porWhatsApp = String(formData.get("via") || "") === "whatsapp";

  // A-1: clave de idempotencia del carrito (la genera el cliente por pedido). Con el doble
  // submit del mobile —el camino infeliz #1— los dos envíos traen la MISMA clave → `insertOrder`
  // devuelve el mismo pedido en vez de crear otro y volver a descontar stock.
  const idempotencyKey = String(formData.get("idempotencyKey") || "").trim() || null;

  const items = parseItems(formData).filter((l) => l.productId && l.qty > 0);
  if (items.length === 0) {
    return { ok: false, error: "Tu pedido está vacío: sumá algún producto con el botón +." };
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, name: true } });
  // La tarifa de envío es de la MARCA (storefront.ts): la misma que la vidriera usa para mostrar.
  const envio = getStorefrontCopy(tenant?.slug)?.shipping ?? null;
  const cupon = normalizarCodigoDeCupon(formData.get("cupon")) || null;
  // El alta también es una puerta para probar códigos: pasa por el mismo freno que «Aplicar»
  // (cupones/prueba-publica.ts). Frenado, ni se intenta el alta.
  const ip = cupon ? await requestIp() : undefined;
  if (cupon && frenoDeCupones.frenado(tenantId, ip)) return { ok: false, error: CUPON_FRENADO, campo: "cupon" };

  // El orden de las guardas (clave anti-duplicado, bolsa, alta) vive en
  // `tomarPedidoOnlineGuarded`, con su porqué y su test.
  const toma = await tomarPedidoOnlineGuarded({
    idempotencyKey,
    buscarPorClave: (key) => pedidoConClave(tenantId, key),
    revisarBolsa: () => problemasDeLaBolsaEnBase(tenantId, items),
    insertar: () =>
      insertOrder(tenantId, {
        channel: "ONLINE",
        fulfillment,
        customerName,
        customerPhone,
        address,
        notes: String(formData.get("notes") || "").trim().slice(0, 500) || null,
        scheduledFor: null,
        paid: false,
        paymentMethod: null,
        items,
      }, { idempotencyKey, envio, cupon }),
  });
  if (toma.tipo === "cupon") {
    // Hacia afuera, el texto único ("venció el…" diría que el código existe) y suma al freno.
    return { ok: false, error: rechazoPublicoDelCupon(toma, frenoDeCupones, tenantId, ip, CUPON_NO_VALE), campo: "cupon" };
  }
  if (toma.tipo === "bolsa") return { ok: false, error: MENSAJE_BOLSA_CON_PROBLEMAS, porLinea: toma.porLinea };
  if (toma.tipo === "rechazo") return { ok: false, error: toma.error };
  if (toma.tipo === "error") {
    logger.error("tienda", "no se pudo tomar el pedido online", toma.err, { tenantId });
    return { ok: false, error: MENSAJE_NO_SE_PUDO };
  }
  const result = toma.pedido;

  // Solo se audita el ALTA real: si `dedup` es true, el pedido ya existía (reintento) y ya se
  // auditó en el primer envío → no se duplica el rastro.
  if (!result.dedup) {
    await auditPublic({
      action: "create",
      entity: "Order",
      entityId: result.id,
      clientPhone: customerPhone,
      changes: {
        code: result.code,
        channel: "ONLINE",
        fulfillment,
        total: result.total ?? result.subtotal,
        ...(result.envio ? { envio: result.envio } : {}),
        ...(result.cupon ? { cupon: { codigo: result.cupon, monto: result.descuento ?? 0 } } : {}),
        ...(porWhatsApp ? { via: "whatsapp" } : {}),
      },
    });
    // El backoffice ve el pedido nuevo en su bandeja al revalidar.
    revalidarMostrador();
  }
  if (!porWhatsApp) redirect(`/tienda/gracias?pedido=${result.code}`);
  // El pedido YA está registrado: si armar el link del chat falla, no se dice "no pudimos tomar
  // el pedido" (sería mentira y el cliente lo repetiría): se contesta sin chat.
  const whatsapp = await chatDelPedido(tenantId, result.id, tenant?.name ?? "el local").catch((err) => {
    logger.warn("tienda", "pedido registrado sin link de WhatsApp", {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  });
  return { ok: true, code: result.code, total: result.total ?? result.subtotal, whatsapp };
}

/** La bolsa contra la base: qué línea no se puede pedir y por qué (`problemasDeLaBolsa`). */
async function problemasDeLaBolsaEnBase(
  tenantId: string,
  items: readonly { productId: string; qty: number }[],
): Promise<Record<string, string>> {
  const productos = await prisma.product.findMany({
    where: { tenantId, id: { in: items.map((l) => l.productId) } },
    select: { id: true, trackStock: true, stock: true, active: true, deletedAt: true, saleUnit: true, price: true, pricePerKg: true },
  });
  return problemasDeLaBolsa(productos, items);
}

/**
 * El link de WhatsApp del pedido recién registrado, con su número y lo que quedó GRABADO. Al
 * número del local (Datos del negocio): si el local no lo cargó, no hay chat que abrir y la
 * vidriera dice que el pedido quedó registrado igual.
 */
async function chatDelPedido(tenantId: string, orderId: string, negocio: string): Promise<string | null> {
  const [o, bs] = await Promise.all([
    prisma.order.findFirst({
      where: { id: orderId, tenantId },
      select: {
        code: true,
        total: true,
        discount: true,
        fulfillment: true,
        address: true,
        customerName: true,
        items: { select: { productId: true, name: true, saleUnit: true, quantity: true, lineTotal: true }, orderBy: { id: "asc" } },
      },
    }),
    prisma.businessSettings.findUnique({ where: { tenantId }, select: { whatsapp: true } }).catch(() => null),
  ]);
  const numero = sanitizePhone(bs?.whatsapp);
  if (!o || !numero) return null;
  return buildWhatsAppHref(
    numero,
    mensajeWhatsAppDelPedido({
      negocio,
      code: o.code,
      cliente: o.customerName,
      lineas: o.items,
      descuento: o.discount,
      total: o.total,
      fulfillment: o.fulfillment,
      address: o.address,
    }),
  );
}

// --- Avanzar estado del pedido ---
//
// Mueve Pendiente → Confirmado → En preparación → Listo. El último paso, ENTREGAR, no pasa por
// acá: tiene su propia acción (`entregarPedido`) porque exige el cobro o un "queda a cobrar"
// dicho a mano. Antes este mismo botón entregaba sin preguntar, el pedido caía a "Cerrados"
// sin botones y esa plata no llegaba nunca a la caja.
//
// El `tenantId` va explícito en la lectura y en la escritura (antes era `findUnique` por id y
// dependía sólo de RLS), y la escritura es un compare-and-set sobre el estado leído: si otra
// pestaña ya lo movió, este toque no lo empuja un paso de más.
//
// El paso siguiente lo decide `siguienteEstado` (order-anulacion.ts): en comercio, Nuevo pasa
// directo a Preparando; en servicios (CH) sigue pasando por Confirmado.

// Otra pestaña (u otra persona) ya movió el pedido: la bandeja se redibuja con el estado real
// y la fila lo dice (AvanzarPedidoForm lo lee con `rechazoDeAccion`).
const YA_CAMBIO_DE_ESTADO = "El pedido ya había cambiado de estado en otra pantalla: la bandeja se actualizó.";

export async function advanceOrderStatus(formData: FormData): Promise<OrderActionState> {
  await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, error: "No se encontró el pedido. Recargá la bandeja." };
  const current = await prisma.order.findFirst({ where: { id, tenantId }, select: { status: true } });
  if (!current) {
    revalidarMostrador();
    return { ok: false, error: YA_CAMBIO_DE_ESTADO };
  }
  const { isRetail } = await getTenantIdentity();
  // null = terminal (entregado, anulado) o Listo, que se entrega con `entregarPedido` (pide el cobro).
  const next = siguienteEstado(current.status, { comercio: isRetail });
  if (!next) {
    revalidarMostrador();
    return { ok: false, error: YA_CAMBIO_DE_ESTADO };
  }
  const res = await prisma.order.updateMany({
    where: { id, tenantId, status: current.status },
    data: { status: next },
  });
  if (res.count === 0) {
    revalidarMostrador();
    return { ok: false, error: YA_CAMBIO_DE_ESTADO };
  }
  await auditAdmin({
    action: "update",
    entity: "Order",
    entityId: id,
    changes: { status: { from: current.status, to: next } },
  });
  revalidarMostrador();
  return { ok: true };
}

// --- Marcar cobrado ---

// Cobrar un pedido que otra pestaña ya anuló metía en la caja la plata de una venta que el
// sistema da por inexistente: la bandeja vieja todavía mostraba el botón. `CobroDePedidoAnulado`
// (order-core.ts) se lanza ADENTRO de la transacción para que el `paid` que ya se escribió
// vuelva atrás con todo lo demás.

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
  // el libro (`cobrarPedidoEnTx`, abajo) y tampoco la miraba: cobrar un pedido
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
  // SÓLO SE COBRA LO QUE NO ESTABA COBRADO (`cobrarPedidoEnTx`, order-core.ts, con el porqué):
  // el segundo «Cobrar» desde otra pestaña, con otro medio elegido, no toca nada y se le dice
  // con qué medio había quedado. El cuerpo de la transacción vive en order-core.ts porque el
  // aviso de pago de Mercado Pago cobra EXACTAMENTE igual, sin sesión.
  let cobro: CobroDePedido;
  try {
    cobro = await tenantTransaction(
      (tx) => cobrarPedidoEnTx(tx, tenantId, { orderId: id, method, actor: `user:${user.id}` }),
      { tenantId },
    );
  } catch (e) {
    if (e instanceof CobroDePedidoAnulado) {
      revalidarMostrador();
      return { ok: false, error: e.message };
    }
    // Defensa que queda de A-5. Con `paid: false` en el filtro, el segundo cobro concurrente
    // espera el lock de la fila y sale por "ya-cobrado" sin llegar a asentar, así que este
    // choque del @@unique del asiento VENTA no debería darse. Si igual se diera, la tx aborta
    // entera —el `paid` también— y no hay nada que reparar: ni re-auditoría ni un 500.
    if (isUniqueViolation(e, "orderId")) {
      revalidarMostrador();
      return { ok: true, mensaje: "Ese pedido ya estaba cobrado." };
    }
    return errorDeAccion(e, "No se pudo marcar el pedido como cobrado.");
  }

  if (cobro.tipo === "no-existe") return { ok: false, error: "No se encontró el pedido a cobrar." };
  if (cobro.tipo === "ya-cobrado") {
    revalidarMostrador();
    return mensajeYaCobrado({ code: cobro.code, medioRegistrado: cobro.medioRegistrado, medioElegido: method });
  }

  const { order } = cobro;
  await auditAdmin({ action: "update", entity: "Order", entityId: order.id, changes: { paid: true, method } });

  revalidarMostrador();
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

// --- Entregar ---
//
// Entregar un pedido listo exige una de dos cosas dichas en la pantalla: con qué pagó (se
// cobra y se entrega en el mismo toque) o «Queda a cobrar» tildado a mano (se entrega y sigue
// en la bandeja como "Entregado · a cobrar"). Ya cobrado, se entrega directo. La secuencia y
// su porqué viven en `entregarPedidoGuarded` (order-anulacion.ts, probada con el doble toque);
// acá sólo se le dan las tres operaciones reales, las tres filtradas por `tenantId`.
export async function entregarPedido(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, error: "Falta identificar el pedido a entregar." };
  const quedaACobrar = String(formData.get("quedaACobrar") || "") === "on";

  const r = await entregarPedidoGuarded({
    medio: String(formData.get("paymentMethod") || ""),
    quedaACobrar,
    leer: () =>
      prisma.order.findFirst({ where: { id, tenantId }, select: { code: true, status: true, paid: true } }),
    // El MISMO cobro que el botón «Cobrar»: medio obligatorio, frontera del día cerrado,
    // "sólo lo que no estaba cobrado" y el asiento en la caja en la misma transacción.
    cobrar: async (medio) =>
      (await setOrderPaidCore(id, medio)) ?? { ok: false, error: "No se pudo cobrar el pedido." },
    marcarEntregado: async () =>
      (
        await prisma.order.updateMany({
          where: { id, tenantId, status: "READY" },
          data: { status: "DELIVERED" },
        })
      ).count === 1,
  });

  revalidarMostrador();
  if (!r.ok) return r;
  if (r.entregado) {
    await auditAdmin({
      action: "update",
      entity: "Order",
      entityId: id,
      changes: { status: { from: "READY", to: "DELIVERED" }, ...(r.quedaACobrar ? { quedaACobrar: true } : {}) },
    });
  }
  return { ok: true, mensaje: r.mensaje };
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
//
// QUIÉN ANULA QUÉ. Pide `orders:void`, no `orders:manage`: anular mueve plata hacia atrás. El
// dueño anula cualquier día que no esté cerrado; recepción, sólo lo cobrado hoy y siempre con
// motivo (`alcanceDeAnulacion`, capabilities.ts). El motivo y el límite de día se deciden en
// `reglasDeAnulacion` y en `anularVentaInTx`, puros y probados; acá sólo se les pasa quién es
// y qué día es hoy en la zona del negocio.
async function anularVentaCore(
  orderId: string,
  motivoRaw: string,
  devuelveStock: boolean,
): Promise<OrderActionState> {
  const user = await requireCapability("orders:void");
  const tenantId = await getCurrentTenantId();
  if (!orderId) return { ok: false, error: "Falta identificar el pedido a anular." };

  const reglas = reglasDeAnulacion({
    alcance: alcanceDeAnulacion(user.role),
    motivo: motivoRaw,
    hoy: dateStrInBusinessTz(new Date()),
  });
  if (!reglas.ok) return { ok: false, error: reglas.error };
  const motivo = reglas.motivo;

  // La frontera se lee ANTES de abrir la transacción (no depende de nada que la tx cambie),
  // igual que en el libro y en el cierre diario.
  const cerradoHasta = await lastClosedDay(tenantId);

  // Con cuentas corrientes encendidas, una venta A CUENTA tiene su deuda: se anula en la MISMA
  // transacción (`anularCuentaDeLaVentaEnTx`). Apagadas no se mira: no hay deudas nacidas de una
  // venta y la tabla puede no estar en la base.
  const conCuentas = cuentasCorrientesEnabled();

  let resultado;
  let cuenta = { anulada: false, monto: 0 };
  try {
    const r = await tenantTransaction(
      (tx) =>
        anularVentaConSuCuentaEnTx(
          tx,
          tenantId,
          {
            orderId,
            motivo,
            actor: `user:${user.id}`,
            devuelveStock,
            diaCerradoHasta: cerradoHasta,
            esDiaCerrado: isFrozenDay,
            diaDe: dateStrInBusinessTz,
            soloDelDia: reglas.soloDelDia,
          },
          { conCuentas },
        ),
      { tenantId },
    );
    resultado = r.venta;
    cuenta = r.cuenta;
  } catch (err) {
    if (err instanceof AnulacionVentaRechazada) return { ok: false, error: err.message };
    if (err instanceof AnulacionDeCuentaRechazada) return { ok: false, error: err.message };
    // Carrera real: dos anulaciones simultáneas: la 2ª choca el @@unique(tenantId, orderId,
    // type) al asentar el EGRESO. Ya está anulada, no hay nada que reparar.
    if (isUniqueViolation(err, "orderId")) {
      revalidarMostrador();
      return { ok: true, mensaje: "Esa venta ya estaba anulada." };
    }
    return errorDeAccion(err, "No se pudo anular la venta.");
  }

  if (!resultado.applied) {
    revalidarMostrador();
    return { ok: true, mensaje: "Esa venta ya estaba anulada." };
  }

  // Quién anuló queda en el `actor` del registro (auditAdmin lo toma de la sesión); el rol y el
  // NOMBRE van en los cambios para que la dueña lo vea sin cruzar tablas: el número de Ventas
  // del día en el Inicio ("2 anulaciones hoy, por Juan") sale de esta fila con UNA consulta
  // (`whereAnulacionesDelDia`, order-anulacion.ts), y el control por visibilidad es ése.
  await auditAdmin({
    action: "update",
    entity: "Order",
    entityId: orderId,
    changes: {
      status: "CANCELLED",
      code: resultado.code,
      motivo,
      rol: user.role,
      por: user.name,
      montoRevertido: resultado.montoRevertido,
      reversaId: resultado.reversaId,
      stockDevuelto: resultado.stockDevuelto,
      ...(cuenta.anulada ? { cuentaCorrienteAnulada: cuenta.monto } : {}),
      ...(resultado.cuponDevuelto ? { cuponDevuelto: resultado.cuponDevuelto } : {}),
    },
  });
  revalidarMostrador();

  // El mensaje DICE lo que se movió. Una anulación que sólo contesta "listo" obliga a ir a
  // mirar el libro y el stock para saber si hizo algo.
  const partes: string[] = [`Venta #${resultado.code} anulada.`];
  if (resultado.montoRevertido > 0) {
    partes.push(`Se devolvieron ${fmtMoneyARS(resultado.montoRevertido)} en el libro de caja.`);
  }
  if (cuenta.anulada) {
    partes.push(`Se sacaron ${fmtMoneyARS(cuenta.monto)} de la cuenta corriente del cliente.`);
  }
  if (resultado.stockDevuelto.length > 0) {
    partes.push(
      `Volvió al stock: ${resultado.stockDevuelto.map((d) => `${formatearCantidad(d.qty)} de ${d.name}`).join(", ")}.`,
    );
  }
  if (resultado.cuponDevuelto) {
    partes.push(`El cupón ${resultado.cuponDevuelto} recuperó el uso que había gastado esta venta.`);
  }
  return { ok: true, mensaje: partes.join(" ") };
}

/**
 * Anular desde la bandeja (`AnularPedidoForm`): el motivo del rechazo —sin motivo, venta de
 * otro día, día cerrado— llega entero a la pantalla. Firma `(prev, formData)` de
 * `useActionState`, aunque hoy se invoca directo (el porqué, en CobrarPedidoForm).
 */
export async function anularVenta(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  // "La mercadería no volvió" es una CASILLA, no el default: en el caso diario —se pesó mal y
  // se rehace la venta— la carne nunca salió del mostrador y tiene que volver al stock.
  const devuelveStock = String(formData.get("stockNoVolvio") || "") !== "on";
  return anularVentaCore(
    String(formData.get("id") || "").trim(),
    String(formData.get("motivo") || ""),
    devuelveStock,
  );
}

// --- Editar las líneas de un pedido todavía no cobrado (el peso real) ---
//
// La regla y el porqué están en `order-anulacion.ts` (`planEdicionDeLineas`, y el descuento en
// `totalesDelAjuste`). La transacción entera vive en `ajustarPedidoInTx`: acá se autoriza, se
// decide la excepción de stock negativo y se audita.
export async function updateOrderItems(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, error: "Falta identificar el pedido a editar." };

  const wanted = parseItems(formData).filter((l) => l.productId && l.qty > 0);

  let out: AjustarPedidoResult;
  try {
    out = await tenantTransaction(
      (tx) =>
        ajustarPedidoInTx(tx, tenantId, {
          orderId: id,
          pedidas: wanted,
          actor: `user:${user.id}`,
          // MAG-4: el aumento de un corte por PESO sale aunque el stock quede en negativo (el
          // paquete ya está pesado en la mano). La regla es la de pos-stock-rules.ts.
          permiteNegativo: (saleUnit) => permiteVenderSinStock({ saleUnit, contexto: "EDICION_PESO_REAL" }),
        }),
      { tenantId },
    );
  } catch (err) {
    return errorDeAccion(err, "No se pudo actualizar el pedido.");
  }

  await auditAdmin({
    action: "update",
    entity: "Order",
    entityId: id,
    changes: {
      total: { from: out.antes, to: out.total },
      // El descuento acompaña al peso con el mismo %: queda escrito cuánto era y cuánto quedó.
      ...(out.descuentoAntes !== out.descuento
        ? { discount: { from: out.descuentoAntes, to: out.descuento } }
        : {}),
      lines: wanted.length,
    },
  });
  revalidarMostrador();
  const dif = round2(out.total - out.antes);
  return {
    ok: true,
    mensaje:
      dif === 0
        ? `Pedido #${out.code} actualizado. El total no cambió: ${fmtMoneyARS(out.total)}.`
        : `Pedido #${out.code} actualizado${out.conPeso ? " al peso real" : ""}: ${fmtMoneyARS(out.antes)} → ${fmtMoneyARS(out.total)} (${dif > 0 ? "+" : "−"}${fmtMoneyARS(Math.abs(dif))}).`,
  };
}

// --- Cliente por teléfono (Vender) ---
//
// El mostrador escribe el teléfono y la venta queda en la ficha del cliente: nombre completo
// sin tipearlo y la compra en su historial. Busca con la MISMA regla que el alta
// (`buscarFichaPorTelefono`: "11 4000-7919" y "+54 9 11 4000 7919" son el mismo número), así
// lo que la pantalla muestra es la ficha que el alta va a vincular. Devuelve sólo el nombre:
// la pantalla no necesita más, y un endpoint no devuelve de más.
export async function buscarClienteParaVenta(telefono: string): Promise<{ nombre: string } | null> {
  await requireCapability("orders:manage");
  const tenantId = await getCurrentTenantId();
  const tel = String(telefono ?? "").slice(0, 40);
  const ficha = await buscarFichaPorTelefono(prisma, tenantId, tel);
  if (!ficha) return null;
  const c = await prisma.client.findFirst({ where: { id: ficha.id, tenantId }, select: { name: true } });
  return c ? { nombre: c.name } : null;
}

// --- Constancia del WhatsApp ---
//
// El mensaje sale por el WhatsApp del que atiende (un link wa.me, 1 a 1, con el texto armado):
// el sistema no manda nada solo. Lo que sí hace es dejar CONSTANCIA de que se avisó, en la
// auditoría del pedido, para que "¿le avisaron?" tenga respuesta. Se llama al tocar el botón,
// sin esperar: si la constancia falla, el aviso igual sale.
export async function registrarAvisoWhatsApp(orderId: string, tipo: "pedido-listo" | "ticket"): Promise<void> {
  await requireCapability("orders:read");
  const tenantId = await getCurrentTenantId();
  const id = String(orderId ?? "").trim();
  if (!id) return;
  const o = await prisma.order.findFirst({ where: { id, tenantId }, select: { code: true } });
  if (!o) return;
  await auditAdmin({
    action: "whatsapp",
    entity: "Order",
    entityId: id,
    changes: { tipo: tipo === "ticket" ? "ticket" : "pedido-listo", code: o.code },
  });
}

// --- Facturar una venta (Vender y Ventas del día) ---
//
// Llama a `facturarOrden` SÓLO si la facturación electrónica está encendida y el perfil fiscal
// está completo (`puedeFacturarVenta`, ventas/factura.ts). Si no, no emite nada y devuelve
// «Sin factura» con el porqué: la fila lo muestra y ofrece reintentar. Emitir es derecho
// comercial (módulo arca): pide la app Facturación además de la capability, porque una app
// escondida no es una app protegida.

export type EstadoFacturaVenta =
  | null
  | { ok: true; factura: FacturaDeVenta }
  | { ok: false; error: string; factura: FacturaDeVenta };

const SELECT_FACTURA = {
  status: true,
  numero: true,
  puntoVenta: true,
  tipoComprobante: true,
  rechazoMotivo: true,
} as const;

export async function facturarVenta(_prev: EstadoFacturaVenta, formData: FormData): Promise<EstadoFacturaVenta> {
  await requireCapability("billing:manage");
  try {
    await requireAppAccion("facturacion");
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { ok: false, error: e.message, factura: SIN_FACTURA };
    throw e;
  }
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id") || "").trim();
  if (!id) return { ok: false, error: "Falta identificar la venta a facturar.", factura: SIN_FACTURA };

  const o = await prisma.order.findFirst({
    where: { id, tenantId },
    select: { id: true, code: true, paid: true, status: true, total: true },
  });
  if (!o) return { ok: false, error: "No se encontró la venta.", factura: SIN_FACTURA };

  // Con la facturación APAGADA no se toca la tabla de comprobantes: su migración se aplica junto
  // con el flag (fiscal.ts), y leerla antes rompería la pantalla en una base que no la tiene.
  const encendida = isInvoicingEnabled();
  let perfil: PerfilParaFacturar | null = null;
  if (encendida) {
    // Ya tiene comprobante: se dice cuál. Nunca se emite un segundo para la misma venta.
    const previa = await prisma.invoice.findFirst({
      where: { tenantId, orderId: o.id },
      orderBy: { createdAt: "desc" },
      select: SELECT_FACTURA,
    });
    if (previa) return { ok: true, factura: estadoDeFactura(previa) };
    // El perfil fiscal se lee sólo con la facturación encendida: apagada, no hace falta.
    try {
      const p = await getFiscalProfile(tenantId);
      perfil = { ok: true, condicionIva: p.condicionIva };
    } catch (e) {
      if (!(e instanceof PerfilFiscalIncompletoError)) throw e;
      perfil = { ok: false, falta: faltanteFiscalEnPalabras(e.campo) };
    }
  }
  const decision = puedeFacturarVenta({
    facturacionEncendida: encendida,
    perfil,
    venta: { paid: o.paid, anulada: o.status === "CANCELLED", total: o.total },
  });
  if (!decision.ok) {
    return { ok: false, error: decision.motivo, factura: { ...SIN_FACTURA, texto: `Sin factura: ${decision.motivo}` } };
  }

  let invoiceId: string | null = null;
  try {
    invoiceId = await facturarOrden(o.id, tenantId);
  } catch (e) {
    logger.error("ventas", "no se pudo facturar la venta", e, { tenantId, orderId: o.id });
  }
  if (!invoiceId) {
    const motivo = "No se pudo emitir la factura ahora. La venta queda sin factura: reintentá en unos minutos.";
    return { ok: false, error: motivo, factura: { ...SIN_FACTURA, texto: `Sin factura: ${motivo}` } };
  }
  const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId }, select: SELECT_FACTURA });
  const factura = estadoDeFactura(inv);
  await auditAdmin({
    action: "facturar",
    entity: "Order",
    entityId: o.id,
    changes: { code: o.code, invoiceId, estado: factura.estado },
  });
  revalidarMostrador();
  return { ok: true, factura };
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
      select: {
        id: true,
        name: true,
        saleUnit: true,
        price: true,
        pricePerKg: true,
        unit: true,
        stock: true,
        lowStockAt: true,
        trackStock: true,
      },
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
    // El stock NO sale de acá: esto es público (lo lee cualquiera que abra /tienda) y cuántos
    // kilos quedan le dice a cualquiera cuánto vende el local. Sale la etiqueta ya decidida:
    // "Sin stock" o "Últimas unidades" (`disponibilidadDe`, tienda/reglas-tienda.ts).
    products: products.map(({ stock, lowStockAt, trackStock, ...p }) => ({
      ...p,
      disponibilidad: disponibilidadDe({ stock, lowStockAt, trackStock }),
    })),
  };
}
