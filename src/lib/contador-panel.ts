/**
 * Datos del panel del contador (ADR-025 §12.2) — SCAFFOLD con datos simulados.
 *
 * Un operador (contador) ve su cartera: cuánto cobró cada cliente por MP, cuánto
 * está facturado y cuánto no, y qué tan cerca está del tope de su categoría de
 * monotributo (§12.3). Hoy los números salen del simulador end-to-end
 * (mercadopago-simulador); en producción saldrán de la conciliación real por
 * tenant (Gate 2). Estructura pensada para no cambiar cuando llegue lo real.
 */

import { simularIngestaCliente } from "@/lib/mercadopago-simulador";

export interface FilaCartera {
  clienteId: string;
  nombre: string;
  /** Total cobrado por MP en el período. */
  cobradoMP: number;
  operaciones: number;
  facturadas: number;
  noFacturables: number;
  aRevisar: number;
  /** Monto ya facturado (base de la alerta de recategorización). */
  montoFacturado: number;
  /** Tope anual de la categoría de monotributo del cliente (provisional). */
  topeAnual: number;
  /** % del tope consumido (0..1). ≥ 0.8 ⇒ alerta (§12.3). */
  pctTope: number;
}

export interface ResumenCartera {
  clientes: number;
  cobradoMP: number;
  facturadas: number;
  aRevisar: number;
  enAlerta: number;
}

// Cartera dummy del contador (clientes ficticios con distinto volumen).
const CLIENTES_DUMMY: { id: string; nombre: string; ventas: number; topeAnual: number }[] = [
  { id: "cli-kiosco", nombre: "Kiosco La Esquina", ventas: 90, topeAnual: 8_000_000 },
  { id: "cli-verduleria", nombre: "Verdulería Doña Rosa", ventas: 140, topeAnual: 8_000_000 },
  { id: "cli-peluqueria", nombre: "Peluquería Estilo", ventas: 40, topeAnual: 6_500_000 },
  { id: "cli-panaderia", nombre: "Panadería El Trigo", ventas: 200, topeAnual: 8_000_000 },
];

export async function getCarteraSimulada(): Promise<{ filas: FilaCartera[]; resumen: ResumenCartera }> {
  const filas: FilaCartera[] = [];

  for (const c of CLIENTES_DUMMY) {
    const { resumen, facturas, cobradoBruto } = await simularIngestaCliente(c.id, c.ventas);
    const montoFacturado = facturas.reduce((s, f) => s + f.total, 0);
    filas.push({
      clienteId: c.id,
      nombre: c.nombre,
      cobradoMP: cobradoBruto,
      operaciones: resumen.leidos,
      facturadas: resumen.facturados,
      noFacturables: resumen.noFacturables,
      aRevisar: resumen.aRevisar,
      montoFacturado,
      topeAnual: c.topeAnual,
      pctTope: c.topeAnual > 0 ? montoFacturado / c.topeAnual : 0,
    });
  }

  const resumen: ResumenCartera = {
    clientes: filas.length,
    cobradoMP: filas.reduce((s, f) => s + f.cobradoMP, 0),
    facturadas: filas.reduce((s, f) => s + f.facturadas, 0),
    aRevisar: filas.reduce((s, f) => s + f.aRevisar, 0),
    enAlerta: filas.filter((f) => f.pctTope >= 0.8).length,
  };

  return { filas, resumen };
}
