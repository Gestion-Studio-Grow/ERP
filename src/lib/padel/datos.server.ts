import "server-only";

// ============================================================================
// PADEL-CLASES — lecturas. Todo acotado por negocio (`tenantId`), y las pantallas del panel
// piden su permiso antes de llamar (requireApp). El turnero y el link del alumno son
// públicos: el negocio sale del dominio y el alumno, del token.
// ============================================================================

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { resolveLocation } from "@/lib/settings";
import { businessWallTimeToUtc, dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  CLAVES_PLANTILLA,
  ESTADOS_QUE_OCUPAN,
  PLANTILLAS_DEFAULT,
  diaCorto,
  esDeuda,
  estadoEnPantalla,
  franjasLibres,
  saldoAFavor,
  tokenValido,
  totalDeuda,
  totalEnRevision,
  type ClavePlantilla,
  type EstadoClase,
  type EstadoPago,
  type Franja,
} from "./core";

const DIA = 86_400_000;

export interface ConfigPadel {
  duracionMin: number;
  precioIndividual: number;
  precioGrupal: number;
  aliasCbu: string;
  titularCuenta: string;
  anticipacionMin: number;
  diasAdelante: number;
  maxPendientesPorTel: number;
  whatsappProfe: string;
  plantillas: Record<ClavePlantilla, string>;
}

export async function configPadel(tenantId: string): Promise<ConfigPadel> {
  const c = await prisma.padelConfig.findUnique({ where: { tenantId } });
  const p = (c?.plantillas ?? {}) as Record<string, unknown>;
  const plantillas = { ...PLANTILLAS_DEFAULT };
  for (const k of CLAVES_PLANTILLA) {
    if (typeof p[k] === "string" && (p[k] as string).trim()) plantillas[k] = p[k] as string;
  }
  return {
    duracionMin: c?.duracionMin ?? 60,
    precioIndividual: Number(c?.precioIndividual ?? 0),
    precioGrupal: Number(c?.precioGrupal ?? 0),
    aliasCbu: c?.aliasCbu ?? "",
    titularCuenta: c?.titularCuenta ?? "",
    anticipacionMin: c?.anticipacionMin ?? 120,
    diasAdelante: c?.diasAdelante ?? 14,
    maxPendientesPorTel: c?.maxPendientesPorTel ?? 2,
    whatsappProfe: c?.whatsappProfe ?? "",
    plantillas,
  };
}

/** Nombre, link y contacto del negocio (van en la cabecera y en los mensajes). */
export async function datosDelNegocio(tenantId: string) {
  const [tenant, fila, config] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } }),
    prisma.businessSettings.findUnique({ where: { tenantId } }),
    configPadel(tenantId),
  ]);
  const loc = resolveLocation(fila);
  return {
    nombre: tenant?.name ?? "Clases de pádel",
    slug: tenant?.slug ?? "",
    /** El primer nombre del profe, para los mensajes ("Hola Matías!"). */
    profe: (tenant?.name ?? "").replace(/^profe\s+/i, "").split(/[\s—-]+/)[0] || "profe",
    // Dirección y horario SÓLO si el profe los cargó: los defaults de getLocation() son los de
    // CH Estética (La Alameda, Canning) y no pueden aparecer en el turnero de otro negocio.
    lugar: [fila?.addressLine, fila?.city].filter(Boolean).join(", "),
    horario: fila?.hoursLabel ?? "",
    whatsapp: config.whatsappProfe || loc.whatsapp || "",
    instagramUrl: loc.instagramUrl,
    instagramLabel: loc.instagramLabel,
  };
}

export async function franjas(tenantId: string): Promise<Franja[]> {
  const filas = await prisma.padelDisponibilidad.findMany({ where: { tenantId }, orderBy: [{ diaSemana: "asc" }, { desde: "asc" }] });
  return filas.map((f) => ({
    diaSemana: f.diaSemana,
    fecha: f.fecha ? f.fecha.toISOString().slice(0, 10) : null,
    desde: f.desde,
    hasta: f.hasta,
    tipo: f.tipo === "NO" ? "NO" : "DA",
  }));
}

