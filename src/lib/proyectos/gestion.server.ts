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
import { requireCapability, requireCapabilityFueraDeLaAgenda } from "@/lib/authz";
import { basePrisma } from "@/lib/prisma-base";
import { esNegocioArm } from "@/lib/crm-comercial/arm";
import { roleHasCapability } from "@/lib/capabilities";
import type { SessionUser } from "@/lib/session";
import type { Prisma } from "@/generated/prisma/client";
import { configProyectos, veLaPlata } from "./datos.server";
import { getCurrentUser } from "@/lib/session";
import { venceDeLaCuota, previstaDeLaCuota, ajustarAPagado, cambioDeVenta, COLUMNAS_OCULTAS_BASE, cuotaPrevista, rolDelActor, mailDeAviso, permisoDe, planDeCuotas, cerradoEnProyectoAjeno, veLaPlataDelProyecto, veLaVenta, veTodosLosProyectos, type ItemFicha, type ModuloGestion, type RolGestion } from "./gestion-core";
import { tiposDeCambio, trabarCobranza } from "./cobranza.server";
import { tomarCuotas } from "./comprobantes.server";
import { cubiertasPorSusPartes, descontarPartes, partesEnMonedaDelPlan, SALDADA_CON_PARTES } from "./pago-parcial-core";
import { adicionalesDelProyecto, detallesDeLineas, diasDelPlan } from "./presupuesto-m2.server";
import { cuotasDeAdicionales } from "./presupuesto-core";
import { pagosParcialesDeCuotas } from "./pago-parcial.server";
import { totalAMano, totalesCongelados } from "./precio-foto.server";
import { planQueSigue } from "./ficha-core";

export interface Actor {
  user: SessionUser;
  tenantId: string;
  personaId: string | null;
  nombre: string;
  rol: RolGestion;
  permisos: { rol: string; modulo: string; ver: boolean; editar: boolean; columnasOcultas: unknown }[];
  /** MIA-238/239 · el actor en un proyecto que no es de su cartera (`actorDelProyecto`): sin ningún importe ni cotizaciones. */
  ajeno?: boolean;
}

/** El dueño entra sin que nadie lo cargue; cualquier otro usuario sin ficha no abre nada hasta que lo sumen al equipo. */
export async function actorActual(): Promise<Actor> {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  // GSG-CRM-017 (V1): el ARM tiene sólo el CRM. Proyectos (y sus consultas, cuotas, pagos) no corre ahí: el proyecto
  // nace en el negocio vinculado (`PROYECTOS_NO_EN_ARM`, arm.ts). Se corta acá, que es por donde pasan todas las pantallas y acciones de Proyectos.
  const negocio = await basePrisma.tenant.findUnique({ where: { id: tenantId }, select: { blueprintId: true } });
  // `redirect` corta igual una pantalla y una acción (no se escribe nada) y lleva al CRM.
  if (esNegocioArm(negocio?.blueprintId)) redirect("/admin/crm");
  const [persona, permisos] = await Promise.all([
    prisma.proyectoPersona.findFirst({ where: { tenantId, userId: user.id, activa: true }, select: { id: true, rol: true, nombre: true } }),
    prisma.proyectoPermiso.findMany({ where: { tenantId }, select: { rol: true, modulo: true, ver: true, editar: true, columnasOcultas: true } }),
  ]);
  // MIA-238: una OWNER sin ficha activa es la Dueña sólo si no tiene una ficha de otro puesto de baja.
  const deBaja = !persona && user.role === "OWNER"
    ? await prisma.proyectoPersona.findFirst({ where: { tenantId, userId: user.id, activa: false, rol: { not: "DIRECCION" } }, select: { rol: true } })
    : null;
  const rol = rolDelActor(persona?.rol, user.role, deBaja?.rol);
  return { user, tenantId, personaId: persona?.id ?? null, nombre: persona?.nombre ?? user.name, rol, permisos };
}

export function puede(a: Actor, modulo: ModuloGestion, accion: "ver" | "editar"): boolean {
  if (a.ajeno && cerradoEnProyectoAjeno(modulo, accion)) return false;
  return permisoDe(a.rol, modulo, a.permisos)[accion];
}

