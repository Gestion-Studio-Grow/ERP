/**
 * Datos del panel del contador (ADR-025 §12.2/§12.3) — SCAFFOLD con datos
 * simulados por el pipeline end-to-end (ingesta → clasificación → facturación).
 *
 * Un operador (contador) ve su cartera: cuánto cobró cada cliente por MP, el
 * desglose de conciliación (facturado / no facturable / a revisar / rechazado),
 * cuánto lleva facturado y qué tan cerca está del tope de su categoría de
 * monotributo (alerta de recategorización). En producción sale de la
 * conciliación real por tenant (Gate 2); la estructura no cambia.
 */

import { crearEntornoSimulado, sincronizarHistorico } from "@/lib/mercadopago-ingest";

export interface ItemRevisar {
  paymentId: string;
  motivo: string;
}

export interface FilaCartera {
  clienteId: string;
  nombre: string;
  cobradoMP: number;
  operaciones: number;
  facturadas: number;
  noFacturables: number;
  aRevisar: number;
  rechazados: number;
  montoFacturado: number;
  topeAnual: number;
  /** % del tope consumido (0..1). ≥ 0.8 ⇒ alerta de recategorización (§12.3). */
  pctTope: number;
  /** Pagos que esperan decisión (para acción en lote del contador). */
  itemsRevisar: ItemRevisar[];
}

export interface ResumenCartera {
  clientes: number;
  cobradoMP: number;
  facturadas: number;
  aRevisar: number;
  rechazados: number;
  enAlerta: number;
}

// Cartera dummy del contador. Incluye casos cerca y por encima del tope para
// mostrar la alerta de recategorización (§12.3).
const CLIENTES_DUMMY: { id: string; nombre: string; ventas: number; topeAnual: number }[] = [
  { id: "cli-kiosco", nombre: "Kiosco La Esquina", ventas: 90, topeAnual: 8_000_000 },
  { id: "cli-verduleria", nombre: "Verdulería Doña Rosa", ventas: 140, topeAnual: 8_000_000 },
  { id: "cli-peluqueria", nombre: "Peluquería Estilo", ventas: 40, topeAnual: 6_500_000 },
  { id: "cli-feria", nombre: "Puesto de Feria (alto volumen)", ventas: 300, topeAnual: 650_000 },
];

async function filaDeCliente(c: (typeof CLIENTES_DUMMY)[number]): Promise<FilaCartera> {
  const env = crearEntornoSimulado(c.id);
  env.client.simularFeedMonotributista(c.ventas, "20260701");
  // Ruido realista: transferencia (cuenta propia) + devolución → no facturables.
  env.client.simularPago({ id: `${c.id}-tr`, estado: "approved", monto: 40000, externalReference: "", fechaAcreditacion: "20260715", operacion: "transferencia" });
  env.client.simularPago({ id: `${c.id}-dv`, estado: "approved", monto: 1200, externalReference: "", fechaAcreditacion: "20260716", operacion: "devolucion" });
  // Un pago dudoso (queda en REVISAR, para la acción en lote).
  env.client.simularPago({ id: `${c.id}-rev`, estado: "approved", monto: 5400, externalReference: "", fechaAcreditacion: "20260717", operacion: "otro" });

  await sincronizarHistorico(env);

  const registros = await env.reconciliacion.listar();
  const cuenta = (estado: string) => registros.filter((r) => r.estado === estado).length;
  const montoFacturado = env.facturas.reduce((s, f) => s + f.total, 0);
  const { pagos } = await env.client.listPayments({ limit: 100_000 });
  const cobradoMP = pagos.filter((p) => p.estado === "approved").reduce((s, p) => s + p.monto, 0);

  return {
    clienteId: c.id,
    nombre: c.nombre,
    cobradoMP,
    operaciones: pagos.length,
    facturadas: cuenta("FACTURADO"),
    noFacturables: cuenta("NO_FACTURABLE"),
    aRevisar: cuenta("REVISAR"),
    rechazados: cuenta("RECHAZADO"),
    montoFacturado,
    topeAnual: c.topeAnual,
    pctTope: c.topeAnual > 0 ? montoFacturado / c.topeAnual : 0,
    itemsRevisar: registros
      .filter((r) => r.estado === "REVISAR")
      .map((r) => ({ paymentId: r.paymentId, motivo: r.motivo ?? "Requiere revisión." })),
  };
}

export async function getCarteraSimulada(): Promise<{ filas: FilaCartera[]; resumen: ResumenCartera }> {
  const filas: FilaCartera[] = [];
  for (const c of CLIENTES_DUMMY) {
    filas.push(await filaDeCliente(c));
  }

  const resumen: ResumenCartera = {
    clientes: filas.length,
    cobradoMP: filas.reduce((s, f) => s + f.cobradoMP, 0),
    facturadas: filas.reduce((s, f) => s + f.facturadas, 0),
    aRevisar: filas.reduce((s, f) => s + f.aRevisar, 0),
    rechazados: filas.reduce((s, f) => s + f.rechazados, 0),
    enAlerta: filas.filter((f) => f.pctTope >= 0.8).length,
  };
  return { filas, resumen };
}