const sumarDiasCalendario = (fecha: string, n: number): string =>
  new Date(new Date(`${fecha}T12:00:00.000Z`).getTime() + n * DIA).toISOString().slice(0, 10);

/** Clases vivas (ocupan la franja) entre dos instantes. */
async function ocupadasEntre(tenantId: string, desde: Date, hasta: Date) {
  return prisma.padelClase.findMany({
    where: { tenantId, estado: { in: [...ESTADOS_QUE_OCUPAN] }, empiezaEn: { lt: hasta }, terminaEn: { gt: desde } },
    select: { id: true, empiezaEn: true, terminaEn: true },
  });
}

export interface DiaConLugar {
  fecha: string;
  etiqueta: string;
  horas: string[];
}

/**
 * Lo que muestra el turnero: los próximos días con al menos un horario libre. Una sola
 * lectura de clases para todo el rango; el armado de franjas es puro (core.ts).
 */
export async function agendaPublica(tenantId: string, ahora = new Date()): Promise<DiaConLugar[]> {
  const [config, fr] = await Promise.all([configPadel(tenantId), franjas(tenantId)]);
  const hoy = todayInBusinessTz();
  const ultimo = sumarDiasCalendario(hoy, config.diasAdelante);
  const ocupadas = await ocupadasEntre(tenantId, businessWallTimeToUtc(hoy, "00:00"), businessWallTimeToUtc(ultimo, "23:59"));
  const intervalos = ocupadas.map((o) => ({ startsAt: o.empiezaEn, endsAt: o.terminaEn }));
  const dias: DiaConLugar[] = [];
  for (let i = 0; i < config.diasAdelante; i++) {
    const fecha = sumarDiasCalendario(hoy, i);
    const horas = franjasLibres({ fecha, franjas: fr, ocupadas: intervalos, duracionMin: config.duracionMin, anticipacionMin: config.anticipacionMin, ahora });
    if (horas.length > 0) dias.push({ fecha, etiqueta: i === 0 ? "Hoy" : i === 1 ? "Mañana" : diaCorto(fecha), horas });
  }
  return dias;
}

/** ¿Está libre y dentro de la grilla? El servidor lo vuelve a mirar antes de escribir. */
export async function libresDelDia(tenantId: string, fecha: string, ahora = new Date(), excluirClaseId?: string) {
  const [config, fr] = await Promise.all([configPadel(tenantId), franjas(tenantId)]);
  const ocupadas = (await ocupadasEntre(tenantId, businessWallTimeToUtc(fecha, "00:00"), businessWallTimeToUtc(fecha, "23:59")))
    .filter((o) => o.id !== excluirClaseId)
    .map((o) => ({ startsAt: o.empiezaEn, endsAt: o.terminaEn }));
  return { config, libres: franjasLibres({ fecha, franjas: fr, ocupadas, duracionMin: config.duracionMin, anticipacionMin: config.anticipacionMin, ahora }) };
}

// ── Pedidos que nadie contestó ──────────────────────────────────────────────

/**
 * PEDIDA cuya hora ya pasó → SIN_RESPUESTA (`transicionClase(…, "vencer", "sistema")`). Perezoso y
 * barato: un updateMany por índice [tenantId, estado] al abrir Hoy, la bandeja o el link del
 * alumno. Así un pedido vencido no queda en «Pagar» ni ocupa la franja. El cron llega en T6.
 */
export async function vencerPedidos(tenantId: string, ahora = new Date(), alumnoId?: string): Promise<number> {
  const r = await prisma.padelClase.updateMany({
    where: { tenantId, ...(alumnoId ? { alumnoId } : {}), estado: "PEDIDA", empiezaEn: { lt: ahora } },
    data: { estado: "SIN_RESPUESTA" },
  });
  return r.count;
}

/**
 * O-6: desde el link público (sin login) el vencimiento va frenado y acotado: sólo los pedidos de
 * ESE alumno y a lo sumo una escritura por minuto por alumno, abra el link quien lo abra. Lo que se
 * muestra igual sale bien: `estadoEnPantalla` ve como vencido un pedido cuya hora pasó.
 */
