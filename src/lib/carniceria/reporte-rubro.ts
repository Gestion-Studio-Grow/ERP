// ============================================================================
// REPORTE DE LA CARNICERÍA (Magra T7) — lógica pura. Este mes (hasta hoy) contra el mes anterior
// entero, por día del NEGOCIO. Tres bloques:
//   a) kilos vendidos por corte (top 10, % del total, variación contra el mes anterior);
//   b) rendimiento y merma del despiece, promedio por corte de origen;
//   c) merma por vencimiento (kilos y $) y la plata en riesgo de hoy.
// Sin DB → testeable. La lectura vive en reporte-rubro-loader.ts y en los loaders de Lotes y
// Despiece; la página es src/app/admin/(dashboard)/reportes/carniceria/page.tsx.
// ============================================================================

import type { Prisma } from "@/generated/prisma/client";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { redondearAlCentavo } from "@/lib/dinero/redondeo";
import { rubroConPerecederos } from "@/blueprints/retail/rubros";
import { mermaPct, yieldPct } from "./despiece";
import { diaDelLote, expiryState, type Batch } from "./lotes";
import type { CorridaLeida } from "./despiece-loader";

/** Un rango de días de calendario del negocio: `desde` incluido, `hasta` EXCLUIDO ("AAAA-MM-DD"). */
export interface RangoDeDias {
  desde: string;
  hasta: string;
}

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const primeroDelMes = (anio: number, mes0: number) => {
  const d = new Date(Date.UTC(anio, mes0, 1));
  return d.toISOString().slice(0, 10);
};

/**
 * Este mes (del 1 a hoy incluido) y el mes anterior entero, a partir del día del negocio. PURA.
 * `hoy` = `todayInBusinessTz()`.
 */
export function mesesDelReporte(hoy: string): { actual: RangoDeDias; anterior: RangoDeDias } {
  const m = DIA.exec(hoy);
  if (!m) throw new Error(`Día inválido: ${hoy}`);
  const anio = Number(m[1]);
  const mes0 = Number(m[2]) - 1;
  const manana = new Date(Date.UTC(anio, mes0, Number(m[3]) + 1)).toISOString().slice(0, 10);
  const inicio = primeroDelMes(anio, mes0);
  return {
    actual: { desde: inicio, hasta: manana },
    anterior: { desde: primeroDelMes(anio, mes0 - 1), hasta: inicio },
  };
}

const enRango = (dia: string | null, r: RangoDeDias) => dia != null && dia >= r.desde && dia < r.hasta;

// ── a) Kilos vendidos por corte ──────────────────────────────────────────────

/**
 * Los renglones de venta POR PESO de los pedidos COBRADOS y no anulados del negocio (mismo
 * criterio que Reportes: sólo lo cobrado), creados en
 * [desde, hasta). El `tenantId` va explícito en el renglón y en el pedido. PURA.
 */
export function whereRenglonesPorPeso(tenantId: string, desde: Date, hasta: Date): Prisma.OrderItemWhereInput {
  return {
    tenantId,
    saleUnit: "WEIGHT",
    order: { tenantId, paid: true, status: { not: "CANCELLED" }, createdAt: { gte: desde, lt: hasta } },
  };
}

/** Un grupo de renglones por peso: el producto (o el nombre, si se borró) y sus kilos. */
export interface KilosVendidos {
  productId: string | null;
  name: string;
  kg: number;
}

export interface FilaDeCorte {
  clave: string;
  nombre: string;
  kg: number;
  /** Fracción del total de kilos del mes (0..1). */
  delTotal: number;
  kgAnterior: number;
  /** (kg − kgAnterior) / kgAnterior; null si el mes anterior no vendió ese corte. */
  variacion: number | null;
}

