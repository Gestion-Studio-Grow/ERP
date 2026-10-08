// ============================================================================
// TALLER — lecturas del servidor. Siempre acotadas al negocio (tenantId) y, para el
// mecánico, a SUS órdenes. Las escrituras viven en acciones.ts.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import type { SessionUser } from "@/lib/session";
import { getLocation } from "@/lib/settings";
import { todayInBusinessTz } from "@/lib/datetime";
import {
  avisosDeVehiculo,
  claveAviso,
  PLANTILLAS_DEFAULT,
  RECARGOS_DEFAULT,
  redondear,
  totales,
  type ClavePlantilla,
  type EstadoOrden,
  type Recargos,
  type TipoAviso,
} from "./core";

// ── Configuración (con sus valores de fábrica) ──────────────────────────────

export interface ConfigTaller {
  margenPct: number;
  validezDias: number;
  garantiaDias: number;
  valorHora: number;
  aliasCbu: string;
  linkMercadoPago: string;
  linkResena: string;
  condicionIva: string;
  recargos: Recargos;
  plantillas: Record<ClavePlantilla, string>;
}

const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

export async function configTaller(tenantId: string): Promise<ConfigTaller> {
  const c = await prisma.tallerConfig.findUnique({ where: { tenantId } });
  const r = (c?.recargos ?? {}) as Record<string, unknown>;
  const p = (c?.plantillas ?? {}) as Record<string, unknown>;
  const plantillas = { ...PLANTILLAS_DEFAULT } as Record<ClavePlantilla, string>;
  for (const k of Object.keys(plantillas) as ClavePlantilla[]) {
    if (typeof p[k] === "string" && (p[k] as string).trim()) plantillas[k] = p[k] as string;
  }
  return {
    margenPct: c?.margenPct ?? 35,
    validezDias: c?.validezDias ?? 7,
    garantiaDias: c?.garantiaDias ?? 90,
    valorHora: c?.valorHora ?? 0,
    aliasCbu: c?.aliasCbu ?? "",
    linkMercadoPago: c?.linkMercadoPago ?? "",
    linkResena: c?.linkResena ?? "",
    condicionIva: c?.condicionIva ?? "MONOTRIBUTO",
    recargos: {
      debito: num(r.debito, RECARGOS_DEFAULT.debito),
      cuotas1: num(r.cuotas1, RECARGOS_DEFAULT.cuotas1),
      cuotas3: num(r.cuotas3, RECARGOS_DEFAULT.cuotas3),
      cuotas6: num(r.cuotas6, RECARGOS_DEFAULT.cuotas6),
      cuotas12: num(r.cuotas12, RECARGOS_DEFAULT.cuotas12),
    },
    plantillas,
  };
}

/** Datos del negocio que van en los mensajes y en los papeles. */
export async function datosDelNegocio(tenantId: string) {
  const [tenant, loc] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } }),
    getLocation(),
  ]);
  return {
    nombre: tenant?.name ?? "El taller",
    slug: tenant?.slug ?? "",
    direccion: [loc.addressLine, loc.city].filter(Boolean).join(", "),
    horario: loc.hoursLabel,
    whatsapp: loc.whatsapp,
    instagramUrl: loc.instagramUrl,
    instagramLabel: loc.instagramLabel,
    mapsUrl: loc.mapsUrl,
  };
}

// ── Sesión ──────────────────────────────────────────────────────────────────

export const veLaPlata = (u: SessionUser): boolean => roleHasCapability(u.role, "agenda:manage");

/** El mecánico ve sus órdenes y las que todavía no tienen mecánico. */
function filtroDeRol(u: SessionUser) {
  return veLaPlata(u) ? {} : { OR: [{ mecanicoUserId: u.id }, { mecanicoUserId: null }] };
}

const inicioDeHoy = (): Date => new Date(`${todayInBusinessTz()}T00:00:00-03:00`);

// ── Tablero ─────────────────────────────────────────────────────────────────