const frenoDeVencerPublico = createRateLimiter({ max: 1, windowMs: 60_000 });
async function vencerPedidosDelAlumno(tenantId: string, alumnoId: string, ahora: Date): Promise<void> {
  const clave = `padel-vencer:${tenantId}:${alumnoId}`;
  if (frenoDeVencerPublico.blocked(clave)) return;
  frenoDeVencerPublico.fail(clave);
  await vencerPedidos(tenantId, ahora, alumnoId);
}

/** Los pagos que entran en el saldo a favor (acreditados y usados), para derivarlo. */
const FILTRO_SALDO = { OR: [{ pagoEstado: "ACREDITADO" }, { pagoEstado: "PAGADO", pagoMedio: "SALDO_A_FAVOR" }] };

/** El saldo a favor de un alumno, derivado de sus clases (no es una columna: no se desincroniza). */
export async function saldoDelAlumno(tenantId: string, alumnoId: string): Promise<number> {
  const filas = await prisma.padelClase.findMany({ where: { tenantId, alumnoId, ...FILTRO_SALDO }, select: { estado: true, pagoEstado: true, pagoMedio: true, precio: true } });
  return saldoAFavor(filas.map((f) => ({ ...f, precio: Number(f.precio) })));
}

// ── Panel del profe ─────────────────────────────────────────────────────────

const conAlumno = {
  alumno: { select: { id: true, token: true, nivel: true, _count: { select: { clases: { where: { estado: "DADA" } } } } } },
  client: { select: { name: true, phone: true } },
} as const;

export type ClasePanel = {
  id: string;
  empiezaEn: Date;
  terminaEn: Date;
  tipo: string;
  personas: number;
  estado: EstadoClase;
  origen: string;
  precio: number;
  pagoEstado: EstadoPago;
  pagoMedio: string | null;
  tieneComprobante: boolean;
  /** La foto del comprobante, sólo mientras está por revisar (para validarla ahí mismo). */
  comprobante: string | null;
  alumnoId: string;
  token: string;
  nombre: string;
  telefono: string;
  dadas: number;
};

type FilaClase = Awaited<ReturnType<typeof clasesDe>>[number];

function aPanel(c: FilaClase): ClasePanel {
  return {
    id: c.id,
    empiezaEn: c.empiezaEn,
    terminaEn: c.terminaEn,
    tipo: c.tipo,
    personas: c.personas,
    estado: c.estado as EstadoClase,
    origen: c.origen,
    precio: Number(c.precio),
    pagoEstado: c.pagoEstado as EstadoPago,
    pagoMedio: c.pagoMedio,
    tieneComprobante: !!c.comprobanteEnviadoEl,
    comprobante: c.pagoEstado === "EN_REVISION" ? c.comprobante : null,
    alumnoId: c.alumno.id,
    token: c.alumno.token,
    nombre: c.client.name,
    telefono: c.client.phone,
    dadas: c.alumno._count.clases,
  };
}

function clasesDe(tenantId: string, where: Record<string, unknown>) {
  return prisma.padelClase.findMany({
    where: { tenantId, ...where },
    orderBy: { empiezaEn: "asc" },
    select: {
      id: true, empiezaEn: true, terminaEn: true, tipo: true, personas: true, estado: true, origen: true, precio: true,
      pagoEstado: true, pagoMedio: true, comprobanteEnviadoEl: true, comprobante: true, ...conAlumno,
    },
  });
}

