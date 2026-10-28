// ============================================================================
// Los eventos que emite el Core en la tanda P2 — un ayudante por hecho
// ============================================================================
//
// Las funciones del Core (order-core, order-anulacion, invoice-core) sólo agregan UNA línea
// que llama a estos ayudantes, dentro de su transacción. Acá vive la traducción del dominio
// (COUNTER, MERCADOPAGO, PICKUP…) al idioma del catálogo (MOSTRADOR, MP, RETIRA…), para que esas
// funciones no cambien de forma ni de firma.
//
// Si la emisión falla (dato fuera del catálogo, base caída), el error sube y la transacción del
// hecho vuelve atrás entera: o hay venta Y evento, o no hay ninguno de los dos.
// ============================================================================

import { round2 } from "@/lib/round";
import { emitirEvento, tieneSql, type ResultadoEmision } from "./emitir";

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
  return emitirEvento(tx, {
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
      total: round2(Number(fila.total)),
      ...(fila.orderId ? { pedidoId: fila.orderId } : {}),
      ...(fila.appointmentId ? { turnoId: fila.appointmentId } : {}),
    },
  });
}

/** Lo llama markInvoiceRejected DESPUÉS de que la factura quedó rechazada (count === 1). */
export async function emitirFacturaRechazada(
  tx: object,
  f: { tenantId: string; invoiceId: string; motivo: string; envioId: string },
): Promise<ResultadoEmision> {
  return emitirEvento(tx, {
    tenantId: f.tenantId,
    tipo: "factura.rechazada",
    version: 1,
    // Con el envío: una factura rechazada se puede reabrir y volver a rechazar (otro hecho).
    clave: `factura:${f.invoiceId}:rechazada:${f.envioId}`,
    datos: { facturaId: f.invoiceId, motivo: f.motivo },
  });
}
