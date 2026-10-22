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
import { bienvenidaVista } from "./config-campos";
import { modeloT4 } from "./modelo.server";
import { reservasEntre } from "./datos-modelo.server";
import {
  CLAVES_PLANTILLA,
  ESTADOS_QUE_OCUPAN,
  MOTIVO_AUSENTE_SE_COBRA,
  MOTIVO_TARDIA_SE_COBRA,
  PAGOS_SIN_DEUDA,
  PLANTILLAS_DEFAULT,
  REGLAS_DE_FABRICA,
  diaCorto,
  esDeuda,
  esEnRevision,
  estadoEnPantalla,
  franjasLibres,
  huecosDelDia,
  masCercanas,
  saldoAFavor,
  semanaDesdeLunes,
  sumarDias,
  tokenValido,
  totalDeuda,
  totalEnRevision,
  ventanasDelDia,
  type ClavePlantilla,
  type EstadoClase,
  type EstadoPago,
  type Franja,
  type ReglasPadel,
  linkWhatsApp,
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
  /** El profe ya pasó por la Bienvenida y tocó «Ir a Hoy» (O-9): Hoy no lo rebota. */
  bienvenidaVista?: boolean;
  /**
   * T4: las reglas nuevas (tardía/no vino se cobra, confirmar conocidos, cierre automático, traslado
   * de fábrica). Sin la migración, las de fábrica (REGLAS_DE_FABRICA): todo sigue como antes.
   */
  reglas: ReglasPadel;
  /** T4: ¿la base tiene la migración nueva? Las pantallas de la T5 esconden lo que todavía no anda. */
  modeloT4: boolean;
}

/**
 * Las columnas de PadelConfig que existen desde la T1-T3. NUNCA se lee el registro entero: en una
 * base sin la migración T4 Prisma pediría columnas que no existen (src/lib/padel/modelo.ts).
 */
const SELECT_CONFIG = {
  duracionMin: true, precioIndividual: true, precioGrupal: true, aliasCbu: true, titularCuenta: true, anticipacionMin: true,
  diasAdelante: true, maxPendientesPorTel: true, whatsappProfe: true, plantillas: true,
} as const;

/** Las reglas de la T4: se piden (en la MISMA consulta) sólo si la base las tiene. */
const selectReglas = (t4: boolean) =>
  ({ ausenteSeCobra: t4, tardiaSeCobra: t4, confirmarConocidos: t4, cierreAutoHoras: t4, recordatorioHora: t4, trasladoMinDefault: t4 }) as const;

export async function configPadel(tenantId: string): Promise<ConfigPadel> {
  const t4 = await modeloT4();
  const c = await prisma.padelConfig.findUnique({ where: { tenantId }, select: { ...SELECT_CONFIG, ...selectReglas(t4) } });
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
    bienvenidaVista: bienvenidaVista(c?.plantillas),
    reglas:
      t4 && c
        ? {
            ausenteSeCobra: c.ausenteSeCobra,
            tardiaSeCobra: c.tardiaSeCobra,
            confirmarConocidos: c.confirmarConocidos,
            cierreAutoHoras: c.cierreAutoHoras,
            recordatorioHora: c.recordatorioHora ?? null,
            trasladoMinDefault: c.trasladoMinDefault,
          }
        : { ...REGLAS_DE_FABRICA },
    modeloT4: t4,
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
  // `select` explícito (schema-ahead): `clubId` (T4) sólo si la base lo tiene.
  const t4 = await modeloT4();
  const filas = await prisma.padelDisponibilidad.findMany({
    where: { tenantId },
    orderBy: [{ diaSemana: "asc" }, { desde: "asc" }],
    select: { diaSemana: true, fecha: true, desde: true, hasta: true, tipo: true, clubId: t4 },
  });
  return filas.map((f) => ({
    diaSemana: f.diaSemana,
    fecha: f.fecha ? f.fecha.toISOString().slice(0, 10) : null,
    desde: f.desde,
    hasta: f.hasta,
    tipo: f.tipo === "NO" ? "NO" : "DA",
    // T4: el club del tramo (undefined sin la migración).
    ...(t4 ? { clubId: f.clubId ?? null } : {}),
  }));
}

const sumarDiasCalendario = (fecha: string, n: number): string =>
  new Date(new Date(`${fecha}T12:00:00.000Z`).getTime() + n * DIA).toISOString().slice(0, 10);

/**
 * Clases vivas (ocupan la franja) entre dos instantes, más lo que reservan los turnos fijos que
 * todavía no son clase (M-116, T4: sin la migración no hay series y no suma nada).
 */
