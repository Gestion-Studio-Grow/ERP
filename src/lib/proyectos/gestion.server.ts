// ============================================================================
// GESTIÓN DE EVENTOS — lo que comparten todas las pantallas: quién es la persona, qué puede, tipos de cambio, el historial
// y la regeneración de cuotas. Siempre acotado al negocio. Reglas puras: gestion-core.ts.
// ============================================================================

import "server-only";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { enviarMailInterno } from "@/lib/notifications";
import { tenantTransaction } from "@/lib/rls";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import type { SessionUser } from "@/lib/session";
import type { Prisma } from "@/generated/prisma/client";
import { configProyectos } from "./datos.server";
import { venceDeLaCuota, ajustarAPagado, cambioDeVenta, COLUMNAS_OCULTAS_BASE, cuotaPrevista, rolDelActor, mailDeAviso, permisoDe, planDeCuotas, veTodosLosProyectos, type ItemFicha, type ModuloGestion, type RolGestion } from "./gestion-core";
import { tiposDeCambio } from "./cobranza.server";

export interface Actor {
  user: SessionUser;
  tenantId: string;
  personaId: string | null;
  nombre: string;
  rol: RolGestion;
  permisos: { rol: string; modulo: string; ver: boolean; editar: boolean; columnasOcultas: unknown }[];
}

