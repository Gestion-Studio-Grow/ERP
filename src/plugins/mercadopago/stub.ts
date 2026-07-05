/**
 * ADAPTER stub de Mercado Pago: en memoria, sin red. Permite simular
 * notificaciones de pago y testear el flujo webhook→factura sin credenciales.
 * NO habla con MP real. Ver ADR-024 §2.d.
 */

import { MercadoPagoClient, MercadoPagoConfig, PagoMP } from "./port";

export class StubMercadoPagoClient implements MercadoPagoClient {
  private pagos = new Map<string, PagoMP>();

  constructor(private readonly config?: MercadoPagoConfig) {}

  /** Siembra un pago simulado (para tests / demo). */
  simularPago(pago: PagoMP): void {
    this.pagos.set(pago.id, pago);
  }

  async getPayment(paymentId: string): Promise<PagoMP> {
    const pago = this.pagos.get(paymentId);
    if (!pago) {
      throw new Error(`StubMercadoPago: no existe el pago simulado ${paymentId}.`);
    }
    return pago;
  }
}
