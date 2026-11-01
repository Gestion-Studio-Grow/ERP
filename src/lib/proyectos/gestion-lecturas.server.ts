// ============================================================================
// GESTIÓN DE EVENTOS — lecturas de Inicio, Calendario, Proveedores, Equipo, Avisos, Buscar y Portal. Siempre acotadas al
// negocio y a lo que la persona puede ver. Las escrituras: acciones-gestion.ts. Reglas puras: gestion-lecturas-core.ts.
// ============================================================================

import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { roleHasCapability } from "@/lib/capabilities";
import type { Prisma } from "@/generated/prisma/client";
import { datosDelNegocio } from "./datos.server";
import { leerRef } from "./diseno-core";
import { aPesos, generaCuotas } from "./gestion-core";
import { filtroDeProyectos, puede, tiposDeCambio, type Actor } from "./gestion.server";
import { claveDia, diasDelRango, enlaceSeguro, laminasPublicas, mediodia, paginacion, tokenDeCalendario, usuarioDelToken, versionesVivas, type EntradaCalendario, type TipoCalendario } from "./gestion-lecturas-core";
import { redondear } from "./core";
import type { ModuloGestion, RolGestion } from "./gestion-core";

const DIA = 86_400_000;

const tareaAbierta = { hechaEl: null, estado: { not: "APROBADA" } } satisfies Prisma.ProyectoTareaWhereInput;
const proyectoActivo = { perdidoEl: null, etapa: { not: "CIERRE" } } satisfies Prisma.ProyectoWhereInput;

// ── Calendario ──────────────────────────────────────────────────────────────

/** Los proyectos donde la persona trabaja: en el equipo o como responsable. Es lo que significa «Sólo lo mío». */
async function idsDeMisProyectos(a: Actor): Promise<Set<string>> {
  const [equipo, responsable] = await Promise.all([
    a.personaId ? prisma.proyectoEquipo.findMany({ where: { tenantId: a.tenantId, personaId: a.personaId }, select: { proyectoId: true } }) : [],
    prisma.proyecto.findMany({ where: { tenantId: a.tenantId, responsable: a.nombre }, select: { id: true }, take: 500 }),
  ]);
  return new Set([...equipo.map((e) => e.proyectoId), ...responsable.map((p) => p.id)]);
}

/**
 * Todo lo que tiene fecha entre `desde` y `hasta`, según lo que la persona puede ver. Los pagos y cobros sólo se consultan
 * con permiso `pagos`: sin él, no salen de la base. Lo ya hecho (ítem entregado, tarea cerrada, cuota pagada) no se muestra.
 */