/** El dueño entra sin que nadie lo cargue; cualquier otro usuario sin ficha no abre nada hasta que lo sumen al equipo. */
export async function actorActual(): Promise<Actor> {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const [persona, permisos] = await Promise.all([
    prisma.proyectoPersona.findFirst({ where: { tenantId, userId: user.id, activa: true }, select: { id: true, rol: true, nombre: true } }),
    prisma.proyectoPermiso.findMany({ where: { tenantId }, select: { rol: true, modulo: true, ver: true, editar: true, columnasOcultas: true } }),
  ]);
  const rol = rolDelActor(persona?.rol, user.role);
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

// Vive en cobranza.server.ts (sólo Prisma) para que datos.server.ts la use sin ciclo de imports.
export { tiposDeCambio };

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

/** Lee por fuera de la transacción: llamarla antes de abrirla. */
export async function usuariosDelEquipo(tenantId: string, proyectoId: string, salvo: string, db: Tx | typeof prisma = prisma): Promise<string[]> {
  const filas = await db.proyectoEquipo.findMany({ where: { tenantId, proyectoId }, select: { persona: { select: { userId: true } } } });
  return filas.map((f) => f.persona.userId).filter((u): u is string => !!u && u !== salvo);
}

/** Quien lleva la plata: Dirección, Administración y el dueño, estén o no en el equipo del proyecto. */
export async function usuariosDeLaPlata(db: Tx | typeof prisma, tenantId: string, salvo = ""): Promise<string[]> {
  const [personas, duenos] = await Promise.all([
    db.proyectoPersona.findMany({ where: { tenantId, activa: true, rol: { in: ["DIRECCION", "ADMINISTRACION"] }, userId: { not: null } }, select: { userId: true } }),
    db.user.findMany({ where: { tenantId, role: "OWNER", active: true, deletedAt: null }, select: { id: true } }),
  ]);
  return [...new Set([...personas.map((p) => p.userId!), ...duenos.map((d) => d.id)])].filter((u) => u !== salvo);
}

/** Quien aprueba precios: Dirección y el dueño. */
export async function usuariosDeDireccion(tenantId: string): Promise<string[]> {
  const [personas, duenos] = await Promise.all([
    prisma.proyectoPersona.findMany({ where: { tenantId, activa: true, rol: "DIRECCION", userId: { not: null } }, select: { userId: true } }),
    prisma.user.findMany({ where: { tenantId, role: "OWNER", active: true, deletedAt: null }, select: { id: true } }),
  ]);
  return [...new Set([...personas.map((p) => p.userId!), ...duenos.map((d) => d.id)])];
}

const FECHA_DEL_AVISO = (d: Date) => d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

/**
 * Cobros y pagos a 3 días, para quien lleva la plata. Las previstas no son plata todavía. Mira también la última semana:
 * si el proceso no corrió un día, igual avisa, y el mismo texto no se repite a la misma persona.
 */
async function avisarCuotas(db: Tx, tenantId: string, ahora: Date, origen?: string | null) {
  const cuotas = await db.proyectoCuota.findMany({
    where: { tenantId, prevista: false, pagadoEl: null, anuladoEl: null, venceEl: { gte: new Date(ahora.getTime() - 7 * 86_400_000), lte: new Date(ahora.getTime() + 3 * 86_400_000) } },
    orderBy: { venceEl: "asc" },
    take: 100,
    select: { tipo: true, concepto: true, venceEl: true, proyectoId: true, proyecto: { select: { nombre: true } } },
  });
  if (cuotas.length === 0) return;
  const destinatarios = await usuariosDeLaPlata(db, tenantId);
  for (const c of cuotas) {
    const texto = `${c.proyecto?.nombre ?? "Empresa"}: ${c.tipo === "COBRO" ? "cobro" : "pago"} «${c.concepto}» vence el ${FECHA_DEL_AVISO(c.venceEl)}`;
    const ya = await db.proyectoAviso.findMany({ where: { tenantId, tipo: "vencimiento", texto, destinatario: { in: destinatarios } }, select: { destinatario: true } });
    const avisados = new Set(ya.map((y) => y.destinatario));
    await avisar(db, { tenantId, destinatarios: destinatarios.filter((u) => !avisados.has(u)), tipo: "vencimiento", texto, enlace: c.proyectoId ? `/admin/proyectos/${c.proyectoId}?tab=finanzas` : "/admin/proyectos/administracion", origen });
  }
}

/** Lo que corre una vez por día desde el cron, parado en el negocio: `db` es su transacción. */
export async function avisarVencimientos(db: Tx, tenantId: string, origen: string | null) {
  await avisarDeadlines(tenantId, db, origen);
  await avisarCuotas(db, tenantId, new Date(), origen);
}

/**
 * «Deadlines próximos». Corre una vez por día desde el cron de recordatorios y además cuando alguien abre Inicio; el mismo texto no se repite
 * a la misma persona.
 */
export async function avisarDeadlines(tenantId: string, db: Tx | typeof prisma = prisma, origen?: string | null) {
  const ahora = new Date();
  const items = await db.proyectoItem.findMany({
    where: { tenantId, fechaLimite: { gte: ahora, lte: new Date(ahora.getTime() + 3 * 86_400_000) }, estadoItem: { not: "ENTREGADO" }, presupuesto: { proyecto: { perdidoEl: null } } },
    select: { descripcion: true, fechaLimite: true, presupuesto: { select: { id: true, proyectoId: true, proyecto: { select: { nombre: true, presupuestos: { orderBy: { version: "desc" }, take: 1, select: { id: true } } } } } } },
    take: 50,
  });
  for (const i of items) {
    const { proyectoId, proyecto } = i.presupuesto;
    // Sólo la última versión es la ficha viva: un ítem quitado o una fecha cambiada no avisan.
    if (proyecto.presupuestos[0]?.id !== i.presupuesto.id) continue;
    const texto = `${proyecto.nombre}: ${i.descripcion} vence el ${FECHA_DEL_AVISO(i.fechaLimite!)}`;
    const equipo = await usuariosDelEquipo(tenantId, proyectoId, "", db);
    const ya = await db.proyectoAviso.findMany({ where: { tenantId, tipo: "deadline", texto, destinatario: { in: equipo } }, select: { destinatario: true } });
    const avisados = new Set(ya.map((y) => y.destinatario));
    await avisar(db, { tenantId, destinatarios: equipo.filter((u) => !avisados.has(u)), tipo: "deadline", texto, enlace: `/admin/proyectos/${proyectoId}`, origen });
  }
}

export async function avisar(db: Tx | typeof prisma, d: { tenantId: string; destinatarios: readonly string[]; tipo: string; texto: string; enlace?: string; origen?: string | null }) {
  const unicos = [...new Set(d.destinatarios)].filter(Boolean);
  if (unicos.length === 0) return;
  const apagados = await db.proyectoAvisoPref.findMany({ where: { tenantId: d.tenantId, tipo: d.tipo, enSistema: false, userId: { in: unicos } }, select: { userId: true } });
  const callados = new Set(apagados.map((p) => p.userId));
  const datos = unicos.filter((u) => !callados.has(u)).map((destinatario) => ({ tenantId: d.tenantId, destinatario, tipo: d.tipo, texto: d.texto, enlace: d.enlace ?? null }));
  const creados = datos.length > 0 ? await db.proyectoAviso.createManyAndReturn({ data: datos, select: { id: true } }) : [];
  const porMail = await db.proyectoAvisoPref.findMany({ where: { tenantId: d.tenantId, tipo: d.tipo, porMail: true, userId: { in: unicos } }, select: { userId: true } });
  if (porMail.length > 0) await programarMails(d, porMail.map((p) => p.userId), creados.map((c) => c.id));
}

/**
 * Sale después de responder, para no alargar la transacción. Si los avisos no quedaron guardados es porque la transacción se
 * deshizo, y entonces no sale nada. El cron pasa `origen`: su pedido viene de otra dirección. Fuera de un pedido no hay mail: queda el
 * aviso en el sistema.
 */
async function programarMails(d: { tenantId: string; tipo: string; texto: string; enlace?: string; origen?: string | null }, para: string[], avisos: string[]) {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const origen = d.origen !== undefined ? d.origen : host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : null;
    after(async () => {
      try {
        const usuarios = await tenantTransaction(
          async (tx) => {
            if (avisos.length > 0 && (await tx.proyectoAviso.count({ where: { tenantId: d.tenantId, id: { in: avisos } } })) === 0) return [];
            return tx.user.findMany({ where: { tenantId: d.tenantId, id: { in: para } }, select: { email: true } });
          },
          { tenantId: d.tenantId },
        );
        const mail = mailDeAviso({ ...d, origen });
        await Promise.all(usuarios.filter((u) => u.email).map((u) => enviarMailInterno({ tenantId: d.tenantId, para: u.email, ...mail })));
      } catch {
        console.error("[proyectos/avisos] no se pudo mandar el mail");
      }
    });
  } catch {
    // Sin pedido en curso: alcanza con el aviso en el sistema.
  }
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
 * la ficha se anula, sin borrarlo. Antes de confirmado, o sin fecha, las cuotas quedan como previstas.
 */
/** Un dato de la empresa cambió: se ponen al día las cuotas de los proyectos abiertos que dependen de él. Lo pagado no se toca. */
export async function regenerarCuotasDe(tenantId: string, cuales: Prisma.ProyectoWhereInput): Promise<void> {
  const abiertos = await prisma.proyecto.findMany({ where: { ...cuales, tenantId, perdidoEl: null, etapa: { not: "CIERRE" } }, select: { id: true }, take: 300 });
  for (const p of abiertos) await regenerarCuotas(tenantId, p.id);
}

export async function regenerarCuotas(tenantId: string, proyectoId: string): Promise<void> {
  const [p, viva, config, tc] = await Promise.all([
    prisma.proyecto.findFirst({ where: { id: proyectoId, tenantId }, select: { id: true, nombre: true, moneda: true, etapa: true, fechaEvento: true, createdAt: true, anticipoClientePct: true, perdidoEl: true } }),
    versionViva(tenantId, proyectoId),
    configProyectos(tenantId),
    tiposDeCambio(tenantId),
  ]);
  if (!p || !viva) return;
  const items = viva.items.map(aItemFicha);
  const proveedores = [...new Set(items.map((i) => i.supplierId).filter((s): s is string => !!s))];
  const fichas = await prisma.proyectoProveedorFicha.findMany({ where: { tenantId, supplierId: { in: proveedores } }, select: { supplierId: true, anticipoPct: true } });
  const planDeLaFicha =
    !p.perdidoEl
      ? planDeCuotas(items, {
          proyectoId,
          nombre: p.nombre,
          fechaEvento: p.fechaEvento,
          creado: p.createdAt,
          anticipoClientePct: p.anticipoClientePct,
          ivaPct: viva.ivaPct,
          recargoGeneral: config.margenPct,
          tiposDeCambio: tc,
          monedaVenta: p.moneda,
          cambioVenta: cambioDeVenta(p.moneda, viva.tcVenta, tc),
          anticipoProveedor: Object.fromEntries(fichas.map((f) => [f.supplierId, f.anticipoPct])),
        })
      : [];
  const prevista = cuotaPrevista(p.etapa, p.fechaEvento);
  // Si una cuota se marca mientras se ajusta el plan, no se le pisa nada y el plan se vuelve a calcular con ella.
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    if (!(await aplicarPlan(tenantId, proyectoId, planDeLaFicha, prevista))) return;
  }
  logger.warn("proyectos", "el plan de cobros no cerró: se marcaron cuotas mientras se ajustaba", { tenantId, proyectoId });
}

