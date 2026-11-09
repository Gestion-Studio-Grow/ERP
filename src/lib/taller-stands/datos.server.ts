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

// ── Horas y valor hora (T3) ────────────────────────────────────────────────

export interface PersonaTaller {
  id: string;
  nombre: string;
}

/** Las personas activas del negocio (ProyectoPersona), siempre filtradas por tenant. */
export async function personasDelTaller(tenantId: string): Promise<PersonaTaller[]> {
  return prisma.proyectoPersona.findMany({ where: { tenantId, activa: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } });
}

export interface ValorHoraFila {
  id: string;
  personaId: string;
  valorHora: number;
  vigenteDesde: Date;
}

export async function valoresHoraDelTaller(tenantId: string): Promise<{ sinMigrar: boolean; valores: ValorHoraFila[] }> {
  try {
    const valores = await prisma.tallerValorHora.findMany({ where: { tenantId }, orderBy: { vigenteDesde: "desc" }, select: { id: true, personaId: true, valorHora: true, vigenteDesde: true } });
    return { sinMigrar: false, valores };
  } catch (e) {
    if (faltaLaTabla(e)) return { sinMigrar: true, valores: [] };
    throw e;
  }
}

export interface HoraFila {
  id: string;
  personaId: string;
  persona: string;
  fecha: Date;
  horas: number;
  valorHoraSnap: number;
  nota: string | null;
}

export async function horasDelProyecto(tenantId: string, proyectoId: string): Promise<{ sinMigrar: boolean; cargas: HoraFila[]; horasStd: { cantidad: number; horasStd: number }[] }> {
  try {
    const [filas, despiece] = await Promise.all([
      prisma.tallerHora.findMany({
        where: { tenantId, proyectoId },
        orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
        select: { id: true, personaId: true, fecha: true, horas: true, valorHoraSnap: true, nota: true, persona: { select: { nombre: true } } },
      }),
      prisma.tallerDespiece.findMany({ where: { tenantId, proyectoId }, select: { cantidad: true, pieza: { select: { horasStd: true } } } }),
    ]);
    return {
      sinMigrar: false,
      cargas: filas.map((f) => ({ id: f.id, personaId: f.personaId, persona: f.persona.nombre, fecha: f.fecha, horas: f.horas, valorHoraSnap: f.valorHoraSnap, nota: f.nota })),
      horasStd: despiece.map((d) => ({ cantidad: d.cantidad, horasStd: d.pieza.horasStd })),
    };
  } catch (e) {
    if (faltaLaTabla(e)) return { sinMigrar: true, cargas: [], horasStd: [] };
    throw e;
  }
}

export interface PedidoFila {
  id: string;
  proveedorNombre: string;
  descripcion: string;
  estado: string;
  total: number;
  iva: number;
  pedidoEl: Date;
  recibidoEl: Date | null;
  gastoId: string | null;
}

/** Pedidos de materiales del stand (T4), los más nuevos arriba. Sin la migración, vacío con `sinMigrar`. */
export async function pedidosDelProyecto(tenantId: string, proyectoId: string): Promise<{ sinMigrar: boolean; pedidos: PedidoFila[] }> {
  try {
    const pedidos = await prisma.tallerPedido.findMany({
      where: { tenantId, proyectoId },
      orderBy: { pedidoEl: "desc" },
      select: { id: true, proveedorNombre: true, descripcion: true, estado: true, total: true, iva: true, pedidoEl: true, recibidoEl: true, gastoId: true },
    });
    return { sinMigrar: false, pedidos };
  } catch (e) {
    if (faltaLaTabla(e)) return { sinMigrar: true, pedidos: [] };
    throw e;
  }
}
