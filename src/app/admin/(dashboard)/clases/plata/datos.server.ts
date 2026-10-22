import "server-only";

// ============================================================================
// PADEL-CLASES — lecturas de Plata que no están en lib/padel/datos.server.ts (Tanda 3B).
// ============================================================================
//
// - `cobrosDelPeriodo`: los cobros, de a uno, para el .csv (M-075). MISMO filtro que el «Cobrado»
//   de `plata(periodo)` (datos.server.ts:744-747): lo pagado y lo que después quedó a favor (la
//   plata entró), sin lo pagado con saldo a favor (ya se contó cuando entró). Así el .csv y la
//   pantalla dan el mismo total.
// - `paraDevolver`: para «Le devolví» en Plata → A favor, la clase acreditada que el botón marca
//   (la misma regla que la lista de Alumnos: una que entre en el saldo, nunca dejarlo negativo).
//
// Todo acotado por el negocio (`tenantId`); la página o la ruta piden su permiso antes (requireApp).

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { businessWallTimeToUtc, todayInBusinessTz } from "@/lib/datetime";
import { medioDelCobro, rangoDelPeriodo, type FilaCobro, type PeriodoPlata } from "./periodo";

/** Como mucho: un profe da unas 300 clases por mes. Un tope para que el archivo nunca sea enorme. */
const MAX_FILAS = 5000;

export async function cobrosDelPeriodo(periodo: PeriodoPlata): Promise<{ hoy: string; filas: FilaCobro[] }> {
  const tenantId = await getCurrentTenantId();
  const hoy = todayInBusinessTz();
  const r = rangoDelPeriodo(periodo, hoy);
  const desde = businessWallTimeToUtc(r.desde, "00:00");
  const hasta = businessWallTimeToUtc(r.hasta, "00:00");
  const cobros = await prisma.padelClase.findMany({
    where: {
      tenantId,
      pagoEstado: { in: ["PAGADO", "ACREDITADO"] },
      pagoValidadoEl: { gte: desde, lt: hasta },
      OR: [{ pagoMedio: null }, { pagoMedio: { not: "SALDO_A_FAVOR" } }],
    },
    orderBy: { pagoValidadoEl: "asc" },
    take: MAX_FILAS,
    select: { pagoValidadoEl: true, pagoMedio: true, precio: true, client: { select: { name: true } } },
  });
  return {
    hoy,
    filas: cobros.map((c) => ({ fecha: c.pagoValidadoEl ?? desde, alumno: c.client.name, medio: medioDelCobro(c.pagoMedio), monto: Number(c.precio) })),
  };
}

/**
 * Para cada alumno con saldo a favor, la clase acreditada que «Le devolví» puede marcar (precio ≤
 * saldo, la más nueva). Una sola consulta para todos.
 */
export async function paraDevolver(saldos: readonly { alumnoId: string; aFavor: number }[]): Promise<Map<string, { claseId: string; monto: number }>> {
  const out = new Map<string, { claseId: string; monto: number }>();
  if (!saldos.length) return out;
  const tenantId = await getCurrentTenantId();
  const filas = await prisma.padelClase.findMany({
    where: { tenantId, alumnoId: { in: saldos.map((s) => s.alumnoId) }, pagoEstado: "ACREDITADO" },
    orderBy: { empiezaEn: "desc" },
    select: { id: true, alumnoId: true, precio: true },
  });
  const saldoDe = new Map(saldos.map((s) => [s.alumnoId, s.aFavor]));
  for (const f of filas) {
    if (out.has(f.alumnoId)) continue;
    const monto = Number(f.precio);
    if (monto > 0 && monto <= (saldoDe.get(f.alumnoId) ?? 0)) out.set(f.alumnoId, { claseId: f.id, monto });
  }
  return out;
}