export async function entradasCalendario(a: Actor, desde: Date, hasta: Date, soloMias: boolean): Promise<EntradaCalendario[]> {
  const { tenantId } = a;
  const visibles = filtroDeProyectos(a);
  const rango = { gte: desde, lte: hasta };
  const verPagos = puede(a, "pagos", "ver");
  const verEmpresa = puede(a, "empresa", "ver");
  const verFicha = puede(a, "ficha", "ver");
  const verDiseno = puede(a, "diseno", "ver");

  const [proyectos, reuniones, tareas, checklist, cuotas, items, mios] = await Promise.all([
    prisma.proyecto.findMany({
      where: { ...visibles, perdidoEl: null, OR: [{ fechaEvento: rango }, { fechaFin: rango }, { fechaArmado: rango }, { fechaDesarme: rango }, { fechaEvento: { lte: hasta }, fechaFin: { gte: desde } }] },
      select: { id: true, nombre: true, etapa: true, fechaEvento: true, fechaFin: true, fechaArmado: true, fechaDesarme: true },
      take: 500,
    }),
    prisma.proyectoReunion.findMany({
      where: { tenantId, fecha: rango, OR: [{ proyectoId: null }, { proyecto: visibles }] },
      select: { id: true, titulo: true, tipo: true, fecha: true, lugar: true, creadaPor: true, proyectoId: true, proyecto: { select: { nombre: true } } },
      take: 500,
    }),
    prisma.proyectoTarea.findMany({
      where: { tenantId, venceEl: rango, ...tareaAbierta, proyecto: visibles },
      select: { id: true, titulo: true, venceEl: true, area: true, personaId: true, responsable: true, proyectoId: true, proyecto: { select: { nombre: true } } },
      take: 500,
    }),
    prisma.proyectoChecklist.findMany({
      where: { tenantId, fecha: rango, hechoEl: null, proyecto: visibles },
      select: { id: true, texto: true, fecha: true, proyectoId: true, proyecto: { select: { nombre: true } } },
      take: 500,
    }),
    verPagos
      ? prisma.proyectoCuota.findMany({
          where: { tenantId, venceEl: rango, pagadoEl: null, anuladoEl: null, OR: [{ proyecto: visibles }, ...(verEmpresa ? [{ proyectoId: null }] : [])] },
          select: { id: true, tipo: true, concepto: true, monto: true, moneda: true, venceEl: true, proyectoId: true, proyecto: { select: { nombre: true } } },
          take: 800,
        })
      : [],
    verFicha
      ? prisma.proyectoItem.findMany({
          where: { tenantId, fechaLimite: rango, estadoItem: { not: "ENTREGADO" }, presupuesto: { proyecto: { ...visibles, perdidoEl: null } } },
          select: { id: true, descripcion: true, fechaLimite: true, presupuesto: { select: { version: true, proyectoId: true, proyecto: { select: { nombre: true } } } } },
          take: 800,
        })
      : [],
    soloMias ? idsDeMisProyectos(a) : new Set<string>(),
  ]);

  // Sólo la ficha viva: una versión vieja repetiría las mismas fechas.
  const versiones = items.length
    ? versionesVivas(await prisma.proyectoPresupuesto.findMany({ where: { tenantId, proyectoId: { in: [...new Set(items.map((i) => i.presupuesto.proyectoId))] } }, select: { proyectoId: true, version: true } }))
    : new Map<string, number>();

  const salida: EntradaCalendario[] = [];
  const sumar = (id: string, tipo: TipoCalendario, titulo: string, fecha: Date, proyectoId: string | null, proyecto: string | null, extra?: Partial<EntradaCalendario>) =>
    salida.push({ id, tipo, titulo, fecha, conHora: false, proyectoId, proyecto, monto: null, moneda: null, ...extra });
  const dentro = (d: Date) => d.getTime() >= desde.getTime() && d.getTime() <= hasta.getTime();
  const esMio = (proyectoId: string | null) => !soloMias || (!!proyectoId && mios.has(proyectoId));

  for (const p of proyectos) {
    if (!esMio(p.id)) continue;
    if (p.fechaEvento) {
      const tipo: TipoCalendario = generaCuotas(p.etapa) ? "EVENTO" : "EVENTO_TENTATIVO";
      diasDelRango(p.fechaEvento, p.fechaFin).forEach((clave, i) => {
        const fecha = i === 0 ? p.fechaEvento! : mediodia(clave);
        if (dentro(fecha)) sumar(`evento-${p.id}-${clave}`, tipo, p.nombre, fecha, p.id, p.nombre);
      });
    }
    if (p.fechaArmado && dentro(p.fechaArmado)) sumar(`armado-${p.id}`, "MONTAJE", `Armado: ${p.nombre}`, p.fechaArmado, p.id, p.nombre);
    if (p.fechaDesarme && dentro(p.fechaDesarme)) sumar(`desarme-${p.id}`, "MONTAJE", `Desarme: ${p.nombre}`, p.fechaDesarme, p.id, p.nombre);
  }
  for (const r of reuniones) {
    if (soloMias && r.creadaPor !== a.nombre && !(r.proyectoId && mios.has(r.proyectoId))) continue;
    const tipo = (["REUNION", "MONTAJE", "EVENTO_TENTATIVO"] as const).find((t) => t === r.tipo) ?? "REUNION";
    sumar(`reunion-${r.id}`, tipo, r.lugar ? `${r.titulo} (${r.lugar})` : r.titulo, r.fecha, r.proyectoId, r.proyecto?.nombre ?? null, { conHora: true });
  }
  for (const t of tareas) {
    const suya = (!!a.personaId && t.personaId === a.personaId) || t.responsable === a.nombre;
    if (soloMias && !suya) continue;
    if (t.area === "DISENO" && !verDiseno && !suya) continue;
    sumar(`tarea-${t.id}`, "TAREA", t.titulo, t.venceEl!, t.proyectoId, t.proyecto.nombre);
  }
  for (const c of checklist) if (esMio(c.proyectoId)) sumar(`checklist-${c.id}`, "CONFIRMACION", c.texto, c.fecha!, c.proyectoId, c.proyecto.nombre);
  for (const c of cuotas) {
    if (soloMias && !(c.proyectoId && mios.has(c.proyectoId))) continue;
    sumar(`cuota-${c.id}`, c.tipo === "COBRO" ? "COBRO" : "PAGO", c.concepto, c.venceEl, c.proyectoId, c.proyecto?.nombre ?? null, { monto: c.monto, moneda: c.moneda });
  }
  for (const i of items) {
    const { proyectoId, version, proyecto } = i.presupuesto;
    if (version !== versiones.get(proyectoId) || !esMio(proyectoId)) continue;
    sumar(`item-${i.id}`, "DEADLINE", i.descripcion, i.fechaLimite!, proyectoId, proyecto.nombre);
  }
  return salida.sort((x, y) => x.fecha.getTime() - y.fecha.getTime());
}

