/**
 * Facturación a partir de una Orden (ADR-024 / ADR-020 §6.a). Núcleo del Core
 * que factura un pedido de retail — el gemelo de `invoice-from-appointment.ts`
 * para el vertical Orden/POS. Lo dispara la ingesta de pedidos: hoy la API de
 * front externo (superficie II de ADR-020), mañana también el POS/vidriera.
 *
 * Todo detrás del flag `isInvoicingEnabled()` en los llamadores: este módulo
 * asume que ya se decidió facturar. El Core arma la factura (concepto Productos);
 * el plugin ARCA solo integra.
 */

import { prisma } from "@/lib/prisma";
import { createInvoice } from "@/lib/invoice-core";
import { calcularImpuestos, getFiscalProfile } from "@/lib/fiscal";
import { procesarEnviosDelNegocio } from "@/lib/arca-dispatch";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import { tenantTransaction } from "@/lib/rls";
import { logger } from "@/lib/logger";
import { calcularImpuestosPorAlicuota } from "@/lib/fiscal/impuestos-por-alicuota";
import { leerDatosFiscalesDeVenta, type DatosFiscalesDeVenta } from "@/lib/fiscal/datos-fiscales-de-venta";
import {
  decidirFacturaDeVenta,
  queImpideEntregarLaFactura,
  receptorParaComprobante,
  type ReceptorDeComprobante,
} from "@/lib/fiscal/ficha-fiscal";

// Códigos de catálogo ARCA (ver src/plugins/arca/domain/catalogos.ts).
const CONCEPTO_PRODUCTOS = 1;
const DOC_CONSUMIDOR_FINAL = 99;

/**
 * Lo que el facturador usa de afuera. Es un parámetro (con los reales por defecto) para que
 * el test lo EJECUTE con el reloj fijo y sin base: la fecha del comprobante es la del día del
 * negocio, y eso se prueba corriendo `facturarOrden`, no sólo la función de la fecha.
 */
export interface DepsFacturarOrden {
  leerOrden: (orderId: string, tenantId: string) => Promise<{ total: number } | null>;
  getFiscalProfile: typeof getFiscalProfile;
  createInvoice: typeof createInvoice;
  procesarEnviosDelNegocio: typeof procesarEnviosDelNegocio;
  /** Sólo inscripto: ficha del cliente y lo cobrado por producto con su alícuota (RLS con el negocio). */
  leerDatosFiscales?: (orderId: string, tenantId: string) => Promise<DatosFiscalesDeVenta | null>;
}

