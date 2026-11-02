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
import { desvioPorRubro, redondear, resultadoReal, totales, ultimaEnviada } from "./core";
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
      entregables: { where: { anuladoEl: null }, select: { versiones: { select: { numero: true, estado: true } } } },
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
      gastos: { orderBy: [{ fecha: "desc" }, { createdAt: "desc" }], include: { supplier: { select: { name: true } } } },
      entregables: {
        where: { anuladoEl: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, nombre: true, especificacion: true, venceEl: true, versiones: { orderBy: { numero: "desc" }, select: { numero: true, estado: true, comentario: true, respondidoPor: true } } },
      },
    },
  });
  if (!proyecto) return null;
  const [config, negocio, proveedores] = await Promise.all([
    configProyectos(tenantId),
    datosDelNegocio(tenantId),
    conPlata ? prisma.supplier.findMany({ where: { tenantId, active: true }, orderBy: { name: "asc" }, take: 500, select: { name: true } }) : [],
  ]);
  const vigente = proyecto.presupuestos.find((p) => p.estado === "APROBADO") ?? null;
  const totalesVigente = vigente ? totales(vigente.items, vigente.ivaPct) : null;
  const totalAprobado = totalesVigente?.total ?? 0;
  const real = resultadoReal(totalesVigente, proyecto.gastos);
  const rubros = desvioPorRubro(vigente?.items ?? [], proyecto.gastos);
  const cobrado = redondear(proyecto.pagos.filter((p) => !p.anuladoEl).reduce((s, p) => s + p.monto, 0));
  return { user, conPlata, proyecto, config, negocio, totalAprobado, cobrado, saldo: redondear(totalAprobado - cobrado), totalesVigente, real, rubros, proveedores: proveedores.map((s) => s.name) };
}

/** Una pieza con sus versiones. Las imágenes pesan: sólo baja la del borrador, la última enviada y la que se pidió ver. */
export async function fichaEntregable(proyectoId: string, id: string, ver?: number) {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const entregable = await prisma.proyectoEntregable.findFirst({
    where: { id, proyectoId, tenantId, anuladoEl: null },
    include: {
      proyecto: { select: { id: true, numero: true, nombre: true, servicio: true, tokenEntregables: true, client: { select: { name: true, phone: true } } } },
      versiones: { orderBy: { numero: "desc" }, omit: { datos: true } },
    },
  });
  if (!entregable) return null;
  const { versiones } = entregable;
  const conImagen = versiones.filter((v) => v.estado === "BORRADOR" || v === ultimaEnviada(versiones) || v.numero === ver).map((v) => v.id);
  const imagenes = await prisma.proyectoEntregableVersion.findMany({ where: { tenantId, id: { in: conImagen } }, select: { id: true, datos: true } });
  const datos = new Map(imagenes.map((i) => [i.id, i.datos]));
  const negocio = await datosDelNegocio(tenantId);
  return { negocio, entregable: { ...entregable, versiones: versiones.map((v) => ({ ...v, datos: datos.get(v.id) ?? null })) } };
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
      gastos: { where: { anuladoEl: null }, select: { rubro: true, neto: true, iva: true, pagadoEl: true, anuladoEl: true } },
    },
  });
  return proyectos.map((p) => {
    const a = p.presupuestos[0];
    const t = a ? totales(a.items, a.ivaPct) : null;
    const cobrado = redondear(p.pagos.reduce((s, x) => s + x.monto, 0));
    return { ...p, t, cobrado, saldo: redondear((t?.total ?? 0) - cobrado), real: resultadoReal(t, p.gastos) };
  });
}

/** Los proveedores con lo gastado en proyectos, y lo que queda por pagar. */
export async function proveedoresConGastos() {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const [proveedores, gastos] = await Promise.all([
    prisma.supplier.findMany({ where: { tenantId }, orderBy: [{ active: "desc" }, { name: "asc" }], take: 500, select: { id: true, name: true, taxId: true, phone: true, email: true, active: true } }),
    prisma.proyectoGasto.findMany({
      where: { tenantId, anuladoEl: null },
      orderBy: { fecha: "asc" },
      take: 2000,
      select: { id: true, supplierId: true, descripcion: true, neto: true, iva: true, fecha: true, pagadoEl: true, supplier: { select: { name: true } }, proyecto: { select: { id: true, numero: true, nombre: true } } },
    }),
  ]);
  const pendientes = gastos.filter((g) => !g.pagadoEl);
  return {
    proveedores: proveedores.map((s) => {
      const suyos = gastos.filter((g) => g.supplierId === s.id);
      return {
        ...s,
        gastado: redondear(suyos.reduce((x, g) => x + g.neto, 0)),
        porPagar: redondear(suyos.filter((g) => !g.pagadoEl).reduce((x, g) => x + g.neto + g.iva, 0)),
      };
    }),
    pendientes,
    porPagar: redondear(pendientes.reduce((x, g) => x + g.neto + g.iva, 0)),
  };
}

