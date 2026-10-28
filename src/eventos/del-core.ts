// ============================================================================
// Los eventos que emite el Core en la tanda P2 — un ayudante por hecho
// ============================================================================
//
// Las funciones del Core (order-core, order-anulacion, invoice-core, la bandeja de order-actions,
// caja-actions, cierre-diario-actions, crear-ficha, precios-auditoria, catalog-actions) sólo
// agregan UNA línea que llama a estos ayudantes, dentro de su transacción (el stock, en del-stock.ts). Acá vive la traducción del dominio
// (COUNTER, MERCADOPAGO, PICKUP…) al idioma del catálogo (MOSTRADOR, MP, RETIRA…), para que esas
// funciones no cambien de forma ni de firma.
//
// Si la emisión falla (dato fuera del catálogo, base caída), el error sube y la transacción del
// hecho vuelve atrás entera: o hay venta Y evento, o no hay ninguno de los dos. Salvo en los
// hechos fiscales (factura.*), donde un dato fuera del catálogo no impide guardar lo que ARCA dijo.
// ============================================================================

import { round2 } from "@/lib/round";
import { esNotaDeCreditoRecibida, nombreDelTipo } from "@/lib/contador/recibidos-formato";
import { EventoInvalido, emitirEvento, tieneSql, type ResultadoEmision } from "./emitir";
import { enmascararTelefono } from "./esquema";

type Medio = "EFECTIVO" | "MP" | "TRANSFERENCIA" | "TARJETA";

/** Medio del Core → medio del catálogo. Un medio que el catálogo no conoce no emite (null). */
export function medioDelCatalogo(m: string | null | undefined): Medio | null {
  switch (m) {
    case "EFECTIVO":
      return "EFECTIVO";
    case "MERCADOPAGO":
    case "MP":
      return "MP";
    case "TRANSFERENCIA":
      return "TRANSFERENCIA";
    case "TARJETA":
    case "DEBITO":
    case "CREDITO":
      return "TARJETA";
    default:
      return null;
  }
}

/** El id del pago externo, si el cobro lo firmó un aviso (`mercadopago:<id>`). */
export function pagoExternoDelActor(actor: string | null | undefined): string | undefined {
  const m = /^mercadopago:(.+)$/.exec(actor ?? "");
  return m ? m[1] : undefined;
}

/** `ext:<ref>` es la clave de idempotencia de la API de pedidos externos (external-orders.ts). */
export function canalYReferencia(
  channel: "COUNTER" | "ONLINE",
  claveIdempotencia: string | null | undefined,
): { canal: "MOSTRADOR" | "ONLINE" | "API"; externalRef: string | null } {
  const ref = claveIdempotencia?.startsWith("ext:") ? claveIdempotencia.slice(4) : null;
  if (ref) return { canal: "API", externalRef: ref };
  return { canal: channel === "COUNTER" ? "MOSTRADOR" : "ONLINE", externalRef: null };
}

// ── pedido.creado@1 ───────────────────────────────────────────────────────────

export async function emitirPedidoCreado(
  tx: object,
  p: {
    tenantId: string;
    pedidoId: string;
    codigo: number;
    channel: "COUNTER" | "ONLINE";
    fulfillment: "PICKUP" | "DELIVERY";
    total: number;
    lineas: readonly { productId: string; name: string; quantity: number; unitPrice: number }[];
    aMano: readonly { nombre: string; importe: number }[];
    clienteId: string | null;
    claveIdempotencia: string | null | undefined;
    ocurridoEn?: Date | null;
  },
): Promise<ResultadoEmision> {
  const { canal, externalRef } = canalYReferencia(p.channel, p.claveIdempotencia);
  return emitirEvento(tx, {
    tenantId: p.tenantId,
    tipo: "pedido.creado",
    version: 1,
    clave: `pedido:${p.pedidoId}:creado`,
    ocurridoEn: p.ocurridoEn ?? undefined,
    datos: {
      pedidoId: p.pedidoId,
      codigo: p.codigo,
      canal,
      entrega: p.fulfillment === "DELIVERY" ? "DELIVERY" : "RETIRA",
      total: round2(p.total),
      items: [
        ...p.lineas.map((l) => ({
          productoId: l.productId,
          sku: null,
          nombre: l.name,
          cantidad: l.quantity,
          precioUnitario: round2(l.unitPrice),
        })),
        ...p.aMano.map((l) => ({ productoId: null, sku: null, nombre: l.nombre, cantidad: 1, precioUnitario: round2(l.importe) })),
      ],
      clienteId: p.clienteId,
      externalRef,
    },
  });
}

