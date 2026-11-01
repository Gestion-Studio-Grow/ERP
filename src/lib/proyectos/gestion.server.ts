// ============================================================================
// GESTIÓN DE EVENTOS — lo que comparten todas las pantallas: quién es la persona, qué puede, tipos de cambio, el historial
// y la regeneración de cuotas. Siempre acotado al negocio. Reglas puras: gestion-core.ts.
// ============================================================================

import "server-only";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import type { SessionUser } from "@/lib/session";
import type { Prisma } from "@/generated/prisma/client";
import { configProyectos } from "./datos.server";
import { COLUMNAS_OCULTAS_BASE, generaCuotas, permisoDe, planDeCuotas, veTodosLosProyectos, type ItemFicha, type ModuloGestion, type RolGestion } from "./gestion-core";

export interface Actor {
  user: SessionUser;
  tenantId: string;
  personaId: string | null;
  nombre: string;
  rol: RolGestion;
  permisos: { rol: string; modulo: string; ver: boolean; editar: boolean; columnasOcultas: unknown }[];
}

/** Quien maneja la plata en el ERP y no tiene ficha de persona es Dirección: el dueño entra sin que nadie lo cargue. */
export async function actorActual(): Promise<Actor> {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const [persona, permisos] = await Promise.all([
    prisma.proyectoPersona.findFirst({ where: { tenantId, userId: user.id, activa: true }, select: { id: true, rol: true, nombre: true } }),
    prisma.proyectoPermiso.findMany({ where: { tenantId }, select: { rol: true, modulo: true, ver: true, editar: true, columnasOcultas: true } }),
  ]);
  const rol = (persona?.rol as RolGestion | undefined) ?? (roleHasCapability(user.role, "agenda:manage") ? "DIRECCION" : "DISENO");
  return { user, tenantId, personaId: persona?.id ?? null, nombre: persona?.nombre ?? user.name, rol, permisos };
}

export function puede(a: Actor, modulo: ModuloGestion, accion: "ver" | "editar"): boolean {
  return permisoDe(a.rol, modulo, a.permisos)[accion];
}

/** Para las pantallas: sin permiso, de vuelta a Inicio. */
export async function exigirVer(modulo: ModuloGestion): Promise<Actor> {
  const a = await actorActual();
  if (!puede(a, modulo, "ver")) redirect("/admin/proyectos/inicio");
  return a;
}

/** Para las acciones: esconder un botón no protege nada. */
export async function exigirEditar(modulo: ModuloGestion): Promise<Actor> {
  const a = await actorActual();
  if (!puede(a, modulo, "editar")) throw new Error("No tenés permiso para hacer esto.");
  return a;
}

export function columnasOcultas(a: Actor): string[] {
  if (a.rol === "DIRECCION") return [];
  const guardada = a.permisos.find((p) => p.rol === a.rol && p.modulo === "ficha")?.columnasOcultas;
  return Array.isArray(guardada) ? (guardada as string[]) : [...COLUMNAS_OCULTAS_BASE[a.rol]];
}

/** Filtro de proyectos que esta persona puede ver. */
export function filtroDeProyectos(a: Actor): Prisma.ProyectoWhereInput {
  if (veTodosLosProyectos(a.rol)) return { tenantId: a.tenantId };
  return { tenantId: a.tenantId, equipo: { some: { personaId: a.personaId ?? "-" } } };
}

export async function proyectoVisible(a: Actor, id: string) {
  return prisma.proyecto.findFirst({ where: { ...filtroDeProyectos(a), id }, select: { id: true } });
}

export async function tiposDeCambio(tenantId: string): Promise<Record<string, number>> {
  const filas = await prisma.proyectoTipoCambio.findMany({ where: { tenantId }, select: { moneda: true, porUnidad: true } });
  return Object.fromEntries(filas.map((f) => [f.moneda, f.porUnidad]));
}

type Tx = Prisma.TransactionClient;

/** Quién cambió qué. Sólo se registra si cambió de verdad. */
export async function registrarCambio(
  db: Tx | typeof prisma,
  d: { tenantId: string; proyectoId?: string | null; entidad: string; entidadId?: string | null; campo: string; antes?: unknown; despues?: unknown; autor: string },
) {
  const antes = d.antes == null ? null : String(d.antes);
  const despues = d.despues == null ? null : String(d.despues);
  if (antes === despues) return;
  await db.proyectoCambio.create({ data: { tenantId: d.tenantId, proyectoId: d.proyectoId ?? null, entidad: d.entidad, entidadId: d.entidadId ?? null, campo: d.campo, antes, despues, autor: d.autor } });
}