export interface TarjetaOrden {
  id: string;
  numero: number;
  estado: EstadoOrden;
  patente: string;
  vehiculo: string;
  cliente: string;
  telefono: string;
  problema: string;
  mecanico: string | null;
  dias: number;
  total: number;
  saldo: number;
  pendientesDeAprobar: number;
}

export async function tablero() {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const hoy = inicioDeHoy();
  const manana = new Date(hoy.getTime() + 86_400_000);

  const [ordenes, turnos, pagosHoy, stock] = await Promise.all([
    prisma.tallerOrden.findMany({
      where: {
        tenantId,
        ...filtroDeRol(user),
        OR: [{ estado: { not: "ENTREGADO" } }, { entregadoEl: { gte: hoy } }],
      },
      orderBy: { createdAt: "asc" },
      include: {
        vehiculo: { select: { patente: true, marca: true, modelo: true } },
        client: { select: { name: true, phone: true } },
        items: { select: { tipo: true, cantidad: true, precio: true, decision: true, traidoPorCliente: true } },
        pagos: { select: { monto: true } },
      },
    }),
    prisma.appointment.findMany({
      where: { tenantId, startsAt: { gte: hoy, lt: manana }, status: { notIn: ["CANCELLED"] } },
      orderBy: { startsAt: "asc" },
      include: { client: { select: { name: true, phone: true } }, service: { select: { name: true } } },
    }),
    veLaPlata(user)
      ? prisma.tallerPago.findMany({ where: { tenantId, createdAt: { gte: hoy } }, select: { medio: true, monto: true, recargo: true } })
      : Promise.resolve([]),
    prisma.product.findMany({
      where: { tenantId, active: true, deletedAt: null, trackStock: true },
      select: { id: true, name: true, stock: true, lowStockAt: true },
    }),
  ]);

  const ahora = Date.now();
  const tarjetas: TarjetaOrden[] = ordenes.map((o) => {
    const t = totales(o.items);
    const pagado = o.pagos.reduce((s, p) => s + p.monto, 0);
    return {
      id: o.id,
      numero: o.numero,
      estado: o.estado as EstadoOrden,
      patente: o.vehiculo.patente,
      vehiculo: `${o.vehiculo.marca} ${o.vehiculo.modelo}`.trim(),
      cliente: o.client.name,
      telefono: o.client.phone,
      problema: o.problema,
      mecanico: o.mecanicoNombre,
      dias: Math.floor((ahora - o.createdAt.getTime()) / 86_400_000),
      total: t.aprobado,
      saldo: redondear(t.aprobado - pagado),
      pendientesDeAprobar: t.pendientes,
    };
  });

  const caja = { total: 0, porMedio: {} as Record<string, number> };
  for (const p of pagosHoy) {
    const m = p.monto + p.recargo;
    caja.total = redondear(caja.total + m);
    caja.porMedio[p.medio] = redondear((caja.porMedio[p.medio] ?? 0) + m);
  }

  const alertas: { texto: string; href: string }[] = [];
  const sinRespuesta = tarjetas.filter((t) => t.estado === "ESPERANDO_APROBACION" && t.dias >= 2).length;
  if (sinRespuesta) alertas.push({ texto: `${sinRespuesta} presupuesto${sinRespuesta > 1 ? "s" : ""} sin respuesta hace 2 días o más`, href: "/admin/taller#ESPERANDO_APROBACION" });
  const listos = tarjetas.filter((t) => t.estado === "LISTO" && t.dias >= 3).length;
  if (listos) alertas.push({ texto: `${listos} auto${listos > 1 ? "s" : ""} listo${listos > 1 ? "s" : ""} sin retirar`, href: "/admin/taller#LISTO" });
  const bajo = stock.filter((p) => p.stock <= p.lowStockAt).length;
  if (bajo) alertas.push({ texto: `${bajo} repuesto${bajo > 1 ? "s" : ""} con stock bajo`, href: "/admin/inventario" });

  return {
    user,
    conPlata: veLaPlata(user),
    tarjetas,
    turnos: turnos.map((t) => ({ id: t.id, hora: t.startsAt, cliente: t.client.name, telefono: t.client.phone, servicio: t.service.name })),
    caja,
    alertas,
  };
}

