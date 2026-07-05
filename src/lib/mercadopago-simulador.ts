/**
 * Simulador end-to-end MP → clasificación → facturación (ADR-025 §12), SIN DB ni
 * red: cierra todo el pipeline con stubs. Un feed de pagos MP de un monotributista
 * pasa por el clasificador y, lo que es venta, se factura contra el stub de ARCA
 * que devuelve un CAE simulado. Sirve para el panel del contador (datos vivos y
 * coherentes) y como demo del flujo completo antes de tener credenciales reales.
 */

import {
  StubAfipClient,
  ArcaRechazoError,
  construirComprobante,
  CondicionIva as CondicionArca,
  TipoDocumento,
  Concepto,
  type InvoiceCreatedEvent,
} from "@/plugins/arca";
import {
  StubMercadoPagoClient,
  ClasificadorPorReglas,
  ReconciliacionEnMemoria,
  sincronizarPagos,
  ErrorFacturacion,
  type FacturarPagoMP,
  type ResumenIngesta,
} from "@/plugins/mercadopago";
import { calcularImpuestos, getFiscalProfile, type CondicionIva } from "@/lib/fiscal";

export interface FacturaSimulada {
  paymentId: string;
  cae: string;
  numero: number;
  total: number;
}

export interface ResultadoSimulacion {
  resumen: ResumenIngesta;
  facturas: FacturaSimulada[];
  /** Total cobrado por MP (todos los pagos acreditados, facturables o no). */
  cobradoBruto: number;
}

function aCondicionArca(c: CondicionIva): CondicionArca {
  return CondicionArca[
    c === "RESPONSABLE_INSCRIPTO"
      ? "ResponsableInscripto"
      : c === "EXENTO"
        ? "Exento"
        : c === "CONSUMIDOR_FINAL"
          ? "ConsumidorFinal"
          : "Monotributo"
  ];
}

/**
 * Construye un `facturar` que emite contra el stub de ARCA (CAE simulado) y
 * acumula las facturas en `facturas`. Traduce un rechazo de ARCA a un
 * `ErrorFacturacion` no-reintentable (la ingesta lo marca RECHAZADO, no lo
 * reintenta). Reutilizable por el simulador y el glue de ingesta (webhook/backfill).
 */
export function crearFacturarConArcaStub(
  tenantId: string,
  facturas: FacturaSimulada[],
  afip = new StubAfipClient({ cuit: getFiscalProfile(tenantId).cuit, homologacion: true }),
): FacturarPagoMP {
  const perfil = getFiscalProfile(tenantId);
  return async (pago, tid) => {
    const { neto, iva, total } = calcularImpuestos(perfil.condicionIva, pago.monto);
    const ev: InvoiceCreatedEvent = {
      invoiceId: `sim-${pago.id}`,
      tenantId: tid,
      concepto: Concepto.Productos,
      fecha: pago.fechaAcreditacion ?? "20260701",
      emisor: { cuit: perfil.cuit, condicionIva: aCondicionArca(perfil.condicionIva), puntoVenta: perfil.puntoVenta },
      receptor: { docTipo: TipoDocumento.ConsumidorFinal, docNro: 0, condicionIva: CondicionArca.ConsumidorFinal },
      neto,
      iva,
      total,
    };
    try {
      const res = await afip.solicitarCae(construirComprobante(ev));
      facturas.push({ paymentId: pago.id, cae: res.cae, numero: res.numero, total });
      return `sim-${pago.id}`;
    } catch (err) {
      if (err instanceof ArcaRechazoError) {
        // Rechazo determinístico de ARCA: no reintentar.
        throw new ErrorFacturacion(err.message, false);
      }
      throw err; // transitorio: la ingesta reintenta
    }
  };
}

/**
 * Corre la ingesta+facturación simulada de un cliente: siembra un feed de MP con
 * `ventas` cobros + algunas operaciones no facturables (para realismo), clasifica
 * y factura las ventas contra el stub de ARCA.
 */
export async function simularIngestaCliente(
  tenantId: string,
  ventas: number,
  fechaBase = "20260701",
): Promise<ResultadoSimulacion> {
  const client = new StubMercadoPagoClient();
  client.simularFeedMonotributista(ventas, fechaBase);
  // Ruido realista: una transferencia y una devolución (no se facturan).
  const mm = fechaBase.slice(0, 6);
  client.simularPago({ id: `${tenantId}-tr`, estado: "approved", monto: 40000, externalReference: "", fechaAcreditacion: `${mm}15`, operacion: "transferencia" });
  client.simularPago({ id: `${tenantId}-dv`, estado: "approved", monto: 1200, externalReference: "", fechaAcreditacion: `${mm}16`, operacion: "devolucion" });

  const facturas: FacturaSimulada[] = [];
  const resumen = await sincronizarPagos({
    tenantId,
    client,
    clasificador: new ClasificadorPorReglas(),
    reconciliacion: new ReconciliacionEnMemoria(),
    facturar: crearFacturarConArcaStub(tenantId, facturas),
  });

  // Total cobrado por MP: todos los acreditados (incluye lo no facturable).
  const { pagos } = await client.listPayments({ limit: 10_000 });
  const cobradoBruto = pagos
    .filter((p) => p.estado === "approved")
    .reduce((s, p) => s + p.monto, 0);

  return { resumen, facturas, cobradoBruto };
}