/** La pantalla "Hoy": la próxima clase arriba, el resto del día, mañana y lo pendiente. */
export async function hoy(ahora = new Date()) {
  const tenantId = await getCurrentTenantId();
  const fecha = todayInBusinessTz();
  const manana = sumarDiasCalendario(fecha, 1);
  const inicio = businessWallTimeToUtc(fecha, "00:00");
  const finManana = businessWallTimeToUtc(sumarDiasCalendario(fecha, 2), "00:00");
  await vencerPedidos(tenantId, ahora);
  const [filas, pendientes, cobradoHoy, config, negocio] = await Promise.all([
    // SIN_RESPUESTA también (O-3): si el alumno vino igual, el profe la da y la cobra desde acá.
    clasesDe(tenantId, { empiezaEn: { gte: inicio, lt: finManana }, estado: { in: ["PEDIDA", "CONFIRMADA", "DADA", "AUSENTE", "SIN_RESPUESTA"] } }),
    contarPendientes(tenantId),
    // Lo que entró hoy: lo pagado (y lo que después quedó a favor: la plata igual entró). Lo pagado
    // con saldo a favor NO suma: esa plata ya se contó el día que entró.
    prisma.padelClase.findMany({
      where: {
        tenantId,
        pagoEstado: { in: ["PAGADO", "ACREDITADO"] },
        pagoValidadoEl: { gte: inicio },
        OR: [{ pagoMedio: null }, { pagoMedio: { not: "SALDO_A_FAVOR" } }],
      },
      select: { precio: true, pagoMedio: true },
    }),
    configPadel(tenantId),
    datosDelNegocio(tenantId),
  ]);
  const clases = filas.map(aPanel);
  const deHoy = clases.filter((c) => dateStrInBusinessTz(c.empiezaEn) === fecha);
  const deManana = clases.filter((c) => dateStrInBusinessTz(c.empiezaEn) === manana);
  // La "próxima": la que está en curso o la primera que viene, sin terminar de gestionar.
  const proxima =
    deHoy.find((c) => ["CONFIRMADA", "PEDIDA"].includes(c.estado) && c.terminaEn.getTime() > ahora.getTime()) ??
    deHoy.find((c) => esDeuda(c)) ??
    null;
  const porMedio: Record<string, number> = {};
  for (const c of cobradoHoy) porMedio[c.pagoMedio ?? "TRANSFERENCIA"] = (porMedio[c.pagoMedio ?? "TRANSFERENCIA"] ?? 0) + Number(c.precio);
  const total = Object.values(porMedio).reduce((s, v) => s + v, 0);
  return { fecha, proxima, deHoy, deManana, pendientes, caja: { total, porMedio }, config, negocio };
}

/** Los avisos que esperan que el profe los lea (suman al número de la campana). */
export const AVISOS_QUE_ESPERAN = ["cancelacion", "respuesta", "link-pedido"] as const;

/** Lo que espera al profe: pedidos sin confirmar, comprobantes por revisar y avisos sin leer. */
export async function contarPendientes(tenantId: string): Promise<number> {
  const ahora = new Date();
  const [pedidos, comprobantes, avisos] = await Promise.all([
    prisma.padelClase.count({ where: { tenantId, estado: "PEDIDA", empiezaEn: { gt: ahora } } }),
    prisma.padelClase.count({ where: { tenantId, pagoEstado: "EN_REVISION" } }),
    prisma.padelAviso.count({ where: { tenantId, destino: "PROFE", leidoEl: null, tipo: { in: [...AVISOS_QUE_ESPERAN] } } }),
  ]);
  return pedidos + comprobantes + avisos;
}

/** El número del badge, para la barra del panel. */
export async function badgePendientes(): Promise<number> {
  return contarPendientes(await getCurrentTenantId());
}

export async function pendientes() {
  const tenantId = await getCurrentTenantId();
  const ahora = new Date();
  await vencerPedidos(tenantId, ahora);
  const [pedidos, comprobantes, avisos, config] = await Promise.all([
    clasesDe(tenantId, { estado: "PEDIDA", empiezaEn: { gt: ahora } }),
    prisma.padelClase.findMany({
      where: { tenantId, pagoEstado: "EN_REVISION" },
      orderBy: { comprobanteEnviadoEl: "asc" },
      select: { id: true, empiezaEn: true, precio: true, comprobante: true, comprobanteEnviadoEl: true, estado: true, ...conAlumno },
    }),
    prisma.padelAviso.findMany({
      where: { tenantId, destino: "PROFE", createdAt: { gte: new Date(ahora.getTime() - 3 * DIA) } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, tipo: true, texto: true, leidoEl: true, createdAt: true },
    }),
    configPadel(tenantId),
  ]);
  return {
    pedidos: pedidos.map(aPanel),
    comprobantes: comprobantes.map((c) => ({
      id: c.id,
      empiezaEn: c.empiezaEn,
      precio: Number(c.precio),
      comprobante: c.comprobante,
      enviadoEl: c.comprobanteEnviadoEl,
      estado: c.estado,
      nombre: c.client.name,
      telefono: c.client.phone,
      token: c.alumno.token,
    })),
    avisos,
    config,
  };
}