// ── pedido.cobrado@1 ──────────────────────────────────────────────────────────

/** null = el medio no está en el catálogo (o la venta es a cuenta): no hay cobro que contar. */
export async function emitirPedidoCobrado(
  tx: object,
  p: { tenantId: string; pedidoId: string; codigo: number; monto: number; medio: string | null; actor?: string | null; cobradoEn?: Date | null },
): Promise<ResultadoEmision | null> {
  const medio = medioDelCatalogo(p.medio);
  if (!medio) return null;
  const cobradoEn = p.cobradoEn ?? new Date();
  const pagoExterno = pagoExternoDelActor(p.actor);
  return emitirEvento(tx, {
    tenantId: p.tenantId,
    tipo: "pedido.cobrado",
    version: 1,
    clave: `pedido:${p.pedidoId}:cobrado`,
    ocurridoEn: cobradoEn,
    datos: {
      pedidoId: p.pedidoId,
      codigo: p.codigo,
      monto: round2(p.monto),
      medio,
      ...(pagoExterno ? { pagoExterno } : {}),
      cobradoEn: cobradoEn.toISOString(),
    },
  });
}

type TxSaldo = {
  order: {
    findFirst(args: {
      where: { id: string; tenantId: string };
      select: { code: true; total: true; status: true };
    }): Promise<{ code: number; total: unknown; status: string } | null>;
  };
  accountReceivable: {
    findFirst(args: { where: { id: string; tenantId: string }; select: { orderId: true } }): Promise<{ orderId: string | null } | null>;
  };
};

/**
 * El cobro que SALDA un pedido por la cobranza (settlement/collection-repo.ts: cobros parciales
 * con `Collection`). Lo llama applyCollectionInTx cuando ESE cobro pasó el pedido a pago. Monto =
 * el total del pedido (como el botón «Cobrar»); medio = el del cobro que cerró el saldo.
 *
 * REGLA (CERT-P2 vuelta 4, O-v4-5): un pedido CANCELADO no emite `pedido.cobrado`. Si después de
 * anularlo entra plata por su deuda (un fiado que la anulación no cerró), esa plata es un cobro de
 * la cuenta corriente del cliente, no el cobro de una venta que ya no existe: un suscriptor que
 * recibió `pedido.cancelado` no puede recibir después `pedido.cobrado` del mismo pedido. El cobro
 * se registra igual (el libro y la cuenta no cambian); sólo no hay evento de pedido.
 */
export async function emitirPedidoCobradoAlSaldar(
  tx: object,
  p: { tenantId: string; pedidoId: string; medio: string; actor?: string | null },
): Promise<ResultadoEmision | null> {
  if (!tieneSql(tx)) return { escrito: false, motivo: "sin-sql" };
  const o = await (tx as unknown as TxSaldo).order.findFirst({
    where: { id: p.pedidoId, tenantId: p.tenantId },
    select: { code: true, total: true, status: true },
  });
  if (!o || o.status === "CANCELLED") return null;
  return emitirPedidoCobrado(tx, { tenantId: p.tenantId, pedidoId: p.pedidoId, codigo: o.code, monto: Number(o.total), medio: p.medio, actor: p.actor });
}

/**
 * El cobro que salda la deuda de un pedido dejado al fiado (clientes/fiado.ts). Entregar al fiado
 * no es un cobro —no entró plata, igual que la venta a cuenta de insertOrder— y no emite; cuando
 * el cliente termina de pagar esa deuda, el pedido quedó cobrado. Una deuda sin pedido (cargada a
 * mano en la cuenta) no emite nada: no hay pedido que cobrar.
 */
