import "server-only";

// ============================================================================
// PADEL-CLASES — lecturas de Plata que no están en lib/padel/datos.server.ts (Tanda 3B).
// ============================================================================
//
// - `cobrosDelPeriodo`: los cobros, de a uno, para el .csv (M-075). MISMO filtro que el «Cobrado»
//   de `plata(periodo)` (datos.server.ts:744-747): lo pagado y lo que después quedó a favor (la
//   plata entró), sin lo pagado con saldo a favor (ya se contó cuando entró). Así el .csv y la
//   pantalla dan el mismo total. Lo pagado «del paquete» tampoco suma (T5): suma la venta del paquete.
// - `paraDevolver`: para «Le devolví» en Plata → A favor, la clase acreditada (o la parte de
//   integrante acreditada) que el botón marca
//   (la misma regla que la lista de Alumnos: una que entre en el saldo, nunca dejarlo negativo).
//
// Todo acotado por el negocio (`tenantId`); la página o la ruta piden su permiso antes (requireApp).

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { businessWallTimeToUtc, todayInBusinessTz } from "@/lib/datetime";
import { FILTRO_PLATA_NUEVA } from "@/lib/padel/paquetes-core";
import { ventasDePaquetes } from "@/lib/padel/paquetes.server";
import { elegirDevoluciones, medioDelCobro, rangoDelPeriodo, type Acreditado, type FilaCobro, type PeriodoPlata } from "./periodo";

/** Como mucho: un profe da unas 300 clases por mes. Un tope para que el archivo nunca sea enorme. */
const MAX_FILAS = 5000;

export async function cobrosDelPeriodo(periodo: PeriodoPlata): Promise<{ hoy: string; filas: FilaCobro[] }> {
  const tenantId = await getCurrentTenantId();
  const hoy = todayInBusinessTz();
  const r = rangoDelPeriodo(periodo, hoy);
  const desde = businessWallTimeToUtc(r.desde, "00:00");
  const hasta = businessWallTimeToUtc(r.hasta, "00:00");
  const [cobros, paquetes] = await Promise.all([prisma.padelClase.findMany({
    where: {
      tenantId,
      pagoEstado: { in: ["PAGADO", "ACREDITADO"] },
      pagoValidadoEl: { gte: desde, lt: hasta },
      ...FILTRO_PLATA_NUEVA,
    },
    orderBy: { pagoValidadoEl: "asc" },
    take: MAX_FILAS,
    select: { pagoValidadoEl: true, pagoMedio: true, precio: true, client: { select: { name: true } } },
  }), ventasDePaquetes(tenantId, desde, hasta)]);
  return {
    hoy,
    filas: [
      ...cobros.map((c) => ({ fecha: c.pagoValidadoEl ?? desde, alumno: c.client.name, medio: medioDelCobro(c.pagoMedio), monto: Number(c.precio) })),
      // T5 · La venta de un paquete es plata que entró ese día (las clases que después se descuentan no).
      ...paquetes.map((v) => ({ fecha: v.pagadoEl, alumno: `${v.alumno} · paquete`, medio: medioDelCobro(v.pagoMedio), monto: v.precio })),
    ],
  };
}

/**
 * Para cada alumno con saldo a favor, lo acreditado que «Le devolví» puede marcar (monto ≤ saldo, lo
 * más nuevo): una clase propia o su parte como integrante de una grupal cancelada. Dos consultas.
 */
export async function paraDevolver(saldos: readonly { alumnoId: string; aFavor: number }[]): Promise<Map<string, { claseId: string; monto: number }>> {
  if (!saldos.length) return new Map();
  const tenantId = await getCurrentTenantId();
  const ids = saldos.map((s) => s.alumnoId);
  const [clases, partes] = await Promise.all([
    prisma.padelClase.findMany({
      where: { tenantId, alumnoId: { in: ids }, pagoEstado: "ACREDITADO" },
      select: { id: true, alumnoId: true, precio: true, empiezaEn: true },
    }),
    prisma.padelIntegrante.findMany({
      where: { tenantId, alumnoId: { in: ids }, pagoEstado: "ACREDITADO" },
      select: { id: true, alumnoId: true, monto: true, clase: { select: { empiezaEn: true } } },
    }),
  ]);
  const acreditados: Acreditado[] = [
    ...clases.map((c) => ({ id: c.id, alumnoId: c.alumnoId, monto: Number(c.precio), empiezaEn: c.empiezaEn })),
    ...partes.flatMap((p) => (p.alumnoId ? [{ id: p.id, alumnoId: p.alumnoId, monto: Number(p.monto), empiezaEn: p.clase.empiezaEn }] : [])),
  ];
  return elegirDevoluciones(saldos, acreditados);
}