// ── Orden ───────────────────────────────────────────────────────────────────

export async function ordenCompleta(id: string) {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const orden = await prisma.tallerOrden.findFirst({
    where: { id, tenantId, ...filtroDeRol(user) },
    include: {
      vehiculo: true,
      client: true,
      items: { orderBy: [{ posicion: "asc" }, { createdAt: "asc" }] },
      fotos: { orderBy: { createdAt: "asc" }, select: { id: true, momento: true, datos: true } },
      pagos: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!orden) return null;
  const [config, negocio, mecanicos, repuestos] = await Promise.all([
    configTaller(tenantId),
    datosDelNegocio(tenantId),
    prisma.user.findMany({ where: { tenantId, active: true, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.product.findMany({
      where: { tenantId, active: true, deletedAt: null },
      select: { id: true, name: true, price: true, stock: true },
      orderBy: { name: "asc" },
      take: 400,
    }),
  ]);
  const t = totales(orden.items);
  const pagado = redondear(orden.pagos.reduce((s, p) => s + p.monto, 0));
  return { user, conPlata: veLaPlata(user), orden, config, negocio, mecanicos, repuestos, totales: t, pagado, saldo: redondear(t.aprobado - pagado) };
}

// ── Patente → vehículo y cliente (para el ingreso rápido) ───────────────────

export async function vehiculoPorPatente(tenantId: string, patente: string) {
  return prisma.tallerVehiculo.findUnique({
    where: { tenantId_patente: { tenantId, patente } },
    include: { client: { select: { id: true, name: true, phone: true } } },
  });
}

// ── Vehículos y su historial ────────────────────────────────────────────────

export async function listaVehiculos(q: string) {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const texto = q.trim();
  const pat = texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return prisma.tallerVehiculo.findMany({
    where: {
      tenantId,
      ...(texto
        ? {
            OR: [
              ...(pat ? [{ patente: { contains: pat } }] : []),
              { modelo: { contains: texto, mode: "insensitive" as const } },
              { marca: { contains: texto, mode: "insensitive" as const } },
              { client: { name: { contains: texto, mode: "insensitive" as const } } },
              { client: { phone: { contains: texto } } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 80,
    include: {
      client: { select: { id: true, name: true, phone: true, tallerEtiquetas: true } },
      _count: { select: { ordenes: true } },
    },
  });
}

export async function historialVehiculo(id: string) {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const v = await prisma.tallerVehiculo.findFirst({
    where: { id, tenantId },
    include: {
      client: { include: { tallerVehiculos: { select: { id: true, patente: true, marca: true, modelo: true } } } },
      ordenes: {
        orderBy: { createdAt: "desc" },
        include: {
          items: { select: { tipo: true, descripcion: true, cantidad: true, precio: true, decision: true, traidoPorCliente: true } },
          pagos: { select: { monto: true } },
        },
      },
    },
  });
  return v ? { vehiculo: v, conPlata: veLaPlata(user) } : null;
}

// ── Bandeja de avisos ───────────────────────────────────────────────────────

export interface Aviso {
  clave: string;
  tipo: TipoAviso;
  titulo: string;
  detalle: string;
  cliente: string;
  telefono: string;
  vehiculo: string;
  patente: string;
  fecha: Date | null;
  saldo: number;
  ordenId: string | null;
  enviado: boolean;
}

export async function bandejaDeAvisos() {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const hoy = new Date();
  const [vehiculos, entregadas, enviados] = await Promise.all([
    prisma.tallerVehiculo.findMany({
      where: { tenantId },
      include: {
        client: { select: { name: true, phone: true } },
        ordenes: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
    prisma.tallerOrden.findMany({
      where: { tenantId, estado: "ENTREGADO" },
      include: {
        vehiculo: { select: { patente: true, marca: true, modelo: true } },
        client: { select: { name: true, phone: true } },
        items: { select: { tipo: true, cantidad: true, precio: true, decision: true, traidoPorCliente: true } },
        pagos: { select: { monto: true } },
      },
    }),
    prisma.tallerAvisoEnviado.findMany({ where: { tenantId }, select: { clave: true } }),
  ]);
  const yaEnviado = new Set(enviados.map((e) => e.clave));
  const avisos: Aviso[] = [];

  const TITULO: Record<TipoAviso, string> = {
    vtv: "VTV por vencer",
    service: "Le toca el service",
    inactivo: "No vuelve hace 6 meses",
    deuda: "Saldo pendiente",
    garantia: "Garantía por vencer",
  };

  for (const v of vehiculos) {
    const tipos = avisosDeVehiculo(
      { id: v.id, km: v.km, vtvVence: v.vtvVence, proximoServiceFecha: v.proximoServiceFecha, proximoServiceKm: v.proximoServiceKm, ultimaVisita: v.ordenes[0]?.createdAt ?? null },
      hoy,
    );
    for (const tipo of tipos) {
      const clave = claveAviso(tipo, v.id, hoy);
      avisos.push({
        clave,
        tipo,
        titulo: TITULO[tipo],
        detalle:
          tipo === "vtv" ? "Vence la VTV" : tipo === "service" ? (v.proximoServiceKm ? `Service a los ${v.proximoServiceKm.toLocaleString("es-AR")} km` : "Service por fecha") : "Última visita",
        cliente: v.client.name,
        telefono: v.client.phone,
        vehiculo: `${v.marca} ${v.modelo}`.trim(),
        patente: v.patente,
        fecha: tipo === "vtv" ? v.vtvVence : tipo === "service" ? v.proximoServiceFecha : (v.ordenes[0]?.createdAt ?? null),
        saldo: 0,
        ordenId: null,
        enviado: yaEnviado.has(clave),
      });
    }
  }

  for (const o of entregadas) {
    const saldo = redondear(totales(o.items).aprobado - o.pagos.reduce((s, p) => s + p.monto, 0));
    if (saldo <= 0.5) continue;
    const clave = claveAviso("deuda", o.id, hoy);
    avisos.push({
      clave,
      tipo: "deuda",
      titulo: TITULO.deuda,
      detalle: `Orden #${o.numero}`,
      cliente: o.client.name,
      telefono: o.client.phone,
      vehiculo: `${o.vehiculo.marca} ${o.vehiculo.modelo}`.trim(),
      patente: o.vehiculo.patente,
      fecha: o.entregadoEl,
      saldo,
      ordenId: o.id,
      enviado: yaEnviado.has(clave),
    });
  }

  const orden: Record<TipoAviso, number> = { deuda: 0, vtv: 1, service: 2, garantia: 3, inactivo: 4 };
  avisos.sort((a, b) => Number(a.enviado) - Number(b.enviado) || orden[a.tipo] - orden[b.tipo]);
  const [config, negocio] = await Promise.all([configTaller(tenantId), datosDelNegocio(tenantId)]);
  return { avisos, config, negocio };
}

// ── Reportes ────────────────────────────────────────────────────────────────

export async function reportesTaller() {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const desde = new Date();
  desde.setMonth(desde.getMonth() - 11, 1);
  desde.setHours(0, 0, 0, 0);
  const ordenes = await prisma.tallerOrden.findMany({
    where: { tenantId, createdAt: { gte: desde } },
    include: {
      client: { select: { id: true, name: true } },
      items: { select: { tipo: true, descripcion: true, cantidad: true, precio: true, decision: true, traidoPorCliente: true } },
    },
  });

  const porMes = new Map<string, { total: number; ordenes: number }>();
  const trabajos = new Map<string, number>();
  const mecanicos = new Map<string, { ordenes: number; total: number; horas: number }>();
  const clientes = new Map<string, { nombre: string; total: number; ordenes: number }>();
  let presupuestadas = 0;
  let aprobadas = 0;
  let itemsOfrecidos = 0;
  let itemsAprobados = 0;
  let facturado = 0;
  let entregadas = 0;

  for (const o of ordenes) {
    const t = totales(o.items);
    if (o.presupuestoEnviadoEl) {
      presupuestadas++;
      if (o.items.some((i) => i.decision === "APROBADO")) aprobadas++;
      itemsOfrecidos += o.items.length;
      itemsAprobados += o.items.filter((i) => i.decision === "APROBADO").length;
    }
    if (o.estado !== "ENTREGADO") continue;
    entregadas++;
    facturado += t.aprobado;
    const fecha = o.entregadoEl ?? o.createdAt;
    const mes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
    const m = porMes.get(mes) ?? { total: 0, ordenes: 0 };
    m.total += t.aprobado;
    m.ordenes++;
    porMes.set(mes, m);
    for (const i of o.items) {
      if (i.tipo === "MANO_OBRA" && i.decision === "APROBADO") trabajos.set(i.descripcion.trim(), (trabajos.get(i.descripcion.trim()) ?? 0) + 1);
    }
    const mec = o.mecanicoNombre ?? "Sin asignar";
    const mm = mecanicos.get(mec) ?? { ordenes: 0, total: 0, horas: 0 };
    mm.ordenes++;
    mm.total += t.manoDeObra;
    mm.horas += o.horas;
    mecanicos.set(mec, mm);
    const c = clientes.get(o.client.id) ?? { nombre: o.client.name, total: 0, ordenes: 0 };
    c.total += t.aprobado;
    c.ordenes++;
    clientes.set(o.client.id, c);
  }

  return {
    facturado: redondear(facturado),
    entregadas,
    ticketPromedio: entregadas ? redondear(facturado / entregadas) : 0,
    tasaAprobacion: presupuestadas ? Math.round((aprobadas / presupuestadas) * 100) : null, // no-es-plata: porcentaje de presupuestos
    tasaItems: itemsOfrecidos ? Math.round((itemsAprobados / itemsOfrecidos) * 100) : null, // no-es-plata: porcentaje de ítems
    porMes: [...porMes.entries()].sort().map(([mes, v]) => ({ mes, total: redondear(v.total), ordenes: v.ordenes })),
    trabajos: [...trabajos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
    mecanicos: [...mecanicos.entries()].map(([nombre, v]) => ({ nombre, ...v, total: redondear(v.total) })).sort((a, b) => b.total - a.total),
    clientes: [...clientes.values()].sort((a, b) => b.total - a.total).slice(0, 10).map((c) => ({ ...c, total: redondear(c.total) })),
  };
}

// ── Link público (sin login): la llave es el token ──────────────────────────

export async function ordenPublica(token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const tenantId = await getCurrentTenantId();
  const orden = await prisma.tallerOrden.findFirst({
    where: { tenantId, token },
    include: {
      vehiculo: { select: { patente: true, marca: true, modelo: true } },
      client: { select: { name: true } },
      items: { orderBy: [{ posicion: "asc" }, { createdAt: "asc" }] },
      fotos: { where: { visibleCliente: true }, orderBy: { createdAt: "asc" }, select: { id: true, momento: true, datos: true } },
      pagos: { select: { monto: true } },
    },
  });
  if (!orden) return null;
  const [config, negocio] = await Promise.all([configTaller(tenantId), datosDelNegocio(tenantId)]);
  const t = totales(orden.items);
  const pagado = redondear(orden.pagos.reduce((s, p) => s + p.monto, 0));
  return { orden, config, negocio, totales: t, pagado, saldo: redondear(t.aprobado - pagado) };
}