async function ocupadasEntre(tenantId: string, desde: Date, hasta: Date) {
  const [clases, reservadas] = await Promise.all([
    prisma.padelClase.findMany({
      where: { tenantId, estado: { in: [...ESTADOS_QUE_OCUPAN] }, empiezaEn: { lt: hasta }, terminaEn: { gt: desde } },
      select: { id: true, empiezaEn: true, terminaEn: true },
    }),
    reservasEntre(tenantId, desde, hasta),
  ]);
  return [...clases, ...reservadas];
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

/**
 * ¿Está libre y dentro de la grilla? El servidor lo vuelve a mirar antes de escribir.
 * `opts.anticipacionMin`: el profe pide sus huecos sin anticipación (0); el alumno, con la del
 * profe. `opts.duracionMin`: para mover una clase que dura distinto que la de fábrica.
 */
export async function libresDelDia(
  tenantId: string,
  fecha: string,
  ahora = new Date(),
  excluirClaseId?: string,
  opts: { anticipacionMin?: number; duracionMin?: number } = {},
) {
  const [config, fr] = await Promise.all([configPadel(tenantId), franjas(tenantId)]);
  const ocupadas = (await ocupadasEntre(tenantId, businessWallTimeToUtc(fecha, "00:00"), businessWallTimeToUtc(fecha, "23:59")))
    .filter((o) => o.id !== excluirClaseId)
    .map((o) => ({ startsAt: o.empiezaEn, endsAt: o.terminaEn }));
  const anticipacionMin = opts.anticipacionMin ?? config.anticipacionMin;
  const duracionMin = opts.duracionMin ?? config.duracionMin;
  return { config, libres: franjasLibres({ fecha, franjas: fr, ocupadas, duracionMin, anticipacionMin, ahora }) };
}

/**
 * Los inicios libres de `dias` días seguidos desde `desde`, con UNA lectura de clases para todo el
 * rango (para «Se suspende → Moverlas» y «Bloquear días → Moverlas»: buscar huecos en la semana).
 */
export async function libresEnRango(
  tenantId: string,
  desde: string,
  dias: number,
  opts: { anticipacionMin?: number; duracionMin?: number; ahora?: Date } = {},
): Promise<string[]> {
  const n = Math.min(45, Math.max(1, dias));
  const [config, fr] = await Promise.all([configPadel(tenantId), franjas(tenantId)]);
  const hasta = sumarDias(desde, n);
  const ocupadas = (await ocupadasEntre(tenantId, businessWallTimeToUtc(desde, "00:00"), businessWallTimeToUtc(hasta, "00:00"))).map((o) => ({ startsAt: o.empiezaEn, endsAt: o.terminaEn }));
  const ahora = opts.ahora ?? new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      ...franjasLibres({
        fecha: sumarDias(desde, i),
        franjas: fr,
        ocupadas,
        duracionMin: opts.duracionMin ?? config.duracionMin,
        anticipacionMin: opts.anticipacionMin ?? config.anticipacionMin,
        ahora,
      }),
    );
  }
  return out.sort();
}

/**
 * Las `n` horas libres más cercanas a `cerca` (ese día y el siguiente), sin contar la clase
 * `excluir`: para «No puedo → ¿Le ofrecés otro?» (M-043) y para el «se ocupó recién» del alumno.
 */
export async function libresCercanos(
  tenantId: string,
  cerca: Date,
  p: { excluir?: string; n?: number; anticipacionMin?: number; duracionMin?: number; ahora?: Date } = {},
): Promise<string[]> {
  const fecha = dateStrInBusinessTz(cerca);
  const ahora = p.ahora ?? new Date();
  const opts = { anticipacionMin: p.anticipacionMin, duracionMin: p.duracionMin };
  const [a, b] = await Promise.all([
    libresDelDia(tenantId, fecha, ahora, p.excluir, opts),
    libresDelDia(tenantId, sumarDias(fecha, 1), ahora, p.excluir, opts),
  ]);
  return masCercanas([...a.libres, ...b.libres], cerca, p.n ?? 3);
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
  /** Texto libre: el motivo de la cancelación, o si «No vino» se cobra (MOTIVO_AUSENTE_SE_COBRA). */
  motivoCancel: string | null;
  tieneComprobante: boolean;
  /** La foto del comprobante, sólo mientras está por revisar (para validarla ahí mismo). */
  comprobante: string | null;
  alumnoId: string;
  token: string;
  nombre: string;
  telefono: string;
  dadas: number;
  /**
   * T4 (null / 0 sin la migración): lo ya pagado (pago parcial, M-124), el club, el turno fijo del
   * que salió, el paquete con que se pagó, el cupo de la grupal abierta, la nota del profe y lo que
   * cuesta la cancha de esa clase.
   */
  pagado: number;
  clubId: string | null;
  serieId: string | null;
  paqueteAlumnoId: string | null;
  cupo: number | null;
  nota: string | null;
  costoCancha: number | null;
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
    motivoCancel: c.motivoCancel,
    tieneComprobante: !!c.comprobanteEnviadoEl,
    comprobante: c.pagoEstado === "EN_REVISION" ? c.comprobante : null,
    alumnoId: c.alumno.id,
    token: c.alumno.token,
    nombre: c.client.name,
    telefono: c.client.phone,
    dadas: c.alumno._count.clases,
    pagado: Number(c.pagado ?? 0),
    clubId: c.clubId ?? null,
    serieId: c.serieId ?? null,
    paqueteAlumnoId: c.paqueteAlumnoId ?? null,
    cupo: c.cupo ?? null,
    nota: c.nota ?? null,
    costoCancha: c.costoCancha == null ? null : Number(c.costoCancha),
  };
}

/** Las columnas de la T4 de PadelClase, pedidas sólo si la base las tiene (src/lib/padel/modelo.ts). */
export const selectClaseT4 = (t4: boolean) =>
  ({ pagado: t4, clubId: t4, serieId: t4, paqueteAlumnoId: t4, cupo: t4, nota: t4, costoCancha: t4 }) as const;