const CONSUMIDOR_FINAL_SIN_IDENTIFICAR: ReceptorDeComprobante = { docTipo: DOC_CONSUMIDOR_FINAL, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" };

const leerDatosFiscalesDelNegocio = (orderId: string, tenantId: string) =>
  tenantTransaction((tx) => leerDatosFiscalesDeVenta(tx, orderId), { tenantId });

type FacturaArmada =
  | { ok: true; impuestos: ReturnType<typeof calcularImpuestos>; ivaPorProducto: boolean; receptor: ReceptorDeComprobante }
  | { ok: false; etapa: "sin-datos" | "decision" | "impreso" };

/**
 * Impuestos y comprador de la factura de una orden. Monotributo y exento (CH): lo de siempre,
 * tasa pareja y consumidor final sin identificar. Inscripto: IVA por la alícuota de cada producto
 * y el comprador de la ficha del cliente, con las MISMAS funciones con que Ventas la promete
 * (`puedeFacturarVenta`, ventas/factura.ts). Si algo falta, no se arma: no se emite a medias.
 */
async function armarFacturaDeLaOrden(
  orderId: string,
  tenantId: string,
  monto: number,
  perfil: Awaited<ReturnType<typeof getFiscalProfile>>,
  fecha: string,
  deps: DepsFacturarOrden,
): Promise<FacturaArmada> {
  if (perfil.condicionIva !== "RESPONSABLE_INSCRIPTO") {
    return { ok: true, impuestos: calcularImpuestos(perfil.condicionIva, monto), ivaPorProducto: false, receptor: CONSUMIDOR_FINAL_SIN_IDENTIFICAR };
  }
  const datos = await (deps.leerDatosFiscales ?? leerDatosFiscalesDelNegocio)(orderId, tenantId);
  if (!datos) return { ok: false, etapa: "sin-datos" };
  const r = calcularImpuestosPorAlicuota(perfil.condicionIva, { total: monto, renglones: datos.renglones });
  if (!r.ok) {
    // Sin la alícuota de cada producto sale como antes (tasa pareja, sin marcar ivaPorProducto) y el
    // plugin la rechaza: queda RECHAZADA con el motivo a la vista en Facturación y sin CAE (ENG-024,
    // umbral-en-los-seis-caminos-postgres.test.ts). Cargadas las alícuotas, «Volver a facturar» la reabre.
    return { ok: true, impuestos: calcularImpuestos(perfil.condicionIva, monto), ivaPorProducto: false, receptor: CONSUMIDOR_FINAL_SIN_IDENTIFICAR };
  }
  const d = decidirFacturaDeVenta(
    { condicionIva: perfil.condicionIva, cuit: perfil.cuit, regimenFacturaA: perfil.regimenFacturaA ?? null },
    datos.receptor,
    { hoy: fecha, total: monto },
  );
  const receptor = receptorParaComprobante(d);
  if (!receptor) return { ok: false, etapa: "decision" };
  if (queImpideEntregarLaFactura(d, datos.receptor, r.impuestos.iva.length)) return { ok: false, etapa: "impreso" };
  return { ok: true, impuestos: r.impuestos, ivaPorProducto: r.ivaPorProducto, receptor };
}

const DEPS: DepsFacturarOrden = {
  leerOrden: (orderId, tenantId) =>
    prisma.order.findFirst({ where: { id: orderId, tenantId }, select: { total: true } }),
  getFiscalProfile,
  createInvoice,
  procesarEnviosDelNegocio,
};

/**
 * Crea la factura de una orden y la despacha al plugin ARCA (tick del simulador).
 * Devuelve el `invoiceId`, o `null` si la orden no se pudo facturar (no existe,
 * otro tenant, o total no positivo). LANZA `VentaAnuladaError` si el pedido está anulado
 * (ENG-023) y "No se encontró la venta a facturar." si la fila desapareció dentro de la
 * transacción; el llamador decide si eso es best-effort (intake del pedido) o se muestra.
 *
 * Concepto PRODUCTOS: a diferencia del turno (Servicios), un pedido de retail no
 * lleva fechas de servicio. El receptor es Consumidor Final mientras la Orden no
 * capture CUIT/DNI del comprador (mismo criterio que el turno, ADR-024).
 */
export async function facturarOrden(
  orderId: string,
  tenantId: string,
  deps: DepsFacturarOrden = DEPS,
  opciones: { reabrirSiRechazada?: boolean } = {},
): Promise<string | null> {
  const order = await deps.leerOrden(orderId, tenantId);
  if (!order) return null;

  const monto = order.total;
  if (!(monto > 0)) return null;

  const perfil = await deps.getFiscalProfile(tenantId);
  // El día del NEGOCIO, no el del servidor: facturado el 31/08 a las 23:30 argentinas es
  // del 31/08 (en UTC ya es 1/09, y la venta caía en el período fiscal siguiente).
  const fecha = fechaFiscalDelDia();
  const armada = await armarFacturaDeLaOrden(orderId, tenantId, monto, perfil, fecha, deps);
  if (!armada.ok) {
    // Inscripto sin lo que la factura necesita: no se emite. Ventas ya mostró el motivo antes de
    // llamar; el pedido externo queda sin factura y se ve en Ventas. Sin datos del cliente en el log.
    logger.warn("facturacion", "orden sin factura: falta lo que la factura del inscripto necesita", { tenantId, orderId, etapa: armada.etapa });
    return null;
  }
  const { impuestos: { neto, iva, total }, ivaPorProducto, receptor } = armada;

  const invoiceId = await deps.createInvoice({
    tenantId,
    concepto: CONCEPTO_PRODUCTOS,
    fecha,
    emisor: {
      cuit: perfil.cuit,
      condicionIva: perfil.condicionIva,
      puntoVenta: perfil.puntoVenta,
    },
    // La Orden no captura CUIT/DNI del comprador todavía → Consumidor Final.
    receptor,
    neto,
    iva,
    total,
    ...(ivaPorProducto ? { ivaPorProducto: true } : {}),
    // Concepto Productos no exige fechas de servicio; sí vencimiento de pago.
    vencimientoPago: fecha,
    // I2 (ADR-064): enlace a la venta = idempotencia por pedido. Un reintento de facturación
    // del MISMO pedido devuelve el comprobante ya emitido, no crea un duplicado.
    origin: { type: "ORDER", id: orderId },
    // ENG-021: una factura rechazada se reabre sólo si lo pide quien la vuelve a facturar
    // ("Volver a facturar"); la ingesta de pedidos externos no lo pide.
    ...(opciones.reabrirSiRechazada ? { reabrirSiRechazada: true } : {}),
  });

  // Tick del simulador: en prod esto lo hace un worker periódico (ADR-002/024).
  await deps.procesarEnviosDelNegocio(tenantId);

  return invoiceId;
}