/**
 * MIA-238 · el actor dentro de UN proyecto: el productor comercial ve la plata (cobros y costos) sólo de los proyectos de su
 * equipo (`veLaPlataDelProyecto`). Toda pantalla o acción de un proyecto que muestre costos o cobros pasa por acá.
 */
export async function actorDelProyecto(a: Actor, proyectoId: string): Promise<Actor> {
  if (a.rol !== "COMERCIAL") return a;
  const enEquipo = !!a.personaId && !!(await prisma.proyectoEquipo.findFirst({ where: { tenantId: a.tenantId, proyectoId, personaId: a.personaId }, select: { id: true } }));
  return veLaPlataDelProyecto(a.rol, enEquipo) ? a : { ...a, ajeno: true };
}

/**
 * MIA-239 · el filtro de los proyectos cuya plata ve esta persona: el de `filtroDeProyectos`, y para el productor comercial
 * sólo los de su equipo (el mismo control que `actorDelProyecto`, como filtro de Prisma para listas y sumas).
 */
export function filtroDeProyectosConPlata(a: Actor): Prisma.ProyectoWhereInput {
  const visibles = filtroDeProyectos(a);
  if (veLaPlataDelProyecto(a.rol, false)) return visibles;
  // MIA-244: un puesto sin importes no ve la plata de ningún proyecto, tampoco de su equipo (`id` lo pisa quien llama: va en AND).
  if (!veLaPlataDelProyecto(a.rol, true)) return { ...visibles, AND: [{ id: { in: [] } }] };
  return { ...visibles, equipo: { some: { personaId: a.personaId ?? "-" } } };
}