async function clasesDe(tenantId: string, where: Record<string, unknown>) {
  const t4 = await modeloT4();
  return prisma.padelClase.findMany({
    where: { tenantId, ...where },
    orderBy: { empiezaEn: "asc" },
    select: {
      id: true, empiezaEn: true, terminaEn: true, tipo: true, personas: true, estado: true, origen: true, precio: true,
      pagoEstado: true, pagoMedio: true, motivoCancel: true, comprobanteEnviadoEl: true, comprobante: true, ...conAlumno,
      ...selectClaseT4(t4),
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
  const [filas, pendientes, cobradoHoy, config, negocio, sinCerrar, pedidos, fr, recordados] = await Promise.all([
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
    // F10/M-044: «Ayer quedaron sin cerrar»: confirmadas que terminaron antes de hoy (últimos 7 días).
    clasesDe(tenantId, { estado: "CONFIRMADA", terminaEn: { lt: inicio, gte: new Date(inicio.getTime() - 7 * DIA) } }),
    // «Esperan tu respuesta»: pedidos futuros (de hoy o de cualquier día).
    clasesDe(tenantId, { estado: "PEDIDA", empiezaEn: { gt: ahora } }),
    franjas(tenantId),
    // M-041: «recordado ✓» = el recordatorio de hoy que salió (el profe tocó el link o lo mandó la Cloud API).
    prisma.padelAviso.findMany({
      where: { tenantId, destino: "ALUMNO", tipo: "recordatorio", enviadoEl: { not: null }, createdAt: { gte: inicio }, claseId: { not: null } },
      select: { claseId: true },
    }),
  ]);
  const clases = filas.map(aPanel);
  // Los huecos de lo que queda de hoy, sin anticipación (son para que el profe agende).
  // T4: un turno fijo de hoy que todavía no es clase tampoco es hueco (M-116, del lado del profe).
  const reservadasHoy = (await reservasEntre(tenantId, inicio, finManana)).map((r) => ({ startsAt: r.empiezaEn, endsAt: r.terminaEn }));
  const ocupadasHoy = [...clases.filter((c) => ESTADOS_QUE_OCUPAN.includes(c.estado)).map((c) => ({ startsAt: c.empiezaEn, endsAt: c.terminaEn })), ...reservadasHoy];
  const huecos = huecosDelDia({ fecha, franjas: fr, ocupadas: ocupadasHoy, duracionMin: config.duracionMin, ahora });
  const recordadas = [...new Set(recordados.map((r) => r.claseId).filter((x): x is string => Boolean(x)))];
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
  return {
    fecha, proxima, deHoy, deManana, pendientes, caja: { total, porMedio }, config, negocio,
    sinCerrar: sinCerrar.map(aPanel),
    pedidos: pedidos.map(aPanel),
    huecos,
    /** Ids de las clases con el recordatorio de hoy ya mandado (array: viaja serializado a la pantalla). */
    recordadas,
  };
}

/** Los avisos que esperan que el profe los lea (suman al número de la campana). */
export const AVISOS_QUE_ESPERAN = ["cancelacion", "respuesta", "link-pedido", "cambio", "cambio-pedido", "no-voy", "mensaje"] as const;

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

/**
 * La bandeja detrás de la campana: pedidos, comprobantes, avisos y «Sin avisar» (M-034): los
 * WhatsApp armados como link (modo manual) que el profe todavía no mandó — tocó «Después» o se
 * fue —, de los últimos 3 días. Cada uno con su link listo para mandarlo con un toque.
 */
export async function bandeja() {
  const p = await pendientes();
  const tenantId = await getCurrentTenantId();
  const sinAvisar = await prisma.padelAviso.findMany({
    where: { tenantId, destino: "ALUMNO", canal: "WA_LINK", enviadoEl: null, createdAt: { gte: new Date(Date.now() - 3 * DIA) } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, tipo: true, texto: true, claseId: true, createdAt: true, alumno: { select: { client: { select: { name: true, phone: true } } } } },
  });
  const sinAvisarListos = sinAvisar.map((a) => ({
    avisoId: a.id,
    tipo: a.tipo,
    claseId: a.claseId,
    creadoEl: a.createdAt,
    nombre: a.alumno?.client.name ?? "",
    wa: linkWhatsApp(a.alumno?.client.phone, a.texto),
  }));
  return {
    ...p,
    sinAvisar: sinAvisarListos,
    contadores: {
      pedidos: p.pedidos.length,
      comprobantes: p.comprobantes.length,
      avisos: p.avisos.filter((a) => !a.leidoEl).length,
      sinAvisar: sinAvisarListos.length,
    },
  };
}

export interface DiaDeSemana {
  fecha: string;
  clases: ClasePanel[];
  /** Inicios libres (ISO) dentro de la grilla, sin anticipación: tocables para agendar. */
  huecos: string[];
  /** Bloqueos de ese día (lluvia, viaje): desde/hasta en hora de pared. */
  bloqueos: { id: string; desde: string; hasta: string }[];
  /** ¿Ese día el profe da clases? Si no, «No das clases» y no «Libre» (M-059). */
  trabaja: boolean;
}

/**
 * La semana del profe, SIEMPRE desde el lunes de `desde` (M-057): las clases de cada día, los
 * huecos, los bloqueos y los totales (clases, plata esperada y cobrada en la semana).
 * Esperada = precio de PEDIDA + CONFIRMADA + DADA (+ AUSENTE que se cobra). Cobrada = lo pagado en la
 * semana (por `pagoValidadoEl`), sin «Saldo a favor».
 */
export async function semanaDelProfe(desde: string, ahora = new Date()) {
  const tenantId = await getCurrentTenantId();
  const lunes = semanaDesdeLunes(desde);
  const fin = sumarDias(lunes, 7);
  const ini = businessWallTimeToUtc(lunes, "00:00");
  const finUtc = businessWallTimeToUtc(fin, "00:00");
  const [filas, fr, config, bloqueos, cobros] = await Promise.all([
    clasesDe(tenantId, { empiezaEn: { gte: ini, lt: finUtc }, estado: { in: ["PEDIDA", "CONFIRMADA", "DADA", "AUSENTE", "SIN_RESPUESTA"] } }),
    franjas(tenantId),
    configPadel(tenantId),
    prisma.padelDisponibilidad.findMany({
      where: { tenantId, tipo: "NO", fecha: { gte: new Date(`${lunes}T00:00:00.000Z`), lt: new Date(`${fin}T00:00:00.000Z`) } },
      select: { id: true, fecha: true, desde: true, hasta: true },
      orderBy: [{ fecha: "asc" }, { desde: "asc" }],
    }),
    prisma.padelClase.findMany({
      where: { tenantId, pagoEstado: { in: ["PAGADO", "ACREDITADO"] }, pagoValidadoEl: { gte: ini, lt: finUtc }, OR: [{ pagoMedio: null }, { pagoMedio: { not: "SALDO_A_FAVOR" } }] },
      select: { precio: true },
    }),
  ]);
  const clases = filas.map(aPanel);
  // T4: los turnos fijos de la semana que todavía no son clase no son huecos.
  const reservadas = (await reservasEntre(tenantId, ini, finUtc)).map((r) => ({ startsAt: r.empiezaEn, endsAt: r.terminaEn }));
  const ocupadas = [...clases.filter((c) => ESTADOS_QUE_OCUPAN.includes(c.estado)).map((c) => ({ startsAt: c.empiezaEn, endsAt: c.terminaEn })), ...reservadas];
  const dias: DiaDeSemana[] = Array.from({ length: 7 }, (_, i) => {
    const fecha = sumarDias(lunes, i);
    return {
      fecha,
      clases: clases.filter((c) => dateStrInBusinessTz(c.empiezaEn) === fecha),
      huecos: huecosDelDia({ fecha, franjas: fr, ocupadas, duracionMin: config.duracionMin, ahora }),
      bloqueos: bloqueos.filter((b) => b.fecha?.toISOString().slice(0, 10) === fecha).map((b) => ({ id: b.id, desde: b.desde, hasta: b.hasta })),
      trabaja: ventanasDelDia(fecha, fr).ventanas.length > 0,
    };
  });
  const cuentan = clases.filter((c) => ["PEDIDA", "CONFIRMADA", "DADA"].includes(c.estado) || (c.estado === "AUSENTE" && c.motivoCancel === MOTIVO_AUSENTE_SE_COBRA));
  return {
    lunes,
    dias,
    totales: {
      clases: cuentan.length,
      esperado: cuentan.reduce((s, c) => s + c.precio, 0),
      cobrado: cobros.reduce((s, c) => s + Number(c.precio), 0),
    },
  };
}

/** Siete días desde el lunes de `desde`, con las clases de cada día (lo que leía la Semana de antes). */
export async function semana(desde: string) {
  return (await semanaDelProfe(desde)).dias;
}

/**
 * Deuda por alumno con la MISMA regla que el link (esDeuda): DADA, con precio, sin pagar y sin
 * comprobante por revisar; más las AUSENTE que «se cobran igual» (M-045, provisional hasta T4). Lo
 * que está en revisión va aparte (esEnRevision), como en el link (O-5). `alumnoIds` acota a una página.
 */
async function deudaPorAlumno(tenantId: string, alumnoIds?: string[]) {
  const ids = alumnoIds ? { alumnoId: { in: alumnoIds } } : {};
  const t4 = await modeloT4();
  const sinPagar = { precio: { gt: 0 }, pagoEstado: { notIn: [...PAGOS_SIN_DEUDA, "EN_REVISION"] } };
  const [dadas, ausentes, tardias, pagadoParcial, revision] = await Promise.all([
    prisma.padelClase.groupBy({
      by: ["alumnoId"],
      where: { tenantId, ...ids, estado: "DADA", ...sinPagar },
      _sum: { precio: true },
      _count: { _all: true },
    }),
    prisma.padelClase.groupBy({
      by: ["alumnoId"],
      where: { tenantId, ...ids, estado: "AUSENTE", motivoCancel: MOTIVO_AUSENTE_SE_COBRA, ...sinPagar },
      _sum: { precio: true },
      _count: { _all: true },
    }),
    // M-125 (T4): «Cancelada tarde · se cobra» también es deuda (la regla vive en motivoCancel).
    prisma.padelClase.groupBy({
      by: ["alumnoId"],
      where: { tenantId, ...ids, estado: "CANCELADA", motivoCancel: MOTIVO_TARDIA_SE_COBRA, ...sinPagar },
      _sum: { precio: true },
      _count: { _all: true },
    }),
    // M-124 (T4): lo que ya entró como pago parcial de esas mismas clases se descuenta.
    t4
      ? prisma.padelClase.groupBy({
          by: ["alumnoId"],
          where: {
            tenantId, ...ids, ...sinPagar, pagado: { gt: 0 },
            OR: [{ estado: "DADA" }, { estado: "AUSENTE", motivoCancel: MOTIVO_AUSENTE_SE_COBRA }, { estado: "CANCELADA", motivoCancel: MOTIVO_TARDIA_SE_COBRA }],
          },
          _sum: { pagado: true },
        })
      : Promise.resolve([] as { alumnoId: string; _sum: { pagado: unknown } }[]),
    prisma.padelClase.groupBy({
      by: ["alumnoId"],
      where: {
        tenantId, ...ids, precio: { gt: 0 }, pagoEstado: "EN_REVISION",
        OR: [{ estado: { in: ["DADA", "CONFIRMADA"] } }, { estado: "AUSENTE", motivoCancel: MOTIVO_AUSENTE_SE_COBRA }],
      },
      _sum: { precio: true },
    }),
  ]);
  const debe = new Map<string, { total: number; cantidad: number }>();
  for (const d of [...dadas, ...ausentes, ...tardias]) {
    const prev = debe.get(d.alumnoId) ?? { total: 0, cantidad: 0 };
    debe.set(d.alumnoId, { total: prev.total + Number(d._sum.precio ?? 0), cantidad: prev.cantidad + d._count._all });
  }
  for (const p of pagadoParcial) {
    const prev = debe.get(p.alumnoId);
    if (prev) debe.set(p.alumnoId, { ...prev, total: Math.max(0, prev.total - Number(p._sum.pagado ?? 0)) });
  }
  const enRevision = new Map(revision.map((d) => [d.alumnoId, Number(d._sum.precio ?? 0)]));
  return { debe, enRevision };
}

/** Las filas del saldo a favor por alumno, y la clase que «Le devolví» puede marcar sin dejarlo negativo. */
async function saldosPorAlumno(tenantId: string, alumnoIds?: string[]) {
  const conSaldo = await prisma.padelClase.findMany({
    where: { tenantId, ...(alumnoIds ? { alumnoId: { in: alumnoIds } } : {}), ...FILTRO_SALDO },
    orderBy: { empiezaEn: "desc" },
    select: { id: true, alumnoId: true, estado: true, pagoEstado: true, pagoMedio: true, precio: true },
  });
  const saldoPor = new Map<string, { estado: string; pagoEstado: string; pagoMedio: string | null; precio: number; id: string }[]>();
  for (const c of conSaldo) saldoPor.set(c.alumnoId, [...(saldoPor.get(c.alumnoId) ?? []), { ...c, precio: Number(c.precio) }]);
  return (id: string) => {
    const clases = saldoPor.get(id) ?? [];
    const saldo = saldoAFavor(clases);
    // «Le devolví» marca una clase acreditada que entre en el saldo (nunca deja el saldo negativo).
    const devolver = clases.find((c) => c.pagoEstado === "ACREDITADO" && c.precio <= saldo) ?? null;
    return { aFavor: saldo, devolverId: devolver?.id ?? null, devolverMonto: devolver?.precio ?? 0 };
  };
}

/** Tamaño de página de Alumnos (B5: sin tope de 60; el buscador consulta al servidor). */
export const PAGINA_ALUMNOS = 40;

/**
 * Los alumnos (más recientes primero), con lo que deben, lo que está en revisión y el saldo a favor.
 * `cursor`: el id del último de la página anterior. `tamanio`: 60 por defecto (lo que pedían las
 * pantallas de antes); la lista paginada usa `alumnosPagina`.
 */
export async function alumnos(q = "", cursor?: string, tamanio = 60) {
  const tenantId = await getCurrentTenantId();
  const texto = q.trim().slice(0, 60);
  const filas = await prisma.padelAlumno.findMany({
    where: {
      tenantId,
      ...(texto ? { client: { OR: [{ name: { contains: texto, mode: "insensitive" as const } }, { phone: { contains: texto.replace(/\D/g, "") || texto } }] } } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: Math.min(100, Math.max(1, tamanio)),
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      token: true,
      nivel: true,
      client: { select: { name: true, phone: true } },
      clases: { orderBy: { empiezaEn: "desc" }, take: 1, select: { empiezaEn: true, estado: true } },
      _count: { select: { clases: { where: { estado: "DADA" } } } },
    },
  });
  const ids = filas.map((a) => a.id);
  const [{ debe, enRevision }, aFavorDe] = await Promise.all([deudaPorAlumno(tenantId, ids), saldosPorAlumno(tenantId, ids)]);
  return filas.map((a) => ({
    id: a.id,
    token: a.token,
    nivel: a.nivel,
    nombre: a.client.name,
    telefono: a.client.phone,
    dadas: a._count.clases,
    ultima: a.clases[0]?.empiezaEn ?? null,
    debe: debe.get(a.id)?.total ?? 0,
    clasesQueDebe: debe.get(a.id)?.cantidad ?? 0,
    enRevision: enRevision.get(a.id) ?? 0,
    ...aFavorDe(a.id),
  }));
}

/** Una página de Alumnos (de a 40) y el cursor de la siguiente (null si no hay más). */
export async function alumnosPagina(q = "", cursor?: string) {
  const items = await alumnos(q, cursor, PAGINA_ALUMNOS);
  return { items, siguiente: items.length === PAGINA_ALUMNOS ? items[items.length - 1].id : null };
}

/** Los `n` alumnos con más clases DADAS en los últimos 60 días (los chips de «¿A quién?»). */
export async function alumnosFrecuentes(n = 6, ahora = new Date()) {
  const tenantId = await getCurrentTenantId();
  const top = await prisma.padelClase.groupBy({
    by: ["alumnoId"],
    where: { tenantId, estado: "DADA", empiezaEn: { gte: new Date(ahora.getTime() - 60 * DIA) } },
    _count: { _all: true },
    orderBy: { _count: { alumnoId: "desc" } },
    take: Math.min(20, Math.max(1, n)),
  });
  if (!top.length) return [];
  const filas = await prisma.padelAlumno.findMany({
    where: { tenantId, id: { in: top.map((t) => t.alumnoId) } },
    select: { id: true, client: { select: { name: true, phone: true } } },
  });
  const porId = new Map(filas.map((f) => [f.id, f]));
  return top.flatMap((t) => {
    const a = porId.get(t.alumnoId);
    return a ? [{ id: a.id, nombre: a.client.name, telefono: a.client.phone, dadas: t._count._all }] : [];
  });
}

/**
 * Tanda 3A · «¿A quién?» de Agendar (M-070): TODOS los alumnos del negocio, sólo id, nombre y
 * celular, para que el buscador encuentre cualquiera con 3 letras sin el tope de 60 de antes (B5).
 * Una lectura liviana por índice [tenantId]; el tope de 2000 es sólo un techo de seguridad.
 */
export async function alumnosParaBuscar(tope = 2000) {
  const tenantId = await getCurrentTenantId();
  const filas = await prisma.padelAlumno.findMany({
    where: { tenantId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: Math.min(2000, Math.max(1, tope)),
    select: { id: true, client: { select: { name: true, phone: true } } },
  });
  return filas.map((a) => ({ id: a.id, nombre: a.client.name, telefono: a.client.phone }));
}

/** La ficha del alumno: datos, próximas, últimas 10 con su pago, deuda, en revisión y saldo a favor. */
export async function ficha(alumnoId: string, ahora = new Date()) {
  const tenantId = await getCurrentTenantId();
  const a = await prisma.padelAlumno.findFirst({
    where: { tenantId, id: alumnoId },
    select: { id: true, token: true, nivel: true, notas: true, createdAt: true, client: { select: { name: true, phone: true } }, _count: { select: { clases: { where: { estado: "DADA" } } } } },
  });
  if (!a) return null;
  const delAlumno = { tenantId, alumnoId: a.id };
  const t4 = await modeloT4();
  const sel = { id: true, empiezaEn: true, terminaEn: true, tipo: true, personas: true, estado: true, precio: true, pagoEstado: true, pagoMedio: true, motivoCancel: true, pagoNota: true, ...selectClaseT4(t4) } as const;
  const [proximas, ultimas, pendientesDePago, aFavorDe] = await Promise.all([
    prisma.padelClase.findMany({ where: { ...delAlumno, estado: { in: ["PEDIDA", "CONFIRMADA"] }, terminaEn: { gt: ahora } }, orderBy: { empiezaEn: "asc" }, take: 20, select: sel }),
    prisma.padelClase.findMany({ where: { ...delAlumno, empiezaEn: { lte: ahora } }, orderBy: { empiezaEn: "desc" }, take: 10, select: sel }),
    prisma.padelClase.findMany({
      where: {
        ...delAlumno, precio: { gt: 0 }, pagoEstado: { in: ["PENDIENTE", "EN_REVISION"] },
        OR: [{ estado: "DADA" }, { estado: "AUSENTE", motivoCancel: MOTIVO_AUSENTE_SE_COBRA }, { estado: "CANCELADA", motivoCancel: MOTIVO_TARDIA_SE_COBRA }, { estado: "CONFIRMADA", pagoEstado: "EN_REVISION" }],
      },
      orderBy: { empiezaEn: "asc" },
      select: sel,
    }),
    saldosPorAlumno(tenantId, [a.id]),
  ]);
  const num = <T extends { precio: unknown; pagado?: unknown; costoCancha?: unknown }>(c: T) => ({
    ...c,
    precio: Number(c.precio),
    pagado: Number(c.pagado ?? 0),
    costoCancha: c.costoCancha == null ? null : Number(c.costoCancha),
  });
  const deudas = pendientesDePago.map(num).filter(esDeuda);
  const enRevision = pendientesDePago.map(num).filter(esEnRevision);
  return {
    id: a.id,
    token: a.token,
    nombre: a.client.name,
    telefono: a.client.phone,
    nivel: a.nivel,
    notas: a.notas ?? "",
    desde: a.createdAt,
    dadas: a._count.clases,
    proximas: proximas.map(num),
    ultimas: ultimas.map(num),
    deudas,
    debe: totalDeuda(deudas),
    enRevision: totalEnRevision(enRevision),
    ...aFavorDe(a.id),
  };
}

/** Quién debe, ordenado por monto (Plata → «Quién debe»). */
export async function deudores() {
  const tenantId = await getCurrentTenantId();
  return deudoresDe(tenantId);
}

async function deudoresDe(tenantId: string) {
  const { debe } = await deudaPorAlumno(tenantId);
  const ids = [...debe.keys()];
  if (!ids.length) return [];
  const filas = await prisma.padelAlumno.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, client: { select: { name: true, phone: true } } } });
  return filas
    .map((a) => ({ alumnoId: a.id, nombre: a.client.name, telefono: a.client.phone, total: debe.get(a.id)?.total ?? 0, cantidad: debe.get(a.id)?.cantidad ?? 0 }))
    .filter((d) => d.total > 0)
    .sort((x, y) => y.total - x.total || x.nombre.localeCompare(y.nombre));
}

export type PeriodoPlata = "hoy" | "semana" | "mes";

/** Desde cuándo cuenta cada período, en la hora del negocio (semana = desde el lunes). */
function inicioDelPeriodo(periodo: PeriodoPlata, hoyStr: string): string {
  if (periodo === "hoy") return hoyStr;
  if (periodo === "semana") return semanaDesdeLunes(hoyStr);
  return `${hoyStr.slice(0, 8)}01`;
}

/**
 * Plata: lo cobrado en el período por medio (sin «Saldo a favor»: esa plata ya se contó cuando
 * entró, M-024), lo que te deben (todo, no sólo del período), las clases dadas y quién debe.
 */
export async function plata(periodo: PeriodoPlata = "mes") {
  const tenantId = await getCurrentTenantId();
  const hoyStr = todayInBusinessTz();
  const desde = businessWallTimeToUtc(inicioDelPeriodo(periodo, hoyStr), "00:00");
  const hasta = businessWallTimeToUtc(sumarDias(hoyStr, 1), "00:00");
  const [cobros, dadas, quienDebe, aFavor] = await Promise.all([
    prisma.padelClase.findMany({
      // Como «cobrado hoy»: lo pagado y lo que después quedó a favor (la plata entró). Lo pagado con
      // saldo a favor no suma (ya se contó). Lo devuelto en mano salió: no suma.
      where: { tenantId, pagoEstado: { in: ["PAGADO", "ACREDITADO"] }, pagoValidadoEl: { gte: desde, lt: hasta }, OR: [{ pagoMedio: null }, { pagoMedio: { not: "SALDO_A_FAVOR" } }] },
      select: { precio: true, pagoMedio: true },
    }),
    prisma.padelClase.count({ where: { tenantId, estado: "DADA", empiezaEn: { gte: desde, lt: hasta } } }),
    deudoresDe(tenantId),
    prisma.padelClase.findMany({ where: { tenantId, ...FILTRO_SALDO }, select: { alumnoId: true, estado: true, pagoEstado: true, pagoMedio: true, precio: true } }),
  ]);
  const porMedio: Record<string, number> = {};
  for (const c of cobros) porMedio[c.pagoMedio ?? "TRANSFERENCIA"] = (porMedio[c.pagoMedio ?? "TRANSFERENCIA"] ?? 0) + Number(c.precio);
  const porAlumno = new Map<string, { estado: string; pagoEstado: string; pagoMedio: string | null; precio: number }[]>();
  for (const c of aFavor) porAlumno.set(c.alumnoId, [...(porAlumno.get(c.alumnoId) ?? []), { ...c, precio: Number(c.precio) }]);
  const saldos = [...porAlumno].map(([alumnoId, cs]) => ({ alumnoId, aFavor: saldoAFavor(cs) })).filter((x) => x.aFavor > 0);
  const nombres = saldos.length
    ? new Map((await prisma.padelAlumno.findMany({ where: { tenantId, id: { in: saldos.map((x) => x.alumnoId) } }, select: { id: true, client: { select: { name: true } } } })).map((a) => [a.id, a.client.name]))
    : new Map<string, string>();
  const conSaldo = saldos.map((x) => ({ ...x, nombre: nombres.get(x.alumnoId) ?? "" })).sort((x, y) => y.aFavor - x.aFavor);
  return {
    periodo,
    cobrado: { total: Object.values(porMedio).reduce((s, v) => s + v, 0), porMedio },
    teDeben: quienDebe.reduce((s, d) => s + d.total, 0),
    dadas,
    quienDebe,
    aFavor: conSaldo,
  };
}

export async function configCompleta() {
  const tenantId = await getCurrentTenantId();
  const [config, fr, negocio] = await Promise.all([configPadel(tenantId), franjas(tenantId), datosDelNegocio(tenantId)]);
  const bloqueos = await prisma.padelDisponibilidad.findMany({
    where: { tenantId, fecha: { gte: new Date(`${todayInBusinessTz()}T00:00:00.000Z`) } },
    orderBy: { fecha: "asc" },
    // `select` explícito (schema-ahead, src/lib/padel/modelo.ts): nunca la fila entera.
    select: { id: true, tenantId: true, diaSemana: true, fecha: true, desde: true, hasta: true, tipo: true, createdAt: true },
  });
  return { config, franjas: fr.filter((f) => f.fecha === null), bloqueos, negocio };
}

// ── Link del alumno (sin login): la llave es el token ──────────────────────

const selectClaseAlumno = (t4: boolean) =>
  ({
    id: true, empiezaEn: true, terminaEn: true, tipo: true, personas: true, estado: true, precio: true,
    pagoEstado: true, pagoMedio: true, comprobanteEnviadoEl: true, pagoNota: true, motivoCancel: true,
    // T3C: cuándo se rechazó o se canceló, para mostrarla tachada 48 h con su salida (M-100).
    rechazadaEl: true, canceladaEl: true,
    // T4: lo ya pagado (pago parcial, M-124) y el club (M-126..M-128), sólo si la base los tiene.
    pagado: t4, clubId: t4,
  }) as const;

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
  const SELECT_CLASE_ALUMNO = selectClaseAlumno(await modeloT4());
  const [futuras, pagables, pasadas, saldo, config, negocio] = await Promise.all([
    prisma.padelClase.findMany({ where: { ...delAlumno, terminaEn: { gt: ahora } }, orderBy: { empiezaEn: "asc" }, take: 20, select: SELECT_CLASE_ALUMNO }),
    prisma.padelClase.findMany({
      where: {
        ...delAlumno,
        precio: { gt: 0 },
        OR: [
          { estado: "DADA", pagoEstado: { notIn: ["PAGADO", "ACREDITADO", "DEVUELTO"] } },
          // M-045: «No vino → se cobra igual» también es deuda (provisional hasta la columna seCobra de T4).
          { estado: "AUSENTE", motivoCancel: MOTIVO_AUSENTE_SE_COBRA, pagoEstado: { notIn: ["PAGADO", "ACREDITADO", "DEVUELTO"] } },
          // M-125 (T4): «Cancelada tarde · se cobra» también se paga desde el link.
          { estado: "CANCELADA", motivoCancel: MOTIVO_TARDIA_SE_COBRA, pagoEstado: { notIn: ["PAGADO", "ACREDITADO", "DEVUELTO"] } },
          { estado: "CONFIRMADA", pagoEstado: { in: ["PENDIENTE", "EN_REVISION"] } },
        ],
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
    .map((c) => ({ ...c, precio: Number(c.precio), pagado: Number(c.pagado ?? 0), clubId: c.clubId ?? null, estado: estadoEnPantalla(c.estado as EstadoClase, c.empiezaEn, ahora), pagoEstado: c.pagoEstado as EstadoPago }))
    .sort((a, b) => +b.empiezaEn - +a.empiezaEn);
  const saldoAFavorAlumno = saldoAFavor(saldo.map((f) => ({ ...f, precio: Number(f.precio) })));
  return {
    alumno: { ...alumno, clases, dadas: alumno._count.clases, debe: totalDeuda(clases), enRevision: totalEnRevision(clases), saldoAFavor: saldoAFavorAlumno },
    config,
    negocio,
  };
}

/**
 * El saludo del turnero cuando el teléfono tiene la cookie (A·E03): «Hola Juan · tu próxima jue
 * 18:00 ✓ · Mis clases». Lo que viene de la cookie se busca EN ESTE negocio: una cookie de otro
 * negocio (o un token renovado) no saluda a nadie. Nunca devuelve el token ni el teléfono.
 */
export async function saludoDelAlumno(tenantId: string, token: string | null | undefined, ahora = new Date()) {
  if (!tokenValido(token)) return null;
  const a = await prisma.padelAlumno.findFirst({ where: { tenantId, token }, select: { id: true, client: { select: { name: true } } } });
  if (!a) return null;
  const [proxima, misPendientes] = await Promise.all([
    prisma.padelClase.findFirst({
      where: { tenantId, alumnoId: a.id, estado: { in: ["PEDIDA", "CONFIRMADA"] }, empiezaEn: { gt: ahora } },
      orderBy: { empiezaEn: "asc" },
      select: { id: true, empiezaEn: true, estado: true },
    }),
    prisma.padelClase.count({ where: { tenantId, alumnoId: a.id, estado: "PEDIDA", empiezaEn: { gt: ahora } } }),
  ]);
  return {
    nombre: a.client.name.split(" ")[0],
    miProxima: proxima ? { id: proxima.id, empiezaEn: proxima.empiezaEn, estado: proxima.estado as EstadoClase } : null,
    misPendientes,
  };
}

/**
 * Lo que necesita el «.ics» de una clase del alumno: sólo si el token es de ESTE negocio y la clase
 * es de ESE alumno y sigue viva. null en cualquier otro caso (la ruta responde 404).
 */
export async function claseParaCalendario(token: string, claseId: string) {
  if (!tokenValido(token) || typeof claseId !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(claseId)) return null;
  const tenantId = await getCurrentTenantId();
  const a = await prisma.padelAlumno.findFirst({ where: { tenantId, token }, select: { id: true } });
  if (!a) return null;
  const c = await prisma.padelClase.findFirst({
    where: { tenantId, id: claseId, alumnoId: a.id, estado: { in: ["PEDIDA", "CONFIRMADA"] } },
    select: { id: true, empiezaEn: true, terminaEn: true, estado: true },
  });
  if (!c) return null;
  const negocio = await datosDelNegocio(tenantId);
  return { clase: c, negocio };
}
