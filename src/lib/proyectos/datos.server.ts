// ============================================================================
// PROYECTOS — lecturas del servidor. Siempre acotadas al negocio (tenantId). Quien no maneja plata
// (diseño, armado) ve el trabajo pero no costos, márgenes ni cobros. Las escrituras: acciones.ts.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import type { SessionUser } from "@/lib/session";
import { getLocation } from "@/lib/settings";
import { redondear, totales } from "./core";
import { costosVigentes, normalizarDiseno } from "./stand";

export const veLaPlata = (u: SessionUser): boolean => roleHasCapability(u.role, "agenda:manage");

export async function configProyectos(tenantId: string) {
  const c = await prisma.proyectoConfig.findUnique({ where: { tenantId } });
  return {
    margenPct: c?.margenPct ?? 35,
    validezDias: c?.validezDias ?? 15,
    ivaPct: c?.ivaPct ?? 21,
    condiciones: c?.condiciones ?? "",
    costos: costosVigentes(c?.costosStand),
  };
}

export async function datosDelNegocio(tenantId: string) {
  const [tenant, loc] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } }),
    getLocation(),
  ]);
  return {
    nombre: tenant?.name ?? "La productora",
    slug: tenant?.slug ?? "",
    whatsapp: loc.whatsapp,
    instagramUrl: loc.instagramUrl,
    instagramLabel: loc.instagramLabel,
  };
}

/** Tablero: todos los proyectos abiertos, con lo justo para agruparlos por etapa. */
export async function tableroProyectos() {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const proyectos = await prisma.proyecto.findMany({
    where: { tenantId },
    orderBy: [{ fechaEvento: { sort: "asc", nulls: "last" } }, { numero: "desc" }],
    take: 300,
    select: {
      id: true,
      numero: true,
      nombre: true,
      servicio: true,
      etapa: true,
      evento: true,
      fechaEvento: true,
      fechaArmado: true,
      responsable: true,
      client: { select: { name: true } },
      tareas: { where: { hechaEl: null }, select: { id: true, venceEl: true } },
    },
  });
  return { conPlata: veLaPlata(user), proyectos };
}

/** La ficha completa. Las imágenes viajan aparte: acá sólo su ficha, para no bajar megas de más. */
export async function fichaProyecto(id: string) {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const conPlata = veLaPlata(user);
  const proyecto = await prisma.proyecto.findFirst({
    where: { id, tenantId },
    include: {
      client: { select: { id: true, name: true, phone: true, email: true } },
      tareas: { orderBy: [{ hechaEl: { sort: "asc", nulls: "first" } }, { venceEl: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] },
      archivos: { orderBy: { createdAt: "desc" } },
      stands: { orderBy: { createdAt: "asc" }, select: { id: true, nombre: true, updatedAt: true } },
      presupuestos: { orderBy: { version: "desc" }, include: { items: { orderBy: [{ posicion: "asc" }, { createdAt: "asc" }] } } },
      pagos: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!proyecto) return null;
  const [config, negocio] = await Promise.all([configProyectos(tenantId), datosDelNegocio(tenantId)]);
  const vigente = proyecto.presupuestos.find((p) => p.estado === "APROBADO") ?? null;
  const totalAprobado = vigente ? totales(vigente.items, vigente.ivaPct).total : 0;
  const cobrado = redondear(proyecto.pagos.filter((p) => !p.anuladoEl).reduce((s, p) => s + p.monto, 0));
  return { user, conPlata, proyecto, config, negocio, totalAprobado, cobrado, saldo: redondear(totalAprobado - cobrado) };
}

export async function standParaEditar(proyectoId: string, standId: string) {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const stand = await prisma.proyectoStand.findFirst({
    where: { id: standId, proyectoId, tenantId },
    include: { proyecto: { select: { id: true, numero: true, nombre: true, client: { select: { name: true } } } } },
  });
  if (!stand) return null;
  const diseno = normalizarDiseno(stand.diseno);
  return diseno ? { ...stand, diseno } : null;
}

export async function clientesDelNegocio() {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  return prisma.client.findMany({ where: { tenantId }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } });
}

export async function reporteProyectos() {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const proyectos = await prisma.proyecto.findMany({
    where: { tenantId },
    orderBy: { numero: "desc" },
    take: 500,
    select: {
      id: true,
      numero: true,
      nombre: true,
      servicio: true,
      etapa: true,
      client: { select: { name: true } },
      presupuestos: { where: { estado: "APROBADO" }, select: { ivaPct: true, items: { select: { cantidad: true, costo: true, precio: true } } } },
      pagos: { where: { anuladoEl: null }, select: { monto: true } },
    },
  });
  return proyectos.map((p) => {
    const a = p.presupuestos[0];
    const t = a ? totales(a.items, a.ivaPct) : null;
    const cobrado = redondear(p.pagos.reduce((s, x) => s + x.monto, 0));
    return { ...p, t, cobrado, saldo: redondear((t?.total ?? 0) - cobrado) };
  });
}

// ── Link público (sin login): la llave es el token ──────────────────────────

export async function propuestaPublica(token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const tenantId = await getCurrentTenantId();
  // Un borrador todavía no existe para el cliente.
  const presupuesto = await prisma.proyectoPresupuesto.findFirst({
    where: { tenantId, token, estado: { not: "BORRADOR" } },
    include: {
      items: { orderBy: [{ posicion: "asc" }, { createdAt: "asc" }], select: { id: true, rubro: true, descripcion: true, unidad: true, cantidad: true, precio: true, costo: true } },
      proyecto: {
        select: {
          id: true,
          numero: true,
          nombre: true,
          servicio: true,
          evento: true,
          lugar: true,
          fechaEvento: true,
          fechaArmado: true,
          fechaDesarme: true,
          client: { select: { name: true } },
          archivos: { where: { visibleCliente: true, datos: { not: null } }, orderBy: { createdAt: "asc" }, select: { id: true, nombre: true, tipo: true, datos: true } },
          stands: { orderBy: { createdAt: "asc" }, select: { id: true, nombre: true, diseno: true } },
        },
      },
    },
  });
  if (!presupuesto) return null;
  const t = totales(presupuesto.items, presupuesto.ivaPct);
  const negocio = await datosDelNegocio(tenantId);
  return {
    negocio,
    presupuesto: {
      ...presupuesto,
      // El costo y el proveedor son internos: del servidor sale sólo lo que el cliente puede ver.
      items: presupuesto.items.map(({ id, rubro, descripcion, unidad, cantidad, precio }) => ({ id, rubro, descripcion, unidad, cantidad, precio })),
    },
    totales: { neto: t.neto, iva: t.iva, total: t.total },
  };
}