export async function emitirPedidoCobradoAlSaldarFiado(
  tx: object,
  p: { tenantId: string; receivableId: string; medio: string; actor?: string | null },
): Promise<ResultadoEmision | null> {
  if (!tieneSql(tx)) return { escrito: false, motivo: "sin-sql" };
  const deuda = await (tx as unknown as TxSaldo).accountReceivable.findFirst({
    where: { id: p.receivableId, tenantId: p.tenantId },
    select: { orderId: true },
  });
  if (!deuda?.orderId) return null;
  return emitirPedidoCobradoAlSaldar(tx, { tenantId: p.tenantId, pedidoId: deuda.orderId, medio: p.medio, actor: p.actor });
}

// ── pedido.cancelado@1 ────────────────────────────────────────────────────────

export async function emitirPedidoCancelado(
  tx: object,
  p: { tenantId: string; pedidoId: string; codigo: number; motivo: string; reintegro: number },
): Promise<ResultadoEmision> {
  return emitirEvento(tx, {
    tenantId: p.tenantId,
    tipo: "pedido.cancelado",
    version: 1,
    clave: `pedido:${p.pedidoId}:cancelado`,
    datos: {
      pedidoId: p.pedidoId,
      codigo: p.codigo,
      motivo: p.motivo,
      ...(p.reintegro > 0 ? { reintegro: round2(p.reintegro) } : {}),
    },
  });
}

// ── factura.autorizada@1 / factura.rechazada@1 ────────────────────────────────
//
// Excepción a «hecho y evento, o ninguno»: el hecho fiscal ya pasó en ARCA (el CAE está otorgado,
// el rechazo está dado). Si el evento no cumple el catálogo, NO se tumba la transacción que lo
// guarda —perder un CAE o dejar la factura PENDING reintentando contra ARCA es peor que un evento
// de menos—: se anota el error y la factura se registra igual (devuelve null). Un error de la base
// sí sube (la transacción ya está abortada). `armarSobre` valida antes de tocar la base.

async function sinTumbarElHechoFiscal(emision: () => Promise<ResultadoEmision | null>): Promise<ResultadoEmision | null> {
  try {
    return await emision();
  } catch (error) {
    if (!(error instanceof EventoInvalido)) throw error;
    console.error(`[eventos] ${error.message} · el hecho fiscal se registra sin su evento`);
    return null;
  }
}

/**
 * Clase del comprobante por su tipo de ARCA, con la tabla oficial del repo
 * (src/lib/contador/recibidos-formato.ts): 3/8/13/53/112…/203… = NOTA_CREDITO; 2/7/12/52/115…/202…
 * = NOTA_DEBITO; 1/6/11/51/81/82/111/118/201… = FACTURA; el resto (recibos, liquidaciones) = OTRO.
 */
export function claseDelComprobante(tipo: number): "FACTURA" | "NOTA_DEBITO" | "NOTA_CREDITO" | "OTRO" {
  if (esNotaDeCreditoRecibida(tipo)) return "NOTA_CREDITO";
  const nombre = nombreDelTipo(tipo);
  if (/^(Tique )?[Nn]ota de débito/.test(nombre)) return "NOTA_DEBITO";
  if (/^(Tique )?[Ff]actura/.test(nombre)) return "FACTURA";
  return "OTRO";
}

type TxFactura = {
  invoice: {
    findFirst(args: {
      where: { id: string; tenantId: string };
      select: { total: true; orderId: true; appointmentId: true };
    }): Promise<{ total: unknown; orderId: string | null; appointmentId: string | null } | null>;
  };
};

/** Lo llama registerFiscalDocument DESPUÉS de que la factura tomó el CAE (count === 1). */
export async function emitirFacturaAutorizada(
  tx: object,
  f: { tenantId: string; invoiceId: string; tipoComprobante: number; puntoVenta: number; numero: number; cae: string; caeVencimiento: string },
): Promise<ResultadoEmision | null> {
  if (!tieneSql(tx)) return { escrito: false, motivo: "sin-sql" };
  const fila = await (tx as unknown as TxFactura).invoice.findFirst({
    where: { id: f.invoiceId, tenantId: f.tenantId },
    select: { total: true, orderId: true, appointmentId: true },
  });
  if (!fila) return null;
  return sinTumbarElHechoFiscal(() => emitirEvento(tx, {
    tenantId: f.tenantId,
    tipo: "factura.autorizada",
    version: 1,
    clave: `factura:${f.invoiceId}:autorizada`,
    datos: {
      facturaId: f.invoiceId,
      tipoComprobante: f.tipoComprobante,
      puntoVenta: f.puntoVenta,
      numero: f.numero,
      cae: f.cae,
      caeVencimiento: f.caeVencimiento,
      clase: claseDelComprobante(f.tipoComprobante),
      total: round2(Number(fila.total)),
      ...(fila.orderId ? { pedidoId: fila.orderId } : {}),
      ...(fila.appointmentId ? { turnoId: fila.appointmentId } : {}),
    },
  }));
}