/** Lo que pide la ruta del calendario: la persona sin sesión, armada igual que `actorActual`. */
export async function actorDeUsuario(tenantId: string, userId: string): Promise<Actor | null> {
  const [user, persona, permisos] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, tenantId, active: true, deletedAt: null }, select: { id: true, name: true, email: true, role: true, professionalId: true, tenantId: true } }),
    prisma.proyectoPersona.findFirst({ where: { tenantId, userId, activa: true }, select: { id: true, rol: true, nombre: true } }),
    prisma.proyectoPermiso.findMany({ where: { tenantId }, select: { rol: true, modulo: true, ver: true, editar: true, columnasOcultas: true } }),
  ]);
  if (!user || !roleHasCapability(user.role, "agenda:read")) return null;
  const rol = (persona?.rol as RolGestion | undefined) ?? (roleHasCapability(user.role, "agenda:manage") ? "DIRECCION" : "DISENO");
  return { user, tenantId, personaId: persona?.id ?? null, nombre: persona?.nombre ?? user.name, rol, permisos };
}

/** Sin secreto en producción no hay llave: la ruta responde 404, igual que las sesiones fallan cerrado. */
function secretoDelCalendario(): string | null {
  return process.env.AUTH_SECRET || (process.env.NODE_ENV === "production" ? null : "dev-secret");
}

export function usuarioDelCalendario(tenantId: string, token: string): string | null {
  const secreto = secretoDelCalendario();
  return secreto ? usuarioDelToken(secreto, tenantId, token) : null;
}

export async function direccionDelCalendario(a: Actor): Promise<string | null> {
  const secreto = secretoDelCalendario();
  if (!secreto) return null;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const protocolo = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocolo}://${host}/api/proyectos/calendario/${tokenDeCalendario(secreto, a.tenantId, a.user.id)}`;
}

export const rangoDeSuscripcion = (hoy: Date = new Date()) => ({ desde: new Date(hoy.getTime() - 60 * DIA), hasta: new Date(hoy.getTime() + 400 * DIA) });

// ── Inicio ──────────────────────────────────────────────────────────────────