export interface KilosPorCorte {
  filas: FilaDeCorte[];
  totalKg: number;
  totalKgAnterior: number;
  /** Cortes vendidos este mes (antes del top). */
  cortes: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const claveDe = (r: KilosVendidos) => r.productId ?? `nombre:${r.name.trim().toLowerCase()}`;

function sumarPorCorte(renglones: readonly KilosVendidos[]): Map<string, { nombre: string; kg: number }> {
  const m = new Map<string, { nombre: string; kg: number }>();
  for (const r of renglones) {
    const kg = Number(r.kg);
    if (!Number.isFinite(kg) || kg <= 0) continue;
    const k = claveDe(r);
    const prev = m.get(k);
    if (prev) prev.kg += kg;
    else m.set(k, { nombre: r.name.trim() || "—", kg });
  }
  return m;
}

/** Top `tope` cortes por kilos este mes, con su parte del total y la variación. PURA. */
export function kilosPorCorte(actual: readonly KilosVendidos[], anterior: readonly KilosVendidos[], tope = 10): KilosPorCorte {
  const a = sumarPorCorte(actual);
  const b = sumarPorCorte(anterior);
  let totalKg = 0;
  for (const v of a.values()) totalKg += v.kg;
  let totalKgAnterior = 0;
  for (const v of b.values()) totalKgAnterior += v.kg;
  const filas = [...a.entries()]
    .map(([clave, v]): FilaDeCorte => {
      const kgAnterior = b.get(clave)?.kg ?? 0;
      return {
        clave,
        nombre: v.nombre,
        kg: round3(v.kg),
        delTotal: totalKg > 0 ? v.kg / totalKg : 0,
        kgAnterior: round3(kgAnterior),
        variacion: kgAnterior > 0 ? (v.kg - kgAnterior) / kgAnterior : null,
      };
    })
    .sort((x, y) => y.kg - x.kg || x.nombre.localeCompare(y.nombre, "es"))
    .slice(0, tope);
  return { filas, totalKg: round3(totalKg), totalKgAnterior: round3(totalKgAnterior), cortes: a.size };
}

// ── b) Rendimiento del despiece ──────────────────────────────────────────────

export interface RendimientoDeOrigen {
  origen: string;
  corridas: number;
  kgEntrada: number;
  kgObtenidos: number;
  /** Rendimiento promedio ponderado por kilo de entrada (0..1). */
  rendimiento: number;
  /** Merma promedio ponderada por kilo de entrada (0..1). */
  merma: number;
}

/**
 * Despieces del período (por día del negocio de su alta), sin los anulados, agrupados por corte
 * de origen (`inputName`, sin distinguir mayúsculas). El promedio es PONDERADO por kilo de
 * entrada: una media res de 110 kg pesa más que un cuarto de 30. Usa `yieldPct` y `mermaPct`
 * de despiece.ts sobre la suma del grupo. PURA.
 */
export function rendimientoDelDespiece(
  corridas: readonly Pick<CorridaLeida, "inputName" | "inputWeightKg" | "totalOutputKg" | "status" | "createdAt">[],
  rango: RangoDeDias,
): RendimientoDeOrigen[] {
  const m = new Map<string, { origen: string; corridas: number; kgEntrada: number; kgObtenidos: number }>();
  for (const c of corridas) {
    if (c.status === "CANCELLED") continue;
    if (!(c.inputWeightKg > 0)) continue;
    if (!enRango(dateStrInBusinessTz(c.createdAt), rango)) continue;
    const origen = c.inputName.trim() || "—";
    const k = origen.toLowerCase();
    const g = m.get(k) ?? { origen, corridas: 0, kgEntrada: 0, kgObtenidos: 0 };
    g.corridas++;
    g.kgEntrada += c.inputWeightKg;
    g.kgObtenidos += Math.max(0, c.totalOutputKg);
    m.set(k, g);
  }
  return [...m.values()]
    .map((g) => ({
      origen: g.origen,
      corridas: g.corridas,
      kgEntrada: round3(g.kgEntrada),
      kgObtenidos: round3(g.kgObtenidos),
      rendimiento: yieldPct(g.kgObtenidos, g.kgEntrada),
      merma: mermaPct({ inputWeightKg: g.kgEntrada, inputCost: 0, outputs: [{ name: "", weightKg: g.kgObtenidos }] }),
    }))
    .sort((x, y) => y.kgEntrada - x.kgEntrada || x.origen.localeCompare(y.origen, "es"));
}

// ── c) Merma por vencimiento ─────────────────────────────────────────────────

export interface LotePerdido {
  id: string;
  code: string;
  productName: string;
  vence: string;
  motivo: "vencido" | "retirado";
  kg: number;
  /** unitCost × kg; null = «sin costo» (sin costo cargado, sin peso o sin permiso). */
  pesos: number | null;
}

export interface MermaPorVencimiento {
  lotes: LotePerdido[];
  kg: number;
  pesos: number;
  sinCosto: number;
}

/**
 * Los lotes que se perdieron por vencimiento en el período: vencidos o retirados (EXPIRED,
 * WITHDRAWN) y los que siguen disponibles con la fecha pasada (vencidos con stock), cuyo
 * vencimiento cae en el rango. Un lote sin fecha de vencimiento no se puede ubicar en un mes y
 * queda afuera. Un lote sin costo o sin peso no se valúa en $0: se cuenta aparte. PURA.
 */
export function mermaPorVencimiento(batches: readonly Batch[], rango: RangoDeDias, hoy: string): MermaPorVencimiento {
  const lotes: LotePerdido[] = [];
  let kg = 0;
  let pesos = 0;
  let sinCosto = 0;
  for (const b of batches) {
    const vence = diaDelLote(b.expiresAt);
    if (!vence || !enRango(vence, rango)) continue;
    let motivo: LotePerdido["motivo"];
    if (b.status === "EXPIRED") motivo = "vencido";
    else if (b.status === "WITHDRAWN") motivo = "retirado";
    else if (b.status === "AVAILABLE" && expiryState(b.expiresAt, hoy) === "expired") motivo = "vencido";
    else continue;
    const peso = b.netWeightKg != null && b.netWeightKg > 0 ? b.netWeightKg : 0;
    const valor = b.unitCost != null && b.unitCost > 0 && peso > 0 ? redondearAlCentavo(b.unitCost * peso) : null;
    kg += peso;
    if (valor == null) sinCosto++;
    else pesos += valor;
    lotes.push({ id: b.id, code: b.code, productName: b.productName, vence, motivo, kg: peso, pesos: valor });
  }
  lotes.sort((x, y) => x.vence.localeCompare(y.vence) || x.code.localeCompare(y.code));
  return { lotes, kg: round3(kg), pesos: redondearAlCentavo(pesos), sinCosto };
}

// ── El link desde Reportes ───────────────────────────────────────────────────

/**
 * ¿Reportes muestra el link «Reporte de la carnicería»? Sólo al rubro que vende perecederos
 * (carnicería, verdulería, fiambrería…). Un negocio de servicios (CH) o sin rubro: no. PURA.
 */
export function muestraReporteDelRubro(rubroId: string | null | undefined): boolean {
  return rubroConPerecederos(rubroId);
}