/** Lo llama markInvoiceRejected DESPUÉS de que la factura quedó rechazada (count === 1). */
export async function emitirFacturaRechazada(
  tx: object,
  f: { tenantId: string; invoiceId: string; motivo: string; envioId: string },
): Promise<ResultadoEmision | null> {
  return sinTumbarElHechoFiscal(() => emitirEvento(tx, {
    tenantId: f.tenantId,
    tipo: "factura.rechazada",
    version: 1,
    // Con el envío: una factura rechazada se puede reabrir y volver a rechazar (otro hecho).
    clave: `factura:${f.invoiceId}:rechazada:${f.envioId}`,
    datos: { facturaId: f.invoiceId, motivo: f.motivo },
  }));
}

// ── pedido.confirmado@1 / pedido.listo@1 / pedido.entregado@1 ─────────────────
//
// Los pasos de la bandeja (advanceOrderStatus y entregarPedido en order-actions.ts, la venta de
// mostrador que nace entregada en order-actions.ts y supermercado/caja-actions.ts, la entrega al
// fiado en clientes/fiado.ts). El paso se escribe con compare-and-set sobre el estado leído, y el
// evento sale en la MISMA transacción: si otra pestaña ya lo movió (count 0), no hay paso ni evento.
//   · PENDING → CONFIRMED (servicios) o PENDING → PREPARING (comercio, que se saltea Confirmado):
//     el negocio aceptó el pedido → `pedido.confirmado`. Un pedido que NACE confirmado (mostrador,
//     API) no lo emite: su `pedido.creado` ya lo dice.
//   · → READY → `pedido.listo`.  · → DELIVERED → `pedido.entregado`.
//   · CONFIRMED → PREPARING no tiene evento (es interno de la cocina).

type PasoConEvento = "pedido.confirmado" | "pedido.listo" | "pedido.entregado";

/** El evento del paso `de → a` de la bandeja, o null si ese paso no tiene evento. PURA. */
export function eventoDelPaso(de: string, a: string): PasoConEvento | null {
  if (a === "DELIVERED") return "pedido.entregado";
  if (a === "READY") return "pedido.listo";
  if (de === "PENDING" && (a === "CONFIRMED" || a === "PREPARING")) return "pedido.confirmado";
  return null;
}

type TxPaso = {
  order: {
    findFirst(args: {
      where: { id: string; tenantId: string };
      select: { code: true; fulfillment: true };
    }): Promise<{ code: number; fulfillment: string } | null>;
    updateMany(args: { where: { id: string; tenantId: string; status: string }; data: { status: string } }): Promise<{ count: number }>;
  };
};

/** Emite el evento del paso `de → a` (ya escrito en `tx`). null = ese paso no tiene evento. */
export async function emitirPasoDelPedido(
  tx: object,
  p: { tenantId: string; pedidoId: string; de: string; a: string; ocurridoEn?: Date },
): Promise<ResultadoEmision | null> {
  const evento = eventoDelPaso(p.de, p.a);
  if (!evento) return null;
  if (!tieneSql(tx)) return { escrito: false, motivo: "sin-sql" };
  const o = await (tx as unknown as TxPaso).order.findFirst({
    where: { id: p.pedidoId, tenantId: p.tenantId },
    select: { code: true, fulfillment: true },
  });
  if (!o) return null;
  const cuando = p.ocurridoEn ?? new Date();
  const base = { tenantId: p.tenantId, ocurridoEn: cuando };
  switch (evento) {
    case "pedido.confirmado":
      return emitirEvento(tx, { ...base, tipo: evento, version: 1, clave: `pedido:${p.pedidoId}:confirmado`, datos: { pedidoId: p.pedidoId, codigo: o.code } });
    case "pedido.listo":
      return emitirEvento(tx, {
        ...base, tipo: evento, version: 1, clave: `pedido:${p.pedidoId}:listo`,
        datos: { pedidoId: p.pedidoId, codigo: o.code, entrega: o.fulfillment === "DELIVERY" ? "DELIVERY" : "RETIRA" },
      });
    case "pedido.entregado":
      return emitirEvento(tx, {
        ...base, tipo: evento, version: 1, clave: `pedido:${p.pedidoId}:entregado`,
        datos: { pedidoId: p.pedidoId, codigo: o.code, entregadoEn: cuando.toISOString() },
      });
  }
}