export async function avisar(db: Tx | typeof prisma, d: { tenantId: string; destinatarios: readonly string[]; tipo: string; texto: string; enlace?: string }) {
  const unicos = [...new Set(d.destinatarios)].filter(Boolean);
  if (unicos.length === 0) return;
  const apagados = await db.proyectoAvisoPref.findMany({ where: { tenantId: d.tenantId, tipo: d.tipo, enSistema: false, userId: { in: unicos } }, select: { userId: true } });
  const callados = new Set(apagados.map((p) => p.userId));
  const datos = unicos.filter((u) => !callados.has(u)).map((destinatario) => ({ tenantId: d.tenantId, destinatario, tipo: d.tipo, texto: d.texto, enlace: d.enlace ?? null }));
  if (datos.length > 0) await db.proyectoAviso.createMany({ data: datos });
}

/** La última versión del presupuesto es la ficha viva: de ahí salen planilla, cuotas y deadlines. */
export async function versionViva(tenantId: string, proyectoId: string) {
  return prisma.proyectoPresupuesto.findFirst({ where: { tenantId, proyectoId }, orderBy: { version: "desc" }, include: { items: { orderBy: { posicion: "asc" }, include: { supplier: { select: { id: true, name: true } } } } } });
}

export const aItemFicha = (i: { id: string; descripcion: string; rubro: string; cantidad: number; costo: number; moneda: string; recargoPct: number | null; precio: number; fechaLimite: Date | null; supplierId: string | null }): ItemFicha => ({
  id: i.id,
  descripcion: i.descripcion,
  rubro: i.rubro,
  cantidad: i.cantidad,
  costo: i.costo,
  moneda: i.moneda,
  recargoPct: i.recargoPct,
  precio: i.precio,
  fechaLimite: i.fechaLimite,
  supplierId: i.supplierId,
});

/**
 * Lleva las cuotas automáticas a lo que dice la ficha. Lo pagado no se toca; lo pendiente se actualiza; lo que ya no sale de
 * la ficha se anula, sin borrarlo. Antes de confirmado el proyecto no hay cuotas.
 */
export async function regenerarCuotas(tenantId: string, proyectoId: string): Promise<void> {
  const [p, viva, config, tc] = await Promise.all([
    prisma.proyecto.findFirst({ where: { id: proyectoId, tenantId }, select: { id: true, nombre: true, etapa: true, fechaEvento: true, createdAt: true, anticipoClientePct: true, perdidoEl: true } }),
    versionViva(tenantId, proyectoId),
    configProyectos(tenantId),
    tiposDeCambio(tenantId),
  ]);
  if (!p || !viva) return;
  const items = viva.items.map(aItemFicha);
  const proveedores = [...new Set(items.map((i) => i.supplierId).filter((s): s is string => !!s))];
  const fichas = await prisma.proyectoProveedorFicha.findMany({ where: { tenantId, supplierId: { in: proveedores } }, select: { supplierId: true, anticipoPct: true } });
  const plan =
    generaCuotas(p.etapa) && !p.perdidoEl
      ? planDeCuotas(items, {
          proyectoId,
          nombre: p.nombre,
          fechaEvento: p.fechaEvento,
          creado: p.createdAt,
          anticipoClientePct: p.anticipoClientePct,
          ivaPct: viva.ivaPct,
          recargoGeneral: config.margenPct,
          tiposDeCambio: tc,
          anticipoProveedor: Object.fromEntries(fichas.map((f) => [f.supplierId, f.anticipoPct])),
        })
      : [];
  const actuales = await prisma.proyectoCuota.findMany({ where: { tenantId, proyectoId, auto: true }, select: { id: true, clave: true, pagadoEl: true, anuladoEl: true } });
  const porClave = new Map(actuales.map((c) => [c.clave, c]));
  const vigentes = new Set(plan.map((c) => c.clave));
  for (const c of plan) {
    const previa = porClave.get(c.clave);
    if (previa?.pagadoEl) continue;
    const datos = { tipo: c.tipo, concepto: c.concepto, monto: c.monto, moneda: c.moneda, venceEl: c.venceEl, supplierId: c.supplierId, anuladoEl: null };
    if (previa) await prisma.proyectoCuota.update({ where: { id: previa.id }, data: datos });
    else await prisma.proyectoCuota.create({ data: { ...datos, tenantId, proyectoId, auto: true, clave: c.clave } });
  }
  const sobran = actuales.filter((c) => c.clave && !vigentes.has(c.clave) && !c.pagadoEl && !c.anuladoEl).map((c) => c.id);
  if (sobran.length > 0) await prisma.proyectoCuota.updateMany({ where: { tenantId, id: { in: sobran } }, data: { anuladoEl: new Date() } });
}
