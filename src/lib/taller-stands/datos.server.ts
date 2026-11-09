// ============================================================================
// TALLER DE STANDS — lecturas (GSG-MIA-004 · T2). Siempre acotadas al negocio. Si la migración todavía no se
// aplicó (P2021), devuelven vacío con `sinMigrar: true` para que la pantalla muestre un aviso amable.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import { tallerStandsEnabled } from "@/modules/flags";
import { configProyectos } from "@/lib/proyectos/datos.server";
import { filtroDeProyectos, tiposDeCambio, type Actor } from "@/lib/proyectos/gestion.server";
import { faltaLaTabla, papelParaMia, tallerVisible, type LineaDespiece } from "./core";

/** Flag prendida, módulo asignado y rubro del taller. Para todo lo demás (MIA incluida), no existe. */
export async function tallerActivo(tenantId: string): Promise<boolean> {
  if (!tallerStandsEnabled()) return false;
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { modules: true, blueprintId: true } });
  return tallerVisible({ flag: true, modules: t?.modules, blueprintId: t?.blueprintId });
}

export interface PiezaFila {
  id: string;
  nombre: string;
  unidad: string;
  costoUnit: number;
  horasStd: number;
  activa: boolean;
}

export async function piezasDelTaller(tenantId: string, soloActivas = false): Promise<{ sinMigrar: boolean; piezas: PiezaFila[] }> {
  try {
    const piezas = await prisma.tallerPieza.findMany({
      where: { tenantId, ...(soloActivas ? { activa: true } : {}) },
      orderBy: [{ activa: "desc" }, { nombre: "asc" }],
      select: { id: true, nombre: true, unidad: true, costoUnit: true, horasStd: true, activa: true },
    });
    return { sinMigrar: false, piezas };
  } catch (e) {
    if (faltaLaTabla(e)) return { sinMigrar: true, piezas: [] };
    throw e;
  }
}

export async function despieceDelProyecto(tenantId: string, proyectoId: string): Promise<{ sinMigrar: boolean; lineas: LineaDespiece[] }> {
  try {
    const filas = await prisma.tallerDespiece.findMany({
      where: { tenantId, proyectoId },
      orderBy: { createdAt: "asc" },
      select: { id: true, cantidad: true, costoUnitSnap: true, pieza: { select: { nombre: true, unidad: true } } },
    });
    return { sinMigrar: false, lineas: filas.map((f) => ({ id: f.id, nombre: f.pieza.nombre, unidad: f.pieza.unidad, cantidad: f.cantidad, costoUnitSnap: f.costoUnitSnap })) };
  } catch (e) {
    if (faltaLaTabla(e)) return { sinMigrar: true, lineas: [] };
    throw e;
  }
}

/** El presupuesto para la productora: la última versión (o la pedida), sin costo ni margen. */
export async function papelMiaDelProyecto(a: Actor, proyectoId: string, versionId?: string | null) {
  const p = await prisma.proyecto.findFirst({ where: { ...filtroDeProyectos(a), id: proyectoId }, select: { id: true, nombre: true, lugar: true, fechaEvento: true, client: { select: { name: true } } } });
  if (!p) return null;
  const version = await prisma.proyectoPresupuesto.findFirst({
    where: { tenantId: a.tenantId, proyectoId: p.id, ...(versionId ? { id: versionId } : {}) },
    orderBy: { version: "desc" },
    select: { version: true, ivaPct: true, condiciones: true, items: { orderBy: [{ posicion: "asc" }, { createdAt: "asc" }], select: { descripcion: true, unidad: true, cantidad: true, costo: true, moneda: true, recargoPct: true, precio: true, visibleCliente: true } } },
  });
  if (!version) return null;
  const [tc, config] = await Promise.all([tiposDeCambio(a.tenantId), configProyectos(a.tenantId)]);
  return { proyecto: p, version: version.version, condiciones: version.condiciones, papel: papelParaMia(version.items, tc, config.margenPct, version.ivaPct) };
}