/**
 * Una pasada de `regenerarCuotas`: lee las cuotas, ajusta el plan a lo marcado y lo escribe.
 * Devuelve `true` si una cuota se marcó mientras tanto (el plan quedó calculado con lo viejo).
 */
async function aplicarPlan(tenantId: string, proyectoId: string, planDeLaFicha: ReturnType<typeof planDeCuotas>, prevista: boolean): Promise<boolean> {
  const actuales = await prisma.proyectoCuota.findMany({ where: { tenantId, proyectoId, auto: true }, select: { id: true, clave: true, monto: true, pagadoEl: true, anuladoEl: true, venceEl: true, venceManual: true, prevista: true } });
  const plan = ajustarAPagado(planDeLaFicha, actuales.filter((c) => c.pagadoEl && !c.anuladoEl).map((c) => ({ clave: c.clave ?? "", monto: c.monto })));
  const porClave = new Map(actuales.map((c) => [c.clave, c]));
  const vigentes = new Set(plan.map((c) => c.clave));
  const hoy = new Date();
  let choco = false;
  for (const c of plan) {
    const previa = porClave.get(c.clave);
    if (previa?.pagadoEl) continue;
    const datos = { prevista, tipo: c.tipo, concepto: c.concepto, monto: c.monto, moneda: c.moneda, venceEl: venceDeLaCuota({ clave: c.clave, plan: c.venceEl, prevista, hoy, previa }), supplierId: c.supplierId, anuladoEl: null };
    // Sólo si sigue sin marcar: una cuota marcada mientras se ajustaba queda congelada (no se le pisa monto ni `prevista`)
    // y el plan se vuelve a calcular con ella. (El candado de la factura de cuota es de la Etapa 2 · T2.)
    if (previa) {
      const r = await prisma.proyectoCuota.updateMany({ where: { id: previa.id, tenantId, pagadoEl: null }, data: datos });
      choco = r.count === 0 || choco;
    } else await prisma.proyectoCuota.create({ data: { ...datos, tenantId, proyectoId, auto: true, clave: c.clave } });
  }
  const sobran = actuales.filter((c) => c.clave && !vigentes.has(c.clave) && !c.pagadoEl && !c.anuladoEl).map((c) => c.id);
  if (sobran.length > 0) {
    const r = await prisma.proyectoCuota.updateMany({ where: { tenantId, id: { in: sobran }, pagadoEl: null, anuladoEl: null }, data: { anuladoEl: new Date() } });
    // Si una de las que sobran se marcó en el medio, el plan se calculó sin descontarla: otra pasada.
    choco = r.count < sobran.length || choco;
  }
  return choco;
}