/**
 * Mueve el pedido `de → a` con compare-and-set y emite el evento del paso, en la transacción del
 * llamador. Devuelve si el paso se dio (false = otra pestaña ya lo había movido: ni paso ni
 * evento). Es el cuerpo de las escrituras de la bandeja: el «sólo si sigue en `de`» es el de siempre.
 */
export async function moverPedidoConEventoEnTx(
  tx: object,
  p: { tenantId: string; pedidoId: string; de: string; a: string },
): Promise<boolean> {
  const r = await (tx as unknown as TxPaso).order.updateMany({
    where: { id: p.pedidoId, tenantId: p.tenantId, status: p.de },
    data: { status: p.a },
  });
  if (r.count !== 1) return false;
  await emitirPasoDelPedido(tx, p);
  return true;
}

// ── caja.abierta@1 / caja.turno.cerrada@1 / caja.cerrada@1 ────────────────────
//
// Los tres hechos de la caja, en la transacción Serializable que los asienta (caja-actions.ts,
// cierre-diario-actions.ts). `cierreId` es el id del TURNO de caja (CashSession) en la apertura y
// en el cierre del turno —el mismo id en los dos eventos—, y el del registro del cierre del día en
// `caja.cerrada` (un día reabierto y vuelto a cerrar es otro cierre, con otro id).

export async function emitirCajaAbierta(
  tx: object,
  p: { tenantId: string; sesionId: string; abiertaEn: Date; inicial: number },
): Promise<ResultadoEmision> {
  return emitirEvento(tx, {
    tenantId: p.tenantId,
    tipo: "caja.abierta",
    version: 1,
    clave: `caja:${p.sesionId}:abierta`,
    ocurridoEn: p.abiertaEn,
    datos: { cierreId: p.sesionId, fecha: p.abiertaEn.toISOString(), inicial: round2(p.inicial) },
  });
}

type TxTurnoCaja = {
  cashSession: {
    findFirst(args: { where: { id: string; tenantId: string }; select: { openedAt: true } }): Promise<{ openedAt: Date } | null>;
  };
};

/** Cierre de un turno de caja (arqueo). `turno` = la hora de apertura del turno (ISO). */
export async function emitirCajaTurnoCerrada(
  tx: object,
  p: { tenantId: string; sesionId: string; quien: string; esperado: number; contado: number; diferencia: number; motivo: string | null },
): Promise<ResultadoEmision> {
  if (!tieneSql(tx)) return { escrito: false, motivo: "sin-sql" };
  const s = await (tx as unknown as TxTurnoCaja).cashSession.findFirst({
    where: { id: p.sesionId, tenantId: p.tenantId },
    select: { openedAt: true },
  });
  return emitirEvento(tx, {
    tenantId: p.tenantId,
    tipo: "caja.turno.cerrada",
    version: 1,
    clave: `caja:turno:${p.sesionId}:cerrada`,
    datos: {
      cierreId: p.sesionId,
      turno: (s?.openedAt ?? new Date()).toISOString(),
      quien: p.quien,
      esperado: round2(p.esperado),
      contado: round2(p.contado),
      diferencia: round2(p.diferencia),
      ...(p.motivo ? { motivo: p.motivo } : {}),
    },
  });
}

const MEDIOS_DE_CAJA = ["EFECTIVO", "MP", "TRANSFERENCIA", "TARJETA"] as const;
type MedioDeCaja = (typeof MEDIOS_DE_CAJA)[number];