/** Los clientes del negocio con sus proyectos: abiertos, total y lo que falta cobrar de lo aprobado. */
export async function clientesConProyectos(q: string) {
  await requireCapability("clients:read");
  const tenantId = await getCurrentTenantId();
  const clientes = await prisma.client.findMany({
    where: {
      tenantId,
      ...(q && {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }),
    },
    orderBy: { name: "asc" },
    take: 500,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      proyectos: {
        select: {
          etapa: true,
          presupuestos: { where: { estado: "APROBADO" }, select: { ivaPct: true, items: { select: { cantidad: true, costo: true, precio: true } } } },
          pagos: { where: { anuladoEl: null }, select: { monto: true } },
        },
      },
    },
  });
  return clientes.map(({ proyectos, ...c }) => ({
    ...c,
    total: proyectos.length,
    abiertos: proyectos.filter((p) => p.etapa !== "CIERRE").length,
    porCobrar: redondear(
      proyectos.reduce((s, p) => {
        const a = p.presupuestos[0];
        if (!a) return s;
        return s + Math.max(0, totales(a.items, a.ivaPct).total - p.pagos.reduce((x, y) => x + y.monto, 0));
      }, 0),
    ),
  }));
}

/** Los proyectos de un cliente, para su ficha. Sólo lee del negocio del pedido. */
export async function proyectosDelCliente(clientId: string) {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const proyectos = await prisma.proyecto.findMany({
    where: { tenantId, clientId },
    orderBy: { numero: "desc" },
    take: 200,
    select: {
      id: true,
      numero: true,
      nombre: true,
      servicio: true,
      etapa: true,
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

/** Las piezas que el cliente puede ver. De cada una, la imagen de la última versión enviada; del resto, lo que se respondió. */
export async function entregablesPublicos(token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const tenantId = await getCurrentTenantId();
  const proyecto = await prisma.proyecto.findFirst({
    where: { tenantId, tokenEntregables: token },
    select: {
      nombre: true,
      servicio: true,
      evento: true,
      client: { select: { name: true } },
      entregables: {
        // Un borrador todavía no existe para el cliente.
        where: { anuladoEl: null, versiones: { some: { estado: { not: "BORRADOR" } } } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          nombre: true,
          versiones: {
            where: { estado: { not: "BORRADOR" } },
            orderBy: { numero: "desc" },
            select: { id: true, numero: true, estado: true, url: true, nota: true, especificacion: true, respondidaEl: true, respondidoPor: true, comentario: true },
          },
        },
      },
    },
  });
  if (!proyecto) return null;
  const actuales = proyecto.entregables.map((e) => e.versiones[0].id);
  const [imagenes, negocio] = await Promise.all([
    prisma.proyectoEntregableVersion.findMany({ where: { tenantId, id: { in: actuales } }, select: { id: true, datos: true } }),
    datosDelNegocio(tenantId),
  ]);
  const datos = new Map(imagenes.map((i) => [i.id, i.datos]));
  return {
    negocio,
    proyecto: { nombre: proyecto.nombre, servicio: proyecto.servicio, evento: proyecto.evento, cliente: proyecto.client.name },
    piezas: proyecto.entregables.map(({ id, nombre, versiones: [actual, ...anteriores] }) => ({ id, nombre, actual: { ...actual, datos: datos.get(actual.id) ?? null }, anteriores })),
  };
}

export async function propuestaPublica(token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const tenantId = await getCurrentTenantId();
  // Un borrador todavía no existe para el cliente.
  const presupuesto = await prisma.proyectoPresupuesto.findFirst({
    where: { tenantId, token, estado: { not: "BORRADOR" } },
    include: {
      items: { orderBy: [{ posicion: "asc" }, { createdAt: "asc" }], select: { id: true, rubro: true, descripcion: true, unidad: true, cantidad: true, precio: true, costo: true, visibleCliente: true } },
      proyecto: {
        select: {
          id: true,
          moneda: true,
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
  // Lo interno no sale del servidor: ni notas, ni la foto de la versión, ni quién aprobó adentro.
  const { foto: _foto, nota: _nota, creadoPor: _creadoPor, aprobadoInternoPor: _aprobadoPor, aprobadoInternoEl: _aprobadoEl, ...publico } = presupuesto;
  // Un ítem oculto no se detalla, pero se cobra: suma a «Otros conceptos» de su rubro, y el total sigue cerrando.
  const otros = new Map<string, number>();
  for (const i of presupuesto.items) if (!i.visibleCliente) otros.set(i.rubro, redondear((otros.get(i.rubro) ?? 0) + i.cantidad * i.precio));
  return {
    negocio,
    presupuesto: {
      ...publico,
      // El costo y el proveedor son internos: del servidor sale sólo lo que el cliente puede ver.
      items: [
        ...presupuesto.items.filter((i) => i.visibleCliente).map(({ id, rubro, descripcion, unidad, cantidad, precio }) => ({ id, rubro, descripcion, unidad, cantidad, precio })),
        ...[...otros].map(([rubro, precio]) => ({ id: `otros:${rubro}`, rubro, descripcion: "Otros conceptos", unidad: "global", cantidad: 1, precio })),
      ],
    },
    totales: { neto: t.neto, iva: t.iva, total: t.total },
  };
}