/** MIA-246 · el de `filtroDeProyectosConPlata`, y nada para quien no ve la venta (Producción): el papel y los exportes la llevan. */
export function filtroDeProyectosConVenta(a: Actor): Prisma.ProyectoWhereInput {
  const conPlata = filtroDeProyectosConPlata(a);
  return veLaVenta(a.rol) ? conPlata : { ...conPlata, AND: [{ id: { in: [] } }] };
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

/**
 * Rentabilidad, Proveedores con gastos y Configuración de propuestas (PRY-099 y ADM-140): decide el rol de gestión, no la
 * capability del ERP. Las ve Dirección y a quien Dirección le abra el módulo `direccion` («ver» para leer, «editar» para
 * guardar). El techo del ERP sigue: sin `agenda:manage` fuera de la agenda, no entra aunque tenga el módulo. Para pantallas
 * y acciones: sin permiso, de vuelta a Inicio. Pregunta 2-A del plan GSG-MIA-088, confirmada por el dueño el 18/11.
 */
export async function exigirPlataDeDireccion(accion: "ver" | "editar"): Promise<Actor> {
  await requireCapabilityFueraDeLaAgenda("agenda:manage");
  const a = await actorActual();
  if (!puede(a, "direccion", accion)) redirect("/admin/proyectos/inicio");
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

const CON_ITEMS = { items: { orderBy: { posicion: "asc" }, include: { supplier: { select: { id: true, name: true } } } } } as const;

/** La última versión del presupuesto es la ficha viva: de ahí salen la planilla que se edita y los deadlines. */
export async function versionViva(tenantId: string, proyectoId: string, db: Prisma.TransactionClient = prisma) {
  return db.proyectoPresupuesto.findFirst({ where: { tenantId, proyectoId }, orderBy: { version: "desc" }, include: CON_ITEMS });
}

/**
 * La versión de la que sale la PLATA (cuotas, tope y cabecera): la última aprobada. Un borrador abierto encima no mueve
 * ninguna cuota hasta que se aprueba (P-06, MIA-049 hallazgo 2). Sin ninguna aprobada, la viva: el plan queda previsto
 * como siempre (`cuotaPrevista`). El índice que garantiza una sola base aprobada llega con O10 (T06).
 */
export async function versionDeLaPlata(tenantId: string, proyectoId: string, db: Prisma.TransactionClient = prisma) {
  const aprobada = await db.proyectoPresupuesto.findFirst({ where: { tenantId, proyectoId, estado: "APROBADO" }, orderBy: { version: "desc" }, include: CON_ITEMS });
  return aprobada ?? versionViva(tenantId, proyectoId, db);
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
  // En fila con los otros ajustes del plan del mismo proyecto y con la cobranza (la misma clave que `trabarCobranza`:
  // «Marcar cobrado», cobros, cuotas a mano). La ficha se lee y el plan se calcula ADENTRO del candado: el último en
  // entrar calcula con la ficha vigente y nadie revive una cuota que la ficha nueva ya no tiene. Ningún llamador lo
  // invoca con el candado tomado en otra transacción (todos después de cerrar la suya), así que no se espera a sí mismo.
  const pagos = await rehaceLosPagos();
  const cerro = await tenantTransaction((tx) => regenerarCuotasTx(tx, tenantId, proyectoId, pagos), { tenantId, timeoutMs: 15_000 });
  if (!cerro) logger.warn("proyectos", "el plan de cobros no cerró: se marcaron cuotas mientras se ajustaba", { tenantId, proyectoId });
}

/**
 * `regenerarCuotas` adentro de una transacción ya abierta (toma el candado de la cobranza): así un cambio de etapa y sus
 * cuotas van juntos o no va ninguno (MIA-089 · V1). Devuelve `false` si el plan no cerró en tres vueltas. `pagos`: lo que
 * decidió `rehaceLosPagos` antes de abrir la transacción (MIA-243 · 2A).
 */
export async function regenerarCuotasTx(tx: Prisma.TransactionClient, tenantId: string, proyectoId: string, pagos: boolean): Promise<boolean> {
  await trabarCobranza(tx, tenantId, proyectoId);
  const vigente = await planVigente(tx, tenantId, proyectoId);
  if (!vigente) return true;
  // `aplicarPlan` toma además el candado de cada cuota que puede escribir (`tomarCuotas`). Si igual una se marcó en
  // el medio (un camino que no lo tome), no se le pisa nada y el plan se vuelve a ajustar con ella.
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    if (!(await aplicarPlan(tx, tenantId, proyectoId, vigente.plan, vigente.prevista, vigente.tc, pagos))) return true;
  }
  return false;
}

/**
 * MIA-243 · 2A del dueño (20/11): «las cuotas a proveedores sólo las rehace alguien con permiso de plata. Quien arma
 * presupuestos sin ese permiso puede guardar la línea, pero no toca los pagos». Se decide ACÁ, una vez por regeneración, para
 * todos los llamadores (ficha, presupuesto, despiece, etapas, precio, la aprobación del link): con un usuario que no ve la
 * plata (`veLaPlata`), o en un pedido sin usuario (el cliente en su link), se rehacen sólo los cobros; los pagos quedan como
 * estaban y quien ve la plata los ve «por revisar» (`pagosPorRevisar`). Fuera de un pedido (un script, un test del motor) no
 * hay actor: el plan entero, como siempre. Se llama ANTES de abrir la transacción: adentro de una la sesión no se lee (da
 * «sin usuario»), por eso `regenerarCuotasTx` recibe la decisión tomada.
 */
export async function rehaceLosPagos(): Promise<boolean> {
  try {
    await headers();
  } catch {
    return true;
  }
  const user = await getCurrentUser();
  return !!user && (await veLaPlata(user));
}

/** El plan que pide hoy la versión de la plata, sin escribir nada. `null`: no hay proyecto o no hay versión. */
async function planVigente(tx: Prisma.TransactionClient, tenantId: string, proyectoId: string) {
      const [p, viva, config, tc] = await Promise.all([
        tx.proyecto.findFirst({ where: { id: proyectoId, tenantId }, select: { id: true, nombre: true, moneda: true, etapa: true, fechaEvento: true, createdAt: true, anticipoClientePct: true, perdidoEl: true, motivoPerdida: true } }),
        versionDeLaPlata(tenantId, proyectoId, tx),
        configProyectos(tenantId, tx),
        tiposDeCambio(tenantId, tx),
      ]);
      if (!p || !viva) return null;
      const items = viva.items.map(aItemFicha);
      // MIA T06: el % de cada línea, los adicionales aprobados (sin M2, ninguno) y los días del catálogo (R8).
      const [detalles, adicionales, dias, congelados] = await Promise.all([
        detallesDeLineas(tx, tenantId, items.map((i) => i.id)),
        adicionalesDelProyecto(tx, tenantId, proyectoId),
        diasDelPlan(tenantId),
        // MIA T07 · O16: aprobada con foto, el cobro del cliente sale del total congelado. MIA-199: antes de aprobar, del
        // total escrito a mano (precio por total), si lo hay; si no, de la suma de renglones.
        viva.estado === "APROBADO" ? totalesCongelados(tx, tenantId, [viva.id]) : p?.moneda === "ARS" ? totalAMano(tx, tenantId, proyectoId, viva.id) : new Map<string, number>(),
      ]);
      const proveedores = [...new Set([...items.map((i) => i.supplierId), ...adicionales.flatMap((a) => a.lineas.map((l) => l.supplierId))].filter((s): s is string => !!s))];
      const fichas = await tx.proyectoProveedorFicha.findMany({ where: { tenantId, supplierId: { in: proveedores } }, select: { supplierId: true, anticipoPct: true } });
      const anticipoProveedor = Object.fromEntries(fichas.map((f) => [f.supplierId, f.anticipoPct]));
      const anticipoLinea = Object.fromEntries([...detalles].filter(([, d]) => d.anticipoPct != null).map(([id, d]) => [id, d.anticipoPct!]));
      // MIA-224 · D2: un perdido conserva sus cuotas al proveedor (siguen en «A pagar» y se pagan sin reabrir); las del
      // cliente se anulan. Cancelado, ninguna (`planQueSigue`).
      const planDeLaFicha = planQueSigue(
        [...planDeCuotas(items, {
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
          anticipoProveedor,
          anticipoLinea,
          dias,
          ventaCongelada: congelados.get(viva.id) ?? null,
        }), ...cuotasDeAdicionales(adicionales, { proyectoId, nombre: p.nombre, fechaEvento: p.fechaEvento, creado: p.createdAt, anticipoClientePct: p.anticipoClientePct, dias, anticipoProveedor })],
        p,
      );
      return { plan: planDeLaFicha, prevista: cuotaPrevista(p.etapa, p.fechaEvento), tc };
}

/**
 * MIA-243 · 2A: cuántas cuotas automáticas de PAGO no están como las pide hoy la versión de la plata (una regeneración de
 * alguien sin la plata las dejó como estaban, o falta crearlas o anularlas). Calculado con el mismo ajuste que las escribe
 * (`ajusteDelPlan`), sin columna nueva ni candado: es una lectura. La ficha se lo muestra a quien ve la plata, con el botón
 * que las rehace (`recalcularCuotas`).
 */
export async function pagosPorRevisar(tenantId: string, proyectoId: string): Promise<number> {
  return tenantTransaction(async (tx) => {
    const vigente = await planVigente(tx, tenantId, proyectoId);
    if (!vigente) return 0;
    const { escrituras, sobran } = await ajusteDelPlan(tx, tenantId, proyectoId, vigente.plan, vigente.prevista, vigente.tc);
    const distinta = ({ previa, datos, saldada }: (typeof escrituras)[number]) =>
      !previa || !!previa.anuladoEl || saldada || previa.tipo !== datos.tipo || previa.monto !== datos.monto || previa.moneda !== datos.moneda ||
      previa.concepto !== datos.concepto || previa.supplierId !== datos.supplierId || previa.prevista !== datos.prevista || previa.venceEl.getTime() !== datos.venceEl.getTime();
    return escrituras.filter((e) => e.datos.tipo !== "COBRO" && distinta(e)).length + sobran.filter((c) => c.tipo !== "COBRO").length;
  }, { tenantId });
}

/** Las cuotas (de estas) atadas a un comprobante o a una orden de pago viva. Sin M1, ninguna: `to_regclass` no aborta la transacción (Gate 2). */
async function cuotasEnlazadas(tx: Prisma.TransactionClient, tenantId: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const hay = await tx.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('"ProyectoCuotaComprobante"') IS NOT NULL AS ok`;
  if (!hay[0]?.ok) return new Set();
  const filas = await tx.proyectoCuotaComprobante.findMany({ where: { tenantId, cuotaId: { in: [...ids] } }, select: { cuotaId: true } });
  // MIA-216 · C2: también las que tiene una orden de pago viva (aunque se hayan desenlazado en una carrera): anularla
  // dejaba que la orden la pagara anulada.
  const enOrden = await tx.proyectoOrdenPagoLinea.findMany({ where: { tenantId, cuotaId: { in: [...ids] }, orden: { estado: { not: "ANULADA" } } }, select: { cuotaId: true } });
  return new Set([...filas.map((f) => f.cuotaId), ...enOrden.flatMap((f) => (f.cuotaId ? [f.cuotaId] : []))]);
}

/**
 * Una pasada de `regenerarCuotas`: lee las cuotas, ajusta el plan a lo marcado y lo escribe.
 * Devuelve `true` si una cuota se marcó mientras tanto (el plan quedó calculado con lo viejo).
 */
async function aplicarPlan(tx: Prisma.TransactionClient, tenantId: string, proyectoId: string, planDeLaFicha: ReturnType<typeof planDeCuotas>, prevista: boolean, tc: Readonly<Record<string, number>>, pagos: boolean): Promise<boolean> {
  // MIA-219 (P1): el candado de la cuota (`tomarCuotas`: el de enlazar, pagar y armar la orden) ANTES de leer las cuotas y sus
  // enlaces. Sin él, una cuota que sobra se enlazaba y entraba en una orden entre la lectura y la anulación, y quedaba anulada
  // dentro de una orden viva (la orden ya no se podía pagar); y a una que se enlazaba en el medio se le pisaba el monto. Se
  // traban las que el ajuste puede escribir (las automáticas sin pagar), por id, después del candado de la cobranza: el
  // mismo orden que todos los caminos (cobranza → comprobante → cuota). Las automáticas sólo las crea este ajuste, que va
  // en fila por el candado de la cobranza: ninguna aparece entre esta lectura y el candado.
  const sinPagar = await tx.proyectoCuota.findMany({ where: { tenantId, proyectoId, auto: true, pagadoEl: null }, select: { id: true } });
  await tomarCuotas(tx, tenantId, sinPagar.map((c) => c.id));
  const { escrituras, sobran } = await ajusteDelPlan(tx, tenantId, proyectoId, planDeLaFicha, prevista, tc);
  // MIA-243 · 2A: sin la plata (`rehaceLosPagos`), ninguna cuota de PAGO se crea, se cambia ni se anula: quedan como estaban.
  const toca = (tipo: string) => pagos || tipo === "COBRO";
  let choco = false;
  for (const { previa, clave, concepto, datos, saldada } of escrituras) {
    if (!toca(datos.tipo) || (previa && !toca(previa.tipo))) continue;
    // Sólo si sigue sin marcar: una cuota marcada mientras se ajustaba queda congelada (no se le pisa monto ni `prevista`)
    // y el plan se vuelve a calcular con ella. (El candado de la factura de cuota es de la Etapa 2 · T2.)
    if (previa) {
      const r = await tx.proyectoCuota.updateMany({ where: { id: previa.id, tenantId, pagadoEl: null }, data: datos });
      choco = r.count === 0 || choco;
      if (saldada && r.count > 0) await registrarCambio(tx, { tenantId, proyectoId, entidad: "ProyectoCuota", entidadId: previa.id, campo: `Pagado · ${concepto}`, antes: "Pendiente", despues: SALDADA_CON_PARTES, autor: "Sistema" });
    } else await tx.proyectoCuota.create({ data: { ...datos, tenantId, proyectoId, auto: true, clave } });
  }
  const anular = sobran.filter((c) => toca(c.tipo)).map((c) => c.id);
  if (anular.length > 0) {
    const r = await tx.proyectoCuota.updateMany({ where: { tenantId, id: { in: anular }, pagadoEl: null, anuladoEl: null }, data: { anuladoEl: new Date() } });
    // Si una de las que sobran se marcó en el medio, el plan se calculó sin descontarla: otra pasada.
    choco = r.count < anular.length || choco;
  }
  return choco;
}

/** Lo que el plan de la ficha le haría a las cuotas automáticas, sin escribir: lo escriben `aplicarPlan` y lo cuenta `pagosPorRevisar`. */
async function ajusteDelPlan(tx: Prisma.TransactionClient, tenantId: string, proyectoId: string, planDeLaFicha: ReturnType<typeof planDeCuotas>, prevista: boolean, tc: Readonly<Record<string, number>>) {
  const actuales = await tx.proyectoCuota.findMany({ where: { tenantId, proyectoId, auto: true }, select: { id: true, clave: true, tipo: true, moneda: true, monto: true, pagadoEl: true, anuladoEl: true, venceEl: true, venceManual: true, prevista: true, concepto: true, supplierId: true } });
  const marcadas = actuales.filter((c) => c.pagadoEl && !c.anuladoEl);
  // MIA T07 (obs. de T05 sobre esta función): una cuota impaga ENLAZADA a un comprobante (M1) queda fija como lo pagado. Si el
  // plan le cambiara el monto, las enlazadas pasarían el total del comprobante (la invariante de `enlazarCuota`); si la anulara,
  // la factura quedaría atada a nada. La diferencia va a las otras cuotas del ítem (`ajustarAPagado`).
  const enlazadas = await cuotasEnlazadas(tx, tenantId, actuales.filter((c) => !c.pagadoEl && !c.anuladoEl).map((c) => c.id));
  const fijas = actuales.filter((c) => !c.anuladoEl && (c.pagadoEl || enlazadas.has(c.id)));
  // Lo pagado en parte (pago a proveedor) también es pagado: el plan nuevo no se lo vuelve a pedir (también si la cuota se va).
  const partes = await pagosParcialesDeCuotas(tenantId, actuales, tc, tx, true);
  const ajustado = ajustarAPagado(planDeLaFicha, fijas.map((c) => ({ clave: c.clave ?? "", monto: c.monto })));
  // En la moneda que el plan nuevo le da a cada ítem (el ítem pudo cambiar de pesos a dólares o al revés).
  const partesDelPlan = partesEnMonedaDelPlan(actuales, partes, ajustado, tc);
  const plan = descontarPartes(ajustado, partesDelPlan, new Set(marcadas.map((c) => c.clave ?? "")));
  // La que sus partes ya cubren (bajó el anticipo después de pagar una parte) queda saldada: no «Falta $ 0» sin salida.
  // No asienta nada: lo pagado ya está en sus partes; anular una parte la reabre (`reabrirCuotaTx`).
  const cubiertas = cubiertasPorSusPartes(plan, partesDelPlan);
  const porClave = new Map(actuales.map((c) => [c.clave, c]));
  const vigentes = new Set(plan.map((c) => c.clave));
  const hoy = new Date();
  const escrituras = plan.flatMap((c) => {
    const previa = porClave.get(c.clave);
    if (previa?.pagadoEl || (previa && enlazadas.has(previa.id))) return [];
    const saldada = cubiertas.has(c.clave) && !!previa;
    // Una cuota que ya fue firme no vuelve a ser previsión (MIA-089 · V1): ir y volver de etapa no le toca nada.
    const laPrevista = previstaDeLaCuota(prevista, previa);
    const datos = {
      prevista: laPrevista,
      tipo: c.tipo,
      concepto: c.concepto,
      monto: c.monto,
      moneda: c.moneda,
      venceEl: venceDeLaCuota({ clave: c.clave, plan: c.venceEl, prevista, hoy, previa }),
      supplierId: c.supplierId,
      anuladoEl: null,
      ...(saldada && { pagadoEl: hoy, pagadoPor: SALDADA_CON_PARTES }),
    };
    return [{ previa, clave: c.clave, concepto: c.concepto, datos, saldada }];
  });
  const sobran = actuales.filter((c) => c.clave && !vigentes.has(c.clave) && !c.pagadoEl && !c.anuladoEl && !enlazadas.has(c.id)).map((c) => ({ id: c.id, tipo: c.tipo }));
  return { escrituras, sobran };
}
