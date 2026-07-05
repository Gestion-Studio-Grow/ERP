/**
 * ADAPTER stub de Mercado Pago: en memoria, sin red. Permite simular
 * notificaciones de pago y testear el flujo webhook→factura sin credenciales.
 * NO habla con MP real. Ver ADR-024 §2.d.
 */

import {
  CriterioBusqueda,
  MercadoPagoClient,
  MercadoPagoConfig,
  PaginaPagos,
  PagoMP,
} from "./port";

export class StubMercadoPagoClient implements MercadoPagoClient {
  private pagos = new Map<string, PagoMP>();
  /** Orden de inserción, para paginar de forma estable. */
  private orden: string[] = [];

  constructor(private readonly config?: MercadoPagoConfig) {}

  /** Siembra un pago simulado (para tests / demo). */
  simularPago(pago: PagoMP): void {
    if (!this.pagos.has(pago.id)) this.orden.push(pago.id);
    this.pagos.set(pago.id, pago);
  }

  /**
   * Genera un feed de `n` operaciones chicas aprobadas de un monotributista
   * (ADR-025 §7). Determinístico (sin Math.random): montos y fechas variados a
   * partir del índice, para poder testear volumen e idempotencia de forma estable.
   */
  simularFeedMonotributista(n: number, fechaBase = "20260701"): void {
    for (let i = 0; i < n; i++) {
      const monto = 500 + (i % 20) * 137; // montos chicos, variados
      const dia = 1 + (i % 28);
      const fecha = `${fechaBase.slice(0, 6)}${String(dia).padStart(2, "0")}`;
      this.simularPago({
        id: `mp-${String(i + 1).padStart(6, "0")}`,
        estado: "approved",
        monto,
        externalReference: "", // venta directa: no hay turno
        fechaAcreditacion: fecha,
        comision: Math.round(monto * 0.05 * 100) / 100,
        descripcion: `Venta MP #${i + 1}`,
      });
    }
  }

  async getPayment(paymentId: string): Promise<PagoMP> {
    const pago = this.pagos.get(paymentId);
    if (!pago) {
      throw new Error(`StubMercadoPago: no existe el pago simulado ${paymentId}.`);
    }
    return pago;
  }

  async listPayments(criterio: CriterioBusqueda): Promise<PaginaPagos> {
    const limit = criterio.limit ?? 50;
    // El cursor es el índice de arranque (opaco hacia afuera).
    const start = criterio.cursor ? Number(criterio.cursor) : 0;

    const filtrados = this.orden
      .map((id) => this.pagos.get(id)!)
      .filter((p) => {
        if (criterio.desde && p.fechaAcreditacion && p.fechaAcreditacion < criterio.desde) return false;
        if (criterio.hasta && p.fechaAcreditacion && p.fechaAcreditacion > criterio.hasta) return false;
        return true;
      });

    const pagina = filtrados.slice(start, start + limit);
    const next = start + limit;
    return {
      pagos: pagina,
      nextCursor: next < filtrados.length ? String(next) : undefined,
    };
  }
}