/**
 * Cierre del día (cerrarDia). Los totales son los de los medios DECLARADOS (contados), como la
 * fila TOTAL del cierre: un medio sin declarar (la tarjeta que se liquida a T+N) no entra en
 * `esperado`/`contado`/`diferencia` ni en `porMedio` (lo contado por medio).
 */
export async function emitirCajaCerrada(
  tx: object,
  p: {
    tenantId: string;
    cierreId: string;
    dia: string;
    porMedio: Record<string, { expected: number; declared: number | null; diff: number | null }>;
  },
): Promise<ResultadoEmision> {
  let esperado = 0;
  let contado = 0;
  let diferencia = 0;
  const porMedio: Partial<Record<MedioDeCaja, number>> = {};
  for (const [medio, m] of Object.entries(p.porMedio)) {
    if (m.declared === null) continue;
    esperado += m.expected;
    contado += m.declared;
    diferencia += m.diff ?? m.declared - m.expected;
    if ((MEDIOS_DE_CAJA as readonly string[]).includes(medio)) porMedio[medio as MedioDeCaja] = round2(m.declared);
  }
  return emitirEvento(tx, {
    tenantId: p.tenantId,
    tipo: "caja.cerrada",
    version: 1,
    clave: `caja:${p.cierreId}:cerrada`,
    datos: { cierreId: p.cierreId, fecha: p.dia, esperado: round2(esperado), contado: round2(contado), diferencia: round2(diferencia), porMedio },
  });
}

// ── cliente.creado@1 ──────────────────────────────────────────────────────────

/** Alta de una ficha (crearFichaEnTx: Clientes y Vender). El teléfono va enmascarado. */
export async function emitirClienteCreado(
  tx: object,
  p: { tenantId: string; clienteId: string; nombre: string; telefono: string | null },
): Promise<ResultadoEmision> {
  return emitirEvento(tx, {
    tenantId: p.tenantId,
    tipo: "cliente.creado",
    version: 1,
    clave: `cliente:${p.clienteId}:creado`,
    datos: { clienteId: p.clienteId, nombre: p.nombre, telefonoEnmascarado: enmascararTelefono(p.telefono) },
  });
}

// ── producto.actualizado@1 ────────────────────────────────────────────────────

type TxProductos = {
  product: {
    findMany(args: {
      where: { tenantId: string; id: { in: string[] } };
      select: { id: true; codigo: true; active: true; saleUnit: true; price: true; pricePerKg: true };
    }): Promise<{ id: string; codigo: string | null; active: boolean; saleUnit: string; price: number | null; pricePerKg: number | null }[]>;
  };
};

/**
 * Cambio de precio (registrarCambiosDePrecio: actualizar precios, planilla, ficha del producto,
 * alta con precio, catálogo de la marca) o de estado (toggleProductActive), en la transacción que
 * lo escribe. Lee el producto YA cambiado: `precio` y `activo` son los de después. Una fila por
 * producto; `cambio` + el lote identifican el hecho (sin lote, uno nuevo por llamada).
 */
export async function emitirProductosActualizados(
  tx: object,
  p: { tenantId: string; productIds: readonly string[]; cambio: "precio" | "alta" | "estado"; loteId?: string | null },
): Promise<number> {
  if (p.productIds.length === 0 || !tieneSql(tx)) return 0;
  const filas = await (tx as unknown as TxProductos).product.findMany({
    where: { tenantId: p.tenantId, id: { in: [...new Set(p.productIds)] } },
    select: { id: true, codigo: true, active: true, saleUnit: true, price: true, pricePerKg: true },
  });
  const cambioId = `${p.cambio}:${p.loteId ?? globalThis.crypto.randomUUID()}`;
  let escritos = 0;
  for (const f of filas) {
    const precio = f.saleUnit === "WEIGHT" ? f.pricePerKg : f.price;
    const r = await emitirEvento(tx, {
      tenantId: p.tenantId,
      tipo: "producto.actualizado",
      version: 1,
      clave: `producto:${f.id}:${cambioId}`,
      datos: {
        productoId: f.id,
        sku: f.codigo || null,
        precio: precio === null || precio === undefined ? null : round2(Number(precio)),
        activo: f.active,
        cambios: [p.cambio],
      },
    });
    if (r.escrito) escritos++;
  }
  return escritos;
}