export async function datosDeInicio(a: Actor) {
  const { tenantId } = a;
  const visibles = filtroDeProyectos(a);
  const ahora = new Date();
  const hoy = new Date(`${claveDia(ahora)}T00:00:00-03:00`);
  const [activos, eventos30, tareasAbiertas, misTareas, misProyectos, agenda] = await Promise.all([
    prisma.proyecto.count({ where: { ...visibles, ...proyectoActivo } }),
    prisma.proyecto.count({ where: { ...visibles, perdidoEl: null, fechaEvento: { gte: hoy, lte: new Date(hoy.getTime() + 30 * DIA) } } }),
    prisma.proyectoTarea.count({ where: { tenantId, ...tareaAbierta, proyecto: visibles } }),
    prisma.proyectoTarea.findMany({
      where: { tenantId, ...tareaAbierta, proyecto: visibles, OR: [{ personaId: a.personaId ?? "-" }, { responsable: a.nombre }] },
      orderBy: [{ venceEl: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 8,
      select: { id: true, titulo: true, venceEl: true, proyectoId: true, proyecto: { select: { nombre: true } } },
    }),
    prisma.proyecto.findMany({
      where: { ...visibles, ...proyectoActivo },
      orderBy: [{ fechaEvento: { sort: "asc", nulls: "last" } }, { numero: "desc" }],
      take: 12,
      select: { id: true, numero: true, createdAt: true, nombre: true, ciudad: true, etapa: true, servicio: true, fechaEvento: true, client: { select: { name: true } } },
    }),
    entradasCalendario(a, hoy, new Date(hoy.getTime() + 15 * DIA - 1), false),
  ]);
  const tipos = new Set<TipoCalendario>(["DEADLINE", "CONFIRMACION", "PAGO", "COBRO", "TAREA"]);
  return { activos, eventos30, tareasAbiertas, misTareas, misProyectos, agenda: agenda.filter((e) => tipos.has(e.tipo)).slice(0, 40) };
}

export async function opcionesDeProyecto(a: Actor) {
  return prisma.proyecto.findMany({ where: { ...filtroDeProyectos(a), perdidoEl: null }, orderBy: { numero: "desc" }, take: 200, select: { id: true, numero: true, createdAt: true, nombre: true } });
}

// ── Proveedores ─────────────────────────────────────────────────────────────

const filtroCuotasVisibles = (a: Actor): Prisma.ProyectoCuotaWhereInput => ({ OR: [{ proyecto: filtroDeProyectos(a) }, ...(puede(a, "empresa", "ver") ? [{ proyectoId: null }] : [])] });

/** Cuántos eventos lleva cada proveedor, contando sólo la ficha viva y los proyectos que esta persona puede ver. */
async function eventosPorProveedor(a: Actor, ids: readonly string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const items = await prisma.proyectoItem.findMany({
    where: { tenantId: a.tenantId, supplierId: { in: [...ids] }, presupuesto: { proyecto: filtroDeProyectos(a) } },
    select: { supplierId: true, presupuesto: { select: { proyectoId: true, version: true } } },
    take: 5000,
  });
  const vivas = versionesVivas(await prisma.proyectoPresupuesto.findMany({ where: { tenantId: a.tenantId, proyectoId: { in: [...new Set(items.map((i) => i.presupuesto.proyectoId))] } }, select: { proyectoId: true, version: true } }));
  const porProveedor = new Map<string, Set<string>>();
  for (const i of items) {
    if (!i.supplierId || i.presupuesto.version !== vivas.get(i.presupuesto.proyectoId)) continue;
    if (!porProveedor.has(i.supplierId)) porProveedor.set(i.supplierId, new Set());
    porProveedor.get(i.supplierId)!.add(i.presupuesto.proyectoId);
  }
  return new Map([...porProveedor].map(([k, v]) => [k, v.size]));
}

export async function listaDeProveedores(a: Actor, f: { rubro?: string; q?: string; bajas?: boolean }) {
  const { tenantId } = a;
  const q = f.q?.trim();
  const proveedores = await prisma.supplier.findMany({
    where: {
      tenantId,
      ...(f.bajas ? {} : { active: true }),
      ...(f.rubro ? { fichaDeProyecto: { is: { rubro: f.rubro } } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { taxId: { contains: q.replace(/\D/g, "") || q } },
              { email: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
              { fichaDeProyecto: { is: { ciudad: { contains: q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    take: 300,
    select: {
      id: true,
      name: true,
      taxId: true,
      phone: true,
      email: true,
      active: true,
      fichaDeProyecto: { select: { rubro: true, ciudad: true, condiciones: true, evaluacion: true, anticipoPct: true } },
    },
  });
  const verPlata = puede(a, "pagos", "ver");
  const ids = proveedores.map((p) => p.id);
  const [eventos, cuotas, gastos, tc] = await Promise.all([
    eventosPorProveedor(a, ids),
    verPlata ? prisma.proyectoCuota.findMany({ where: { tenantId, tipo: "PAGO", pagadoEl: null, anuladoEl: null, supplierId: { in: ids }, ...filtroCuotasVisibles(a) }, select: { supplierId: true, monto: true, moneda: true }, take: 5000 }) : [],
    verPlata
      ? prisma.proyectoGasto.findMany({
          where: { tenantId, anuladoEl: null, pagadoEl: null, proyecto: filtroDeProyectos(a) },
          orderBy: { fecha: "asc" },
          take: 500,
          select: { id: true, supplierId: true, descripcion: true, neto: true, iva: true, fecha: true, supplier: { select: { name: true } }, proyecto: { select: { id: true, numero: true, nombre: true } } },
        })
      : [],
    verPlata ? tiposDeCambio(tenantId) : ({} as Record<string, number>),
  ]);
  const deuda = new Map<string, number>();
  const sumar = (id: string | null, monto: number) => {
    if (id) deuda.set(id, redondear((deuda.get(id) ?? 0) + monto));
  };
  for (const c of cuotas) sumar(c.supplierId, aPesos(c.monto, c.moneda, tc));
  for (const g of gastos) sumar(g.supplierId, g.neto + g.iva);
  return {
    verPlata,
    pendientes: gastos,
    porPagar: redondear(gastos.reduce((s, g) => s + g.neto + g.iva, 0)),
    porPagarCuotas: redondear(cuotas.reduce((s, c) => s + aPesos(c.monto, c.moneda, tc), 0)),
    proveedores: proveedores.map((p) => ({ ...p, eventos: eventos.get(p.id) ?? 0, debe: deuda.get(p.id) ?? 0 })),
  };
}

export async function detalleDeProveedor(a: Actor, id: string) {
  const { tenantId } = a;
  const proveedor = await prisma.supplier.findFirst({
    where: { id, tenantId },
    select: { id: true, name: true, taxId: true, phone: true, email: true, active: true, fichaDeProyecto: { select: { rubro: true, ciudad: true, condiciones: true, anticipoPct: true, evaluacion: true, moneda: true, notas: true } } },
  });
  if (!proveedor) return null;
  const verPlata = puede(a, "pagos", "ver");
  const verCostos = puede(a, "costos", "ver");
  const [crudos, cuotas, pagadas, gastos, tc] = await Promise.all([
    prisma.proyectoItem.findMany({
      where: { tenantId, supplierId: id, presupuesto: { proyecto: filtroDeProyectos(a) } },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        descripcion: true,
        cantidad: true,
        costo: true,
        moneda: true,
        estadoItem: true,
        presupuesto: { select: { proyectoId: true, version: true, proyecto: { select: { id: true, numero: true, createdAt: true, nombre: true, fechaEvento: true } } } },
      },
    }),
    verPlata
      ? prisma.proyectoCuota.findMany({
          where: { tenantId, supplierId: id, tipo: "PAGO", pagadoEl: null, anuladoEl: null, ...filtroCuotasVisibles(a) },
          orderBy: { venceEl: "asc" },
          take: 200,
          select: { id: true, concepto: true, monto: true, moneda: true, venceEl: true, proyectoId: true, proyecto: { select: { nombre: true } } },
        })
      : [],
    verPlata ? prisma.proyectoCuota.findMany({ where: { tenantId, supplierId: id, tipo: "PAGO", pagadoEl: { not: null }, anuladoEl: null, ...filtroCuotasVisibles(a) }, select: { monto: true, moneda: true }, take: 2000 }) : [],
    verPlata
      ? prisma.proyectoGasto.findMany({
          where: { tenantId, supplierId: id, anuladoEl: null, proyecto: filtroDeProyectos(a) },
          orderBy: { fecha: "asc" },
          take: 500,
          select: { id: true, descripcion: true, neto: true, iva: true, fecha: true, pagadoEl: true, proyecto: { select: { id: true, numero: true, nombre: true } } },
        })
      : [],
    verPlata ? tiposDeCambio(tenantId) : ({} as Record<string, number>),
  ]);
  const vivas = crudos.length ? versionesVivas(await prisma.proyectoPresupuesto.findMany({ where: { tenantId, proyectoId: { in: [...new Set(crudos.map((i) => i.presupuesto.proyectoId))] } }, select: { proyectoId: true, version: true } })) : new Map<string, number>();
  const historial = crudos
    .filter((i) => i.presupuesto.version === vivas.get(i.presupuesto.proyectoId))
    // El costo sólo sale del servidor con permiso de costos.
    .map(({ costo, moneda, presupuesto, ...i }) => ({ ...i, proyecto: presupuesto.proyecto, precioUnitario: verCostos ? costo : null, moneda: verCostos ? moneda : null }));
  return {
    proveedor,
    verPlata,
    verCostos,
    historial,
    eventos: new Set(historial.map((h) => h.proyecto.id)).size,
    cuotas,
    gastosPorPagar: gastos.filter((g) => !g.pagadoEl),
    debe: redondear(cuotas.reduce((s, c) => s + aPesos(c.monto, c.moneda, tc), 0) + gastos.filter((g) => !g.pagadoEl).reduce((s, g) => s + g.neto + g.iva, 0)),
    gastado: redondear(pagadas.reduce((s, c) => s + aPesos(c.monto, c.moneda, tc), 0) + gastos.reduce((s, g) => s + g.neto, 0)),
  };
}

export async function proveedorParaEditar(tenantId: string, id: string) {
  return prisma.supplier.findFirst({
    where: { id, tenantId },
    select: { id: true, name: true, taxId: true, phone: true, email: true, fichaDeProyecto: { select: { rubro: true, ciudad: true, condiciones: true, anticipoPct: true, evaluacion: true, moneda: true, notas: true } } },
  });
}

// ── Equipo ──────────────────────────────────────────────────────────────────

/** El sueldo sólo sale del servidor con permiso de liquidaciones. */
export async function personasDelEquipo(a: Actor) {
  const verSueldo = puede(a, "liquidaciones", "ver");
  const filas = await prisma.proyectoPersona.findMany({
    where: { tenantId: a.tenantId },
    orderBy: [{ activa: "desc" }, { nombre: "asc" }],
    take: 300,
    select: { id: true, nombre: true, email: true, puesto: true, rol: true, sueldoBase: true, facturaA: true, activa: true, userId: true },
  });
  return filas.map(({ sueldoBase, ...p }) => ({ ...p, sueldoBase: verSueldo ? sueldoBase : null }));
}

const POR_PAGINA_REGISTRO = 30;

export async function registroDeCambios(a: Actor, pedida?: string) {
  const total = await prisma.proyectoCambio.count({ where: { tenantId: a.tenantId } });
  const { pagina, paginas, salto } = paginacion(pedida, total, POR_PAGINA_REGISTRO);
  const verSueldos = puede(a, "liquidaciones", "ver");
  const verCostos = puede(a, "costos", "ver");
  const filas = await prisma.proyectoCambio.findMany({
    where: { tenantId: a.tenantId },
    orderBy: { createdAt: "desc" },
    skip: salto,
    take: POR_PAGINA_REGISTRO,
    select: { id: true, createdAt: true, autor: true, entidad: true, campo: true, antes: true, despues: true, proyectoId: true },
  });
  const oculto = (campo: string) => (!verSueldos && /sueldo|liquidaci|plus/i.test(campo)) || (!verCostos && /costo|recargo|margen/i.test(campo));
  return { total, pagina, paginas, filas: filas.map((f) => (oculto(f.campo) ? { ...f, antes: "Oculto", despues: "Oculto" } : f)) };
}

// ── Avisos y configuración ──────────────────────────────────────────────────

export async function misAvisos(a: Actor) {
  const donde = { tenantId: a.tenantId, destinatario: a.user.id };
  const [avisos, noLeidos] = await Promise.all([
    prisma.proyectoAviso.findMany({ where: donde, orderBy: [{ createdAt: "desc" }], take: 100, select: { id: true, tipo: true, texto: true, enlace: true, leidoEl: true, createdAt: true } }),
    prisma.proyectoAviso.count({ where: { ...donde, leidoEl: null } }),
  ]);
  return { avisos, noLeidos };
}

export async function misPreferenciasDeAviso(a: Actor) {
  return prisma.proyectoAvisoPref.findMany({ where: { tenantId: a.tenantId, userId: a.user.id }, select: { tipo: true, enSistema: true } });
}

// ── Buscador global ─────────────────────────────────────────────────────────

const PERMISOS_BUSQUEDA: Record<"proyectos" | "proveedores" | "archivos" | "mensajes", ModuloGestion> = { proyectos: "pipeline", proveedores: "proveedores", archivos: "ficha", mensajes: "pipeline" };

export async function buscarEnGestion(a: Actor, texto: string) {
  const q = texto.trim().slice(0, 100);
  const vacio = { proyectos: [], proveedores: [], archivos: [], mensajes: [] };
  if (q.length < 2) return { q, ...vacio };
  const { tenantId } = a;
  const visibles = filtroDeProyectos(a);
  const contiene = { contains: q, mode: "insensitive" as const };
  const numero = /^\d{1,9}$/.test(q) ? Number(q) : null;
  const permite = (k: keyof typeof PERMISOS_BUSQUEDA) => puede(a, PERMISOS_BUSQUEDA[k], "ver");
  const [proyectos, proveedores, archivos, mensajes] = await Promise.all([
    permite("proyectos")
      ? prisma.proyecto.findMany({
          where: { ...visibles, OR: [{ nombre: contiene }, { evento: contiene }, { ciudad: contiene }, { lugar: contiene }, { client: { name: contiene } }, ...(numero !== null ? [{ numero }] : [])] },
          orderBy: { numero: "desc" },
          take: 20,
          select: { id: true, numero: true, createdAt: true, nombre: true, ciudad: true, etapa: true, servicio: true, client: { select: { name: true } } },
        })
      : [],
    permite("proveedores")
      ? prisma.supplier.findMany({
          where: { tenantId, OR: [{ name: contiene }, { email: contiene }, { fichaDeProyecto: { is: { OR: [{ rubro: contiene }, { ciudad: contiene }] } } }] },
          orderBy: { name: "asc" },
          take: 20,
          select: { id: true, name: true, active: true, fichaDeProyecto: { select: { rubro: true, ciudad: true } } },
        })
      : [],
    permite("archivos")
      ? prisma.proyectoArchivo.findMany({
          where: { tenantId, nombre: contiene, proyecto: visibles },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, nombre: true, tipo: true, proyectoId: true, proyecto: { select: { nombre: true } } },
        })
      : [],
    permite("mensajes")
      ? prisma.proyectoMensaje.findMany({
          where: {
            tenantId,
            texto: contiene,
            OR: [{ proyecto: visibles }, ...(puede(a, "diseno", "ver") ? [{ proyectoId: null }] : [])],
            // El canal de pagos habla de plata: se busca sólo con permiso de pagos.
            ...(puede(a, "pagos", "ver") ? {} : { canal: { not: "pagos" } }),
          },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, autor: true, texto: true, canal: true, createdAt: true, proyectoId: true, proyecto: { select: { nombre: true } } },
        })
      : [],
  ]);
  return { q, proyectos, proveedores, archivos, mensajes };
}

// ── Portal del cliente (sin login: la llave es el token) ────────────────────

/** Las fotos que las láminas citan por referencia, sólo si son de este mismo proyecto. La ruta interna de imágenes pide sesión. */
async function imagenesDeLaminas(tenantId: string, proyectoId: string, laminas: readonly unknown[]): Promise<Map<string, string>> {
  const refs = laminas.flatMap((l) => (Array.isArray(l) ? l : [])).flatMap((l) => {
    const ref = (l as { imagen?: unknown } | null)?.imagen;
    const r = leerRef(ref);
    return r && r.tipo !== "url" ? [{ ref: ref as string, ...r }] : [];
  });
  if (refs.length === 0) return new Map();
  const de = (tipo: string) => refs.filter((r) => r.tipo === tipo).map((r) => r.id);
  const [archivos, versiones] = await Promise.all([
    prisma.proyectoArchivo.findMany({ where: { tenantId, proyectoId, id: { in: de("archivo") } }, select: { id: true, datos: true } }),
    prisma.proyectoEntregableVersion.findMany({ where: { tenantId, id: { in: de("version") }, entregable: { proyectoId } }, select: { id: true, datos: true } }),
  ]);
  const porId = new Map([...archivos, ...versiones].map((x) => [x.id, x.datos]));
  return new Map(refs.flatMap((r) => {
    const datos = porId.get(r.id);
    return datos ? [[r.ref, datos] as const] : [];
  }));
}

/**
 * Sólo lo que el cliente puede ver, campo por campo: ni costos, ni márgenes, ni proveedores, ni datos internos. De los
 * presupuestos sale el link a la propuesta, no sus ítems.
 */
export async function portalPublico(token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const tenantId = await getCurrentTenantId();
  const p = await prisma.proyecto.findFirst({
    where: { tenantId, tokenPortal: token, perdidoEl: null },
    select: {
      id: true,
      nombre: true,
      servicio: true,
      evento: true,
      tipoEvento: true,
      lugar: true,
      ciudad: true,
      fechaEvento: true,
      fechaFin: true,
      tokenEntregables: true,
      client: { select: { name: true } },
      presupuestos: {
        where: { estado: { in: ["ENVIADO", "APROBADO", "RECHAZADO"] } },
        orderBy: { version: "desc" },
        take: 1,
        select: { version: true, estado: true, token: true, enviadoEl: true, validoHasta: true, respondidoEl: true, respondidoPor: true },
      },
      presentaciones: {
        where: { estado: { in: ["ENVIADA", "APROBADA", "CAMBIOS"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, nombre: true, estado: true, respuesta: true, laminas: true, createdAt: true },
      },
      entregables: {
        where: { anuladoEl: null, versiones: { some: { estado: { not: "BORRADOR" } } } },
        orderBy: { createdAt: "asc" },
        select: { id: true, nombre: true, versiones: { where: { estado: { not: "BORRADOR" } }, orderBy: { numero: "desc" }, take: 1, select: { numero: true, estado: true } } },
      },
      archivos: {
        where: { visibleCliente: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, nombre: true, tipo: true, datos: true, url: true },
      },
    },
  });
  if (!p) return null;
  const imagenes = await imagenesDeLaminas(tenantId, p.id, p.presentaciones.map((x) => x.laminas));
  return {
    negocio: await datosDelNegocio(tenantId),
    proyecto: { nombre: p.nombre, servicio: p.servicio, evento: p.evento, tipoEvento: p.tipoEvento, lugar: p.lugar, ciudad: p.ciudad, fechaEvento: p.fechaEvento, fechaFin: p.fechaFin, cliente: p.client.name },
    propuesta: p.presupuestos[0] ?? null,
    presentaciones: p.presentaciones.map(({ laminas, ...x }) => ({ ...x, laminas: laminasPublicas(laminas, (ref) => imagenes.get(ref) ?? null) })),
    piezas: p.entregables.map((e) => ({ id: e.id, nombre: e.nombre, numero: e.versiones[0]?.numero ?? 0, estado: e.versiones[0]?.estado ?? "" })),
    tokenEntregables: p.tokenEntregables,
    archivos: p.archivos.map((a) => ({ id: a.id, nombre: a.nombre, tipo: a.tipo, imagen: enlaceSeguro(a.datos), url: enlaceSeguro(a.url) })).filter((a) => a.imagen || a.url),
  };
}