/** Siete días desde `desde` (YYYY-MM-DD), con las clases de cada día. */
export async function semana(desde: string) {
  const tenantId = await getCurrentTenantId();
  const fin = sumarDiasCalendario(desde, 7);
  const filas = await clasesDe(tenantId, {
    empiezaEn: { gte: businessWallTimeToUtc(desde, "00:00"), lt: businessWallTimeToUtc(fin, "00:00") },
    estado: { in: ["PEDIDA", "CONFIRMADA", "DADA", "AUSENTE", "SIN_RESPUESTA"] },
  });
  const clases = filas.map(aPanel);
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = sumarDiasCalendario(desde, i);
    return { fecha, clases: clases.filter((c) => dateStrInBusinessTz(c.empiezaEn) === fecha) };
  });
}

export async function alumnos(q = "") {
  const tenantId = await getCurrentTenantId();
  const texto = q.trim();
  const filas = await prisma.padelAlumno.findMany({
    where: {
      tenantId,
      ...(texto ? { client: { OR: [{ name: { contains: texto, mode: "insensitive" as const } }, { phone: { contains: texto.replace(/\D/g, "") || texto } }] } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: {
      id: true,
      token: true,
      nivel: true,
      client: { select: { name: true, phone: true } },
      clases: { orderBy: { empiezaEn: "desc" }, take: 1, select: { empiezaEn: true, estado: true } },
      _count: { select: { clases: { where: { estado: "DADA" } } } },
    },
  });
  // La deuda con la MISMA regla que el link del alumno (esDeuda): DADA, con precio, sin pagar y sin
  // comprobante por revisar. Lo que está en revisión va aparte (esEnRevision), como en el link (O-5).
  const [deudas, revision, conSaldo] = await Promise.all([
    prisma.padelClase.groupBy({
      by: ["alumnoId"],
      where: { tenantId, estado: "DADA", precio: { gt: 0 }, pagoEstado: { notIn: ["PAGADO", "ACREDITADO", "DEVUELTO", "EN_REVISION"] } },
      _sum: { precio: true },
    }),
    prisma.padelClase.groupBy({
      by: ["alumnoId"],
      where: { tenantId, estado: { in: ["DADA", "CONFIRMADA"] }, precio: { gt: 0 }, pagoEstado: "EN_REVISION" },
      _sum: { precio: true },
    }),
    prisma.padelClase.findMany({
      where: { tenantId, ...FILTRO_SALDO },
      orderBy: { empiezaEn: "desc" },
      select: { id: true, alumnoId: true, estado: true, pagoEstado: true, pagoMedio: true, precio: true },
    }),
  ]);
  const debe = new Map(deudas.map((d) => [d.alumnoId, Number(d._sum.precio ?? 0)]));
  const enRevisionDe = new Map(revision.map((d) => [d.alumnoId, Number(d._sum.precio ?? 0)]));
  const saldoPor = new Map<string, { estado: string; pagoEstado: string; pagoMedio: string | null; precio: number; id: string }[]>();
  for (const c of conSaldo) saldoPor.set(c.alumnoId, [...(saldoPor.get(c.alumnoId) ?? []), { ...c, precio: Number(c.precio) }]);
  const aFavorDe = (id: string) => {
    const clases = saldoPor.get(id) ?? [];
    const saldo = saldoAFavor(clases);
    // «Le devolví» marca una clase acreditada que entre en el saldo (nunca deja el saldo negativo).
    const devolver = clases.find((c) => c.pagoEstado === "ACREDITADO" && c.precio <= saldo) ?? null;
    return { aFavor: saldo, devolverId: devolver?.id ?? null, devolverMonto: devolver?.precio ?? 0 };
  };
  return filas.map((a) => ({
    id: a.id,
    token: a.token,
    nivel: a.nivel,
    nombre: a.client.name,
    telefono: a.client.phone,
    dadas: a._count.clases,
    ultima: a.clases[0]?.empiezaEn ?? null,
    debe: debe.get(a.id) ?? 0,
    enRevision: enRevisionDe.get(a.id) ?? 0,
    ...aFavorDe(a.id),
  }));
}

export async function configCompleta() {
  const tenantId = await getCurrentTenantId();
  const [config, fr, negocio] = await Promise.all([configPadel(tenantId), franjas(tenantId), datosDelNegocio(tenantId)]);
  const bloqueos = await prisma.padelDisponibilidad.findMany({
    where: { tenantId, fecha: { gte: new Date(`${todayInBusinessTz()}T00:00:00.000Z`) } },
    orderBy: { fecha: "asc" },
  });
  return { config, franjas: fr.filter((f) => f.fecha === null), bloqueos, negocio };
}

// ── Link del alumno (sin login): la llave es el token ──────────────────────

const SELECT_CLASE_ALUMNO = {
  id: true, empiezaEn: true, terminaEn: true, tipo: true, personas: true, estado: true, precio: true,
  pagoEstado: true, pagoMedio: true, comprobanteEnviadoEl: true, pagoNota: true,
} as const;

/**
 * Lo que ve el alumno en su link. Antes eran las últimas 12 clases: una deuda vieja (la 14ª) no
 * aparecía. Ahora son tres lecturas chicas: lo que viene, TODO lo pagable y las últimas 10
 * pasadas; más las filas del saldo a favor.
 */
export async function alumnoPublico(token: string) {
  if (!tokenValido(token)) return null;
  const tenantId = await getCurrentTenantId();
  const alumno = await prisma.padelAlumno.findFirst({
    where: { tenantId, token },
    select: { id: true, token: true, client: { select: { name: true, phone: true } }, _count: { select: { clases: { where: { estado: "DADA" } } } } },
  });
  if (!alumno) return null;
  const ahora = new Date();
  await vencerPedidosDelAlumno(tenantId, alumno.id, ahora);
  const delAlumno = { tenantId, alumnoId: alumno.id };
  const [futuras, pagables, pasadas, saldo, config, negocio] = await Promise.all([
    prisma.padelClase.findMany({ where: { ...delAlumno, terminaEn: { gt: ahora } }, orderBy: { empiezaEn: "asc" }, take: 20, select: SELECT_CLASE_ALUMNO }),
    prisma.padelClase.findMany({
      where: {
        ...delAlumno,
        precio: { gt: 0 },
        OR: [{ estado: "DADA", pagoEstado: { notIn: ["PAGADO", "ACREDITADO", "DEVUELTO"] } }, { estado: "CONFIRMADA", pagoEstado: { in: ["PENDIENTE", "EN_REVISION"] } }],
      },
      orderBy: { empiezaEn: "asc" },
      select: SELECT_CLASE_ALUMNO,
    }),
    prisma.padelClase.findMany({ where: { ...delAlumno, terminaEn: { lte: ahora } }, orderBy: { empiezaEn: "desc" }, take: 10, select: SELECT_CLASE_ALUMNO }),
    prisma.padelClase.findMany({ where: { ...delAlumno, ...FILTRO_SALDO }, select: { estado: true, pagoEstado: true, pagoMedio: true, precio: true } }),
    configPadel(tenantId),
    datosDelNegocio(tenantId),
  ]);
  const porId = new Map<string, (typeof futuras)[number]>();
  for (const c of [...futuras, ...pagables, ...pasadas]) porId.set(c.id, c);
  const clases = [...porId.values()]
    .map((c) => ({ ...c, precio: Number(c.precio), estado: estadoEnPantalla(c.estado as EstadoClase, c.empiezaEn, ahora), pagoEstado: c.pagoEstado as EstadoPago }))
    .sort((a, b) => +b.empiezaEn - +a.empiezaEn);
  const saldoAFavorAlumno = saldoAFavor(saldo.map((f) => ({ ...f, precio: Number(f.precio) })));
  return {
    alumno: { ...alumno, clases, dadas: alumno._count.clases, debe: totalDeuda(clases), enRevision: totalEnRevision(clases), saldoAFavor: saldoAFavorAlumno },
    config,
    negocio,
  };
}
