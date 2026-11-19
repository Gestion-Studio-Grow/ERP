// ============================================================================
// LIQUIDACIÓN DEL PROYECTO (GSG-MIA-171 · T10, O19-O23) — lecturas. La medición (foto del precio, costo real con sus
// ids, facturado y cobrado) se hace con `db`: adentro de la transacción de quien declara, para que monto e ids sean de la
// misma foto. Sin M5 aplicada (Gate 2), `hayM5` da false y las pantallas avisan en vez de caerse.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { centavosDe } from "@/lib/dinero/redondeo";
import { costoRealDeProyectos } from "./comprobantes.server";
import { cobranzasDelNegocio, tiposDeCambio } from "./cobranza.server";
import { configProyectos } from "./datos.server";
import { aCobrarPorCuota } from "./moneda-bancos.server";
import { hayM3 } from "./precio-foto.server";
import { parametrosDelNegocio, valorDelNegocio } from "./parametros/leer.server";
import type { ParticipanteFoto } from "./precio-proyecto-core";
import { actorActual, proyectoVisible, puede, type Actor } from "./gestion.server";
import { CATALOGO } from "./parametros/catalogo";
import { aPagarDelAjuste, calcularAjuste, calcularLiquidacion, comparacionesDeRevision, compensarConSaldos, listaParaLaMensual, nombreDeAjusteMensual, nombreDeLineaMensual, SIN_FICHA_NO_REVISA, type Comparacion, type LiquidacionCalculada, type RenglonAjuste } from "./liquidacion-proyecto-core";

type Db = Prisma.TransactionClient | typeof prisma;

export const SIN_M5 = "La liquidación del proyecto todavía no está habilitada en tu negocio (falta una actualización de la base). Avisale a Gestión Studio Grow.";

let m5Vista = false;
export async function hayM5(db: Db = prisma): Promise<boolean> {
  if (m5Vista) return true;
  const [fila] = await db.$queryRaw<{ hay: boolean }[]>`SELECT to_regclass('"ProyectoLiquidacionProyecto"') IS NOT NULL
    AND to_regclass('"ProyectoLiquidacionProyectoLinea"') IS NOT NULL AND to_regclass('"ProyectoLiquidacionProyectoAjuste"') IS NOT NULL
    AND to_regclass('"ProyectoSaldoAFavor"') IS NOT NULL AS hay`;
  m5Vista = !!fila?.hay;
  return m5Vista;
}

/** Los parámetros que usa la liquidación. Su marca de provisional se guarda en la cabecera (R3). */
const CLAVES = ["reparto.defensaNegativa", "reparto.cuandoSePaga", "reparto.queEsCobrado"] as const;

export interface Medicion {
  foto: { presupuestoId: string; version: number; totalVenta: number; costoOriginal: number; adicionales: number; redondeoBruto: number; participantes: ParticipanteFoto[] };
  /** Centavos. */
  costoReal: number;
  comprobantes: number;
  facturado: number;
  cobrado: number;
  porCobrar: number;
  costoDetalle: { lineasDeComprobante: string[]; gastos: string[]; cuotasPrevistas: string[] };
  parametros: { valores: Record<(typeof CLAVES)[number], string>; provisionales: string[] };
  calculo: LiquidacionCalculada;
  comparaciones: Comparacion[];
}

const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

/**
 * Mide el proyecto: la foto del precio aprobado, el costo real (la misma cuenta de la ficha), lo facturado y lo cobrado.
 * `null` si el proyecto no tiene foto del precio (sin M3 o sin precio aprobado por total).
 */
export async function medirProyecto(db: Db, tenantId: string, proyectoId: string, m3 = true): Promise<Medicion | null> {
  if (!m3) return null;
  const f = await db.proyectoPrecioFoto.findFirst({ where: { tenantId, proyectoId, presupuesto: { estado: "APROBADO" } }, orderBy: { version: "desc" } });
  if (!f) return null;
  const tc = await tiposDeCambio(tenantId, db);
  const [gastos, previstas, lineas, cobrosCuotas, config, params] = await Promise.all([
    db.proyectoGasto.findMany({ where: { tenantId, proyectoId }, select: { id: true, rubro: true, neto: true, iva: true, pagadoEl: true, anuladoEl: true } }),
    db.proyectoCuota.findMany({ where: { tenantId, proyectoId, tipo: "PAGO", pagadoEl: null, anuladoEl: null, prevista: false }, select: { id: true, tipo: true, monto: true, moneda: true, pagadoEl: true, anuladoEl: true, prevista: true } }),
    db.proyectoComprobanteLinea.findMany({ where: { tenantId, proyectoId, comprobante: { anuladoEl: null } }, select: { id: true } }),
    db.proyectoCuota.findMany({ where: { tenantId, proyectoId, tipo: "COBRO", anuladoEl: null }, select: { id: true } }),
    configProyectos(tenantId, db as Prisma.TransactionClient),
    parametrosDelNegocio(tenantId, db),
  ]);
  const real = (await costoRealDeProyectos(tenantId, [{ id: proyectoId, t: null, gastos, cuotas: previstas }], tc, db)).get(proyectoId)!;
  const [cob, aCobrar] = await Promise.all([
    cobranzasDelNegocio(tenantId, tc, config.margenPct, [proyectoId], db).then((m) => m.get(proyectoId)),
    aCobrarPorCuota(tenantId, cobrosCuotas.map((c) => c.id), db),
  ]);
  const participantes = f.participantes as unknown as ParticipanteFoto[];
  const valores = Object.fromEntries(CLAVES.map((k) => [k, String(params[k].valor)])) as Medicion["parametros"]["valores"];
  const provisionales = CLAVES.filter((k) => params[k].provisional);
  const costoReal = centavosDe(real.costoReal);
  const foto = { presupuestoId: f.presupuestoId, version: f.version, totalVenta: n(f.totalVentaCentavos), costoOriginal: n(f.costoOriginalCentavos), adicionales: n(f.adicionalesCentavos), redondeoBruto: n(f.redondeoBrutoCentavos), participantes };
  const calculo = calculoDeLaFoto(f, costoReal, valores["reparto.defensaNegativa"]);
  const comprobantes = centavosDe(real.imputado);
  const facturado = [...aCobrar.values()].reduce((s, q) => s + centavosDe(q.facturado), 0);
  const cobrado = centavosDe(cob?.cobrado ?? 0);
  return {
    foto,
    costoReal,
    comprobantes,
    facturado,
    cobrado,
    porCobrar: centavosDe(cob?.porCobrar ?? 0),
    costoDetalle: { lineasDeComprobante: lineas.map((l) => l.id).sort(), gastos: gastos.filter((g) => !g.anuladoEl).map((g) => g.id).sort(), cuotasPrevistas: previstas.map((q) => q.id).sort() },
    parametros: { valores, provisionales },
    calculo,
    comparaciones: comparacionesDeRevision({ costoReal, comprobantes, facturado, cobrado }),
  };
}

type FotoGuardada = NonNullable<Awaited<ReturnType<typeof prisma.proyectoPrecioFoto.findFirst>>>;

/** La cuenta de la liquidación con la foto del precio congelada y un costo real dado (la provisoria, el borrador y el ajuste). */
function calculoDeLaFoto(f: FotoGuardada, costoReal: number, defensaNegativa: string): LiquidacionCalculada {
  const p = f.parametros as Record<string, unknown>;
  return calcularLiquidacion({
    totalVenta: n(f.totalVentaCentavos),
    costoOriginal: n(f.costoOriginalCentavos),
    adicionales: n(f.adicionalesCentavos),
    redondeoBruto: n(f.redondeoBrutoCentavos),
    rentabilidad: n(p.rentabilidad as number),
    margenError: n(p.margenError as number),
    comisiones: (p.comisiones ?? {}) as Record<string, number>,
    participantes: f.participantes as unknown as ParticipanteFoto[],
    costoReal,
    defensaNegativa,
  });
}

/** El evento terminó: la fecha de fin (o la del evento) ya pasó. Sin fecha, no terminó. */
export const eventoTerminado = (p: { fechaFin: Date | null; fechaEvento: Date | null }, ahora = new Date()) => {
  const fin = p.fechaFin ?? p.fechaEvento;
  return !!fin && fin.getTime() <= ahora.getTime();
};

/** Las rendiciones de gastos del proyecto que no terminaron (las nombra el rechazo de O20). */
export async function rendicionesPendientes(db: Db, tenantId: string, proyectoId: string): Promise<string[]> {
  const filas = await db.proyectoRendicion.findMany({
    where: { tenantId, proyectoId, estado: { in: ["borrador", "enviada", "devuelta"] } },
    orderBy: { createdAt: "asc" },
    select: { estado: true, montoCentavos: true, persona: { select: { nombre: true } } },
  });
  return filas.map((r) => `${r.persona.nombre} (${r.estado}, $ ${(r.montoCentavos / 100).toLocaleString("es-AR")})`);
}

export type LiquidacionGuardada = NonNullable<Awaited<ReturnType<typeof liquidacionDelProyecto>>>;

export async function liquidacionDelProyecto(db: Db, tenantId: string, proyectoId: string) {
  return db.proyectoLiquidacionProyecto.findUnique({
    where: { proyectoId_tenantId: { proyectoId, tenantId } },
    include: { lineas: { orderBy: [{ personaId: { sort: "asc", nulls: "last" } }, { clave: "asc" }] } },
  });
}

/**
 * Lo que forma el costo real y cuyo costo de HOY difiere de lo que ya cuenta la liquidación aprobada (lo congelado más lo
 * que movieron los ajustes, `yaAjustado`): un comprobante imputado después de congelar suma (T12, O24) y uno congelado, o
 * ya ajustado, que se anula después resta (MIA-184, B). MIA-186 (3): lo mismo con los gastos del proyecto, tengan o no
 * número de comprobante (el congelado los guarda en `gastos`). Anulado, cuesta 0. Sólo las diferencias distintas de cero.
 * Una cabecera vieja sin la lista de gastos no ajusta gastos (no se puede saber cuáles contó).
 */
export async function comprobantesParaAjuste(db: Db, tenantId: string, proyectoId: string, costoDetalle: unknown, yaAjustado: ReadonlyMap<string, number> = new Map()): Promise<{ id: string; costo: number; origen: string }[]> {
  const detalle = costoDetalle as Partial<Medicion["costoDetalle"]> | null;
  const congeladas = new Set((detalle?.lineasDeComprobante ?? []) as string[]);
  const gastosCongelados = Array.isArray(detalle?.gastos) ? new Set(detalle.gastos) : null;
  const [filas, gastos] = await Promise.all([
    db.proyectoComprobanteLinea.findMany({
      where: { tenantId, proyectoId },
      orderBy: { id: "asc" },
      select: { id: true, costoCentavos: true, comprobante: { select: { tipo: true, numero: true, anuladoEl: true, supplier: { select: { name: true } } } } },
    }),
    gastosCongelados ? db.proyectoGasto.findMany({ where: { tenantId, proyectoId }, orderBy: { id: "asc" }, select: { id: true, neto: true, descripcion: true, comprobante: true, anuladoEl: true } }) : [],
  ]);
  const diferencia = (id: string, costo: number, congelado: boolean, anulado: boolean, origen: string) => {
    const hoy = anulado ? 0 : costo;
    const cuenta = (congelado ? costo : 0) + (yaAjustado.get(id) ?? 0);
    return hoy === cuenta ? [] : [{ id, costo: hoy - cuenta, origen: `${anulado ? "Anulado · " : ""}${origen}` }];
  };
  return [
    ...filas.flatMap((l) => diferencia(l.id, n(l.costoCentavos), congeladas.has(l.id), !!l.comprobante.anuladoEl, `${l.comprobante.supplier.name} · ${l.comprobante.tipo} ${l.comprobante.numero}`)),
    ...gastos.flatMap((g) => diferencia(g.id, centavosDe(g.neto), !!gastosCongelados?.has(g.id), !!g.anuladoEl, `Gasto · ${g.descripcion}${g.comprobante ? ` · ${g.comprobante}` : ""}`)),
  ];
}

// ── T12 · O24: el ajuste por comprobante tardío ──

export interface ComprobanteTardio { id: string; costo: number; origen: string }
/** Lo que guarda cada renglón de ajuste: el lote de comprobantes que cubre y el costo real antes y después. */
export interface DetalleAjuste {
  lote: string;
  comprobantes: ComprobanteTardio[];
  costoRealAntes: number;
  costoRealNuevo: number;
  periodo: string;
  /** MIA-184 (A): lo que este renglón canceló del saldo a favor de la persona en el proyecto (no va a la mensual). */
  compensado?: number;
  /** MIA-184 (A): la liquidación mensual que tomó este renglón (como `mensualId` de las líneas). */
  mensualId?: string;
}

const detalleDe = (d: unknown): DetalleAjuste | null => (d && typeof d === "object" && Array.isArray((d as DetalleAjuste).comprobantes) ? (d as DetalleAjuste) : null);

export interface PropuestaDeAjuste {
  /** Comprobantes cuyo costo cambió después de aprobar (tardíos suman, anulados restan) y todavía no tienen ajuste. */
  pendientes: ComprobanteTardio[];
  renglones: RenglonAjuste[];
  costoRealAntes: number;
  costoRealNuevo: number;
  cierra: boolean;
  /**
   * MIA-186 (2) · O26: el saldo a favor de la empresa todavía abierto de cada persona con un renglón positivo, y cuánto de
   * ese renglón lo cancelaría si Dirección elige compensar. Por defecto no se compensa.
   */
  saldos: { personaId: string; nombre: string; abierto: number; compensable: number }[];
}

/**
 * Lo que falta ajustar de una liquidación APROBADA: los comprobantes que entraron después de congelar el costo y no cubre
 * ningún ajuste anterior, y lo que cambia cada línea con el costo real nuevo (la foto y el parámetro de defensa negativa
 * son los congelados al declarar). `null` si no hay nada pendiente.
 */
export async function propuestaDeAjuste(db: Db, tenantId: string, cab: LiquidacionGuardada): Promise<PropuestaDeAjuste | null> {
  if (cab.estado !== "APROBADA") return null;
  const previos = await db.proyectoLiquidacionProyectoAjuste.findMany({ where: { tenantId, liquidacionId: cab.id }, select: { lineaId: true, monto: true, detalle: true } });
  // Lo que cada lote ya movió por línea de comprobante (todos los renglones de un lote repiten su detalle: se cuenta una vez).
  const yaAjustado = new Map<string, number>();
  const lotes = new Set<string>();
  for (const a of previos) {
    const d = detalleDe(a.detalle);
    if (!d || lotes.has(d.lote)) continue;
    lotes.add(d.lote);
    for (const c of d.comprobantes) yaAjustado.set(c.id, (yaAjustado.get(c.id) ?? 0) + c.costo);
  }
  const pendientes = await comprobantesParaAjuste(db, tenantId, cab.proyectoId, cab.costoDetalle, yaAjustado);
  if (pendientes.length === 0) return null;
  const costoRealAntes = n(cab.costoReal) + [...yaAjustado.values()].reduce((s, c) => s + c, 0);
  const costoRealNuevo = costoRealAntes + pendientes.reduce((s, c) => s + c.costo, 0);
  const foto = cab.presupuestoId && cab.fotoVersion !== null ? await db.proyectoPrecioFoto.findFirst({ where: { tenantId, proyectoId: cab.proyectoId, presupuestoId: cab.presupuestoId, version: cab.fotoVersion } }) : null;
  const defensaNegativa = (cab.parametros as Medicion["parametros"] | null)?.valores?.["reparto.defensaNegativa"];
  if (!foto || !defensaNegativa) throw new Error("La liquidación aprobada no tiene su foto del precio: el ajuste no se puede calcular.");
  const r = calcularAjuste({ lineas: cab.lineas, previos, recalculo: calculoDeLaFoto(foto, costoRealNuevo, defensaNegativa) });
  const abiertos = await saldosAbiertos(db, tenantId, cab.id);
  const { compensado } = compensarConSaldos(r.renglones, abiertos);
  const saldos = r.renglones.flatMap((x) => {
    const abierto = abiertos.filter((s) => s.personaId === x.personaId).reduce((t, s) => t + n(s.monto) - n(s.aplicado), 0);
    return x.personaId && x.monto > 0 && abierto > 0 ? [{ personaId: x.personaId, nombre: x.nombre, abierto, compensable: compensado.get(x.lineaId) ?? 0 }] : [];
  });
  return { pendientes, renglones: r.renglones, costoRealAntes, costoRealNuevo, cierra: r.cierra, saldos };
}

/** Los saldos a favor de la empresa de una liquidación de proyecto, del más viejo al más nuevo (el orden en que se compensan). */
export function saldosAbiertos(db: Db, tenantId: string, liquidacionId: string) {
  return db.proyectoSaldoAFavor.findMany({ where: { tenantId, liquidacionId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, personaId: true, monto: true, aplicado: true } });
}

export interface AjusteVisible { id: string; nombre: string; personaId: string | null; motivo: string; monto: number; autor: string; cuando: Date }

/** Los ajustes ya aprobados de una liquidación, con el nombre de la línea. Sin `veTodo`, sólo los de la persona. */
async function ajustesVisibles(db: Db, tenantId: string, cab: LiquidacionGuardada, veTodo: boolean, personaId: string | null): Promise<AjusteVisible[]> {
  const filas = await db.proyectoLiquidacionProyectoAjuste.findMany({ where: { tenantId, liquidacionId: cab.id }, orderBy: { createdAt: "asc" } });
  const linea = new Map(cab.lineas.map((l) => [l.id, l]));
  return filas
    .map((f) => ({ id: f.id, nombre: linea.get(f.lineaId ?? "")?.nombre ?? "—", personaId: linea.get(f.lineaId ?? "")?.personaId ?? null, motivo: f.motivo, monto: n(f.monto), autor: f.autorNombre, cuando: f.createdAt }))
    .filter((f) => veTodo || (!!personaId && f.personaId === personaId));
}

// ── T12 · O25: el plus no se paga dos veces ──

/**
 * De `proyectoIds`, los que se liquidan por el reparto: con el parámetro «Reparto» prendido, los que tienen el precio
 * aprobado con su foto (equipo y porcentajes). Ahí el plus fijo no entra a la mensual. Reparto apagado: ninguno.
 */
export async function proyectosConReparto(db: Db, tenantId: string, proyectoIds: readonly string[]): Promise<Set<string>> {
  if (proyectoIds.length === 0 || !(await valorDelNegocio(tenantId, "reparto.activo", db)) || !(await hayM3())) return new Set();
  const fotos = await db.proyectoPrecioFoto.findMany({ where: { tenantId, proyectoId: { in: [...proyectoIds] }, presupuesto: { estado: "APROBADO" } }, select: { proyectoId: true } });
  return new Set(fotos.map((f) => f.proyectoId));
}

export const PLUS_APAGADO = "plus apagado por reparto";

// ── T12 · O26: saldo a favor de la empresa ──

export interface SaldoVisible { id: string; persona: string; proyectoId: string; proyecto: string; monto: number; aplicado: number; desde: Date }

/** Los saldos a favor de la empresa. Con `personaId`, sólo los de esa persona («Mi liquidación»); sin él, los del negocio. */
export async function saldosAFavorDe(tenantId: string, personaId?: string): Promise<SaldoVisible[]> {
  if (!(await hayM5())) return [];
  const filas = await prisma.proyectoSaldoAFavor.findMany({
    where: { tenantId, ...(personaId ? { personaId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, monto: true, aplicado: true, createdAt: true, persona: { select: { nombre: true } }, liquidacion: { select: { proyectoId: true, proyecto: { select: { nombre: true } } } } },
  });
  return filas.map((f) => ({ id: f.id, persona: f.persona.nombre, proyectoId: f.liquidacion.proyectoId, proyecto: f.liquidacion.proyecto.nombre, monto: n(f.monto), aplicado: n(f.aplicado), desde: f.createdAt }));
}

/** Las personas que cobran en el proyecto (su equipo de hoy y las de la foto): no revisan ni aprueban (O21, O22). */
export async function quienesCobran(db: Db, tenantId: string, proyectoId: string, participantes: readonly ParticipanteFoto[]): Promise<Set<string>> {
  const equipo = await db.proyectoEquipo.findMany({ where: { tenantId, proyectoId }, select: { personaId: true } });
  return new Set([...equipo.map((e) => e.personaId), ...participantes.map((p) => p.personaId)].filter((x): x is string => !!x));
}

// ── O19 · la provisoria ──

export interface FilaVisible {
  clave: string;
  personaId: string | null;
  nombre: string;
  funcion: string;
  comision: number;
  reparto: number;
  redondeo: number;
  rentabilidad: number;
  total: number;
}

/**
 * La liquidación del proyecto que puede ver `a`: con permiso de liquidaciones, todas las filas; si no, SÓLO la suya (el
 * filtro es acá, en el servidor: la respuesta no lleva el importe de nadie más). Sin aprobar, `provisoria`.
 */
export async function liquidacionVisible(a: { tenantId: string; personaId: string | null }, proyectoId: string, veTodo: boolean) {
  const { tenantId } = a;
  const [m3, m5] = await Promise.all([hayM3(), hayM5()]);
  const guardada = m5 ? await liquidacionDelProyecto(prisma, tenantId, proyectoId) : null;
  const filtrar = <T extends { personaId: string | null }>(filas: T[]) => (veTodo ? filas : filas.filter((f) => !!a.personaId && f.personaId === a.personaId));
  if (guardada) {
    const filas: FilaVisible[] = guardada.lineas.map((l) => ({ clave: l.clave, personaId: l.personaId, nombre: l.nombre, funcion: l.funcion, comision: n(l.comision), reparto: n(l.reparto), redondeo: n(l.redondeo), rentabilidad: n(l.rentabilidad), total: n(l.total) }));
    const ajustes = await ajustesVisibles(prisma, tenantId, guardada, veTodo, a.personaId);
    return { m5, provisoria: guardada.estado !== "APROBADA", estado: guardada.estado, filas: filtrar(filas), ajustes, cabecera: veTodo ? guardada : null };
  }
  const m = await medirProyecto(prisma, tenantId, proyectoId, m3);
  const ajustes: AjusteVisible[] = [];
  if (!m) return { m5, provisoria: true, estado: null, filas: [] as FilaVisible[], ajustes, cabecera: null };
  const filas: FilaVisible[] = m.calculo.lineas.map(({ detalle: _d, ...l }) => l);
  return { m5, provisoria: true, estado: null, filas: filtrar(filas), ajustes, cabecera: null, medicion: veTodo ? m : undefined };
}

/** La pestaña «Liquidación» de la ficha: lo que ve quien entra. Sin acceso al proyecto, null. */
export async function liquidacionDeLaFicha(proyectoId: string) {
  const a = await actorActual();
  if (!(await proyectoVisible(a, proyectoId))) return null;
  return liquidacionVisible(a, proyectoId, puede(a, "liquidaciones", "ver"));
}

/**
 * O23 · Qué líneas de proyecto aprobadas pueden entrar a la liquidación mensual ahora, según «cuándo se paga», y qué
 * proyectos esperan (con el motivo). Sólo personas con total positivo: la empresa no se liquida y los negativos son de
 * T12 (saldo a favor). Lo que ya tomó una mensual publicada no vuelve: el claim pide `mensualId` nulo o el propio.
 * MIA-184 (A): con la misma regla, los ajustes aprobados con algo para pagar (positivo menos lo que canceló de un saldo).
 */
export async function lineasParaLaMensual(db: Db, tenantId: string): Promise<{ porPersona: Map<string, string[]>; ajustesPorPersona: Map<string, string[]>; esperando: string[] }> {
  const porPersona = new Map<string, string[]>();
  const ajustesPorPersona = new Map<string, string[]>();
  const esperando: string[] = [];
  if (!(await hayM5(db))) return { porPersona, ajustesPorPersona, esperando };
  const aprobadas = await db.proyectoLiquidacionProyecto.findMany({
    where: { tenantId, estado: "APROBADA" },
    select: {
      proyectoId: true,
      proyecto: { select: { nombre: true } },
      lineas: { where: { personaId: { not: null } }, select: { id: true, personaId: true, total: true } },
      ajustes: { where: { monto: { gt: 0 } }, select: { id: true, lineaId: true, monto: true, detalle: true } },
    },
  });
  if (aprobadas.length === 0) return { porPersona, ajustesPorPersona, esperando };
  const [tc, config, params] = await Promise.all([tiposDeCambio(tenantId, db), configProyectos(tenantId, db as Prisma.TransactionClient), parametrosDelNegocio(tenantId, db)]);
  const cobranzas = await cobranzasDelNegocio(tenantId, tc, config.margenPct, aprobadas.map((l) => l.proyectoId), db);
  const cuando = String(params["reparto.cuandoSePaga"].valor);
  const sumar = (m: Map<string, string[]>, personaId: string, id: string) => m.set(personaId, [...(m.get(personaId) ?? []), id]);
  for (const l of aprobadas) {
    const r = listaParaLaMensual({ estado: "APROBADA", cuandoSePaga: cuando, porCobrar: centavosDe(cobranzas.get(l.proyectoId)?.porCobrar ?? 0) });
    if (!r.lista) {
      esperando.push(`${l.proyecto.nombre}: ${r.motivo}`);
      continue;
    }
    for (const x of l.lineas) if (x.total > BigInt(0)) sumar(porPersona, x.personaId!, x.id);
    const personaDe = new Map(l.lineas.map((x) => [x.id, x.personaId!]));
    for (const a of l.ajustes) {
      const personaId = personaDe.get(a.lineaId ?? "");
      if (personaId && aPagarDelAjuste(a) > 0) sumar(ajustesPorPersona, personaId, a.id);
    }
  }
  return { porPersona, ajustesPorPersona, esperando };
}

/**
 * Dentro de la transacción de la mensual ya tomada: suelta las líneas que ya no le tocan, reclama las candidatas
 * (`mensualId` nulo o el propio: regenerar no duplica, y una línea de otra mensual no se mueve) y devuelve los extras.
 */
export async function reclamarLineasDeProyectoTx(tx: Prisma.TransactionClient, tenantId: string, mensualId: string, candidatas: readonly string[]): Promise<{ proyectoId: string; nombre: string; monto: number }[]> {
  await tx.proyectoLiquidacionProyectoLinea.updateMany({ where: { tenantId, mensualId, id: { notIn: [...candidatas] } }, data: { mensualId: null } });
  if (candidatas.length === 0) return [];
  await tx.proyectoLiquidacionProyectoLinea.updateMany({ where: { tenantId, id: { in: [...candidatas] }, OR: [{ mensualId: null }, { mensualId }] }, data: { mensualId } });
  const tomadas = await tx.proyectoLiquidacionProyectoLinea.findMany({ where: { tenantId, mensualId }, orderBy: { createdAt: "asc" }, select: { total: true, liquidacion: { select: { proyectoId: true, proyecto: { select: { nombre: true } } } } } });
  return tomadas.map((t) => ({ proyectoId: t.liquidacion.proyectoId, nombre: nombreDeLineaMensual(t.liquidacion.proyecto.nombre), monto: Number(t.total) / 100 }));
}

/**
 * MIA-184 (A) · El mismo claim para los ajustes, sin columna nueva: la mensual que lo toma queda en `detalle.mensualId`.
 * El UPDATE pide `mensualId` ausente o el propio y Postgres lo vuelve a evaluar sobre la fila ya trabada: dos mensuales
 * a la vez (el mismo mes o dos meses) se quedan con el ajuste una sola vez. Lo de una mensual publicada no se suelta
 * nunca (sólo se suelta desde la propia, en borrador). Devuelve una línea aparte por ajuste, con lo que se paga.
 */
export async function reclamarAjustesTx(tx: Prisma.TransactionClient, tenantId: string, mensualId: string, candidatos: readonly string[]): Promise<{ proyectoId: string; nombre: string; monto: number }[]> {
  const ids = [...candidatos];
  await tx.$executeRaw`UPDATE "ProyectoLiquidacionProyectoAjuste" SET "detalle" = "detalle" - 'mensualId'
    WHERE "tenantId" = ${tenantId} AND "detalle"->>'mensualId' = ${mensualId} AND NOT ("id" = ANY(${ids}::text[]))`;
  if (ids.length === 0) return [];
  await tx.$executeRaw`UPDATE "ProyectoLiquidacionProyectoAjuste" SET "detalle" = jsonb_set(COALESCE("detalle", '{}'::jsonb), '{mensualId}', to_jsonb(${mensualId}::text))
    WHERE "tenantId" = ${tenantId} AND "id" = ANY(${ids}::text[]) AND "monto" > 0 AND ("detalle"->>'mensualId' IS NULL OR "detalle"->>'mensualId' = ${mensualId})`;
  const tomados = await tx.proyectoLiquidacionProyectoAjuste.findMany({
    where: { tenantId, detalle: { path: ["mensualId"], equals: mensualId } },
    orderBy: { createdAt: "asc" },
    select: { monto: true, detalle: true, liquidacion: { select: { proyectoId: true, proyecto: { select: { nombre: true } } } } },
  });
  return tomados.map((t) => ({ proyectoId: t.liquidacion.proyectoId, nombre: nombreDeAjusteMensual(t.liquidacion.proyecto.nombre), monto: aPagarDelAjuste(t) / 100 }));
}

/** Borrar una mensual en borrador suelta lo que había tomado del proyecto (líneas y ajustes) para la próxima. */
export async function soltarDeLaMensualTx(tx: Prisma.TransactionClient, tenantId: string, mensualId: string): Promise<void> {
  await tx.proyectoLiquidacionProyectoLinea.updateMany({ where: { tenantId, mensualId }, data: { mensualId: null } });
  await tx.$executeRaw`UPDATE "ProyectoLiquidacionProyectoAjuste" SET "detalle" = "detalle" - 'mensualId' WHERE "tenantId" = ${tenantId} AND "detalle"->>'mensualId' = ${mensualId}`;
}

// ── La pestaña «Liquidación» de la ficha ──

export interface PanelLiquidacion {
  m5: boolean;
  /** Sin precio aprobado con su foto: no hay nada que mostrar. */
  sinFoto: boolean;
  estado: "BORRADOR" | "REVISADA" | "APROBADA" | null;
  provisoria: boolean;
  veTodo: boolean;
  filas: FilaVisible[];
  /** Total venta − costo real, sólo para quien ve todo. */
  esperado: number | null;
  comparaciones: Comparacion[];
  pasos: { que: string; quien: string; cuando: Date; nota?: string | null }[];
  /** T12 · O24: los ajustes aprobados (debajo de la liquidación) y lo que falta ajustar, con su cuenta. */
  ajustes: AjusteVisible[];
  propuesta: PropuestaDeAjuste | null;
  /** Si quien entra aprueba el ajuste; si no, por qué. */
  apruebaAjuste: boolean;
  motivoAjuste: string | null;
  provisionales: string[];
  avisos: string[];
  /** Qué botón ve quien entra; el permiso se vuelve a pedir en la acción. */
  accion: "DECLARAR" | "REVISAR" | "APROBAR" | null;
  /** Por qué no puede actuar, si es el paso que le tocaría. */
  motivo: string | null;
}

const ESTADOS = new Set(["BORRADOR", "REVISADA", "APROBADA"]);

export async function panelDeLiquidacion(a: Actor, proyectoId: string): Promise<PanelLiquidacion> {
  const veTodo = puede(a, "liquidaciones", "ver");
  const v = await liquidacionVisible(a, proyectoId, veTodo);
  const cab = v.cabecera;
  const estado = v.estado && ESTADOS.has(v.estado) ? (v.estado as PanelLiquidacion["estado"]) : null;
  const sinFoto = !v.estado && v.filas.length === 0 && !v.medicion && veTodo;
  const nombreDe = (k: string) => CATALOGO.find((p) => p.clave === k)?.nombre ?? k;
  const base: PanelLiquidacion = { m5: v.m5, sinFoto, estado, provisoria: v.provisoria, veTodo, filas: v.filas, esperado: null, comparaciones: [], pasos: [], ajustes: v.ajustes, propuesta: null, apruebaAjuste: false, motivoAjuste: null, provisionales: [], avisos: [], accion: null, motivo: null };
  if (!veTodo) return base;
  if (!cab) {
    const m = v.medicion;
    return {
      ...base,
      esperado: m ? m.calculo.esperado : null,
      comparaciones: m ? m.comparaciones : [],
      provisionales: m ? m.parametros.provisionales.map(nombreDe) : [],
      avisos: m ? m.calculo.avisos : [],
      accion: v.m5 && m && a.rol === "ADMINISTRACION" ? "DECLARAR" : null,
      motivo: v.m5 && m && a.rol !== "ADMINISTRACION" ? "Los costos completos los declara Administración cuando terminó el evento y no quedan rendiciones abiertas." : null,
    };
  }
  const { tenantId } = a;
  const congelados = { costoReal: n(cab.costoReal), comprobantes: n(cab.comprobantes) };
  let cobro = { facturado: n(cab.facturado), cobrado: n(cab.cobrado) };
  if (cab.estado === "BORRADOR") {
    const ahora = await medirProyecto(prisma, tenantId, proyectoId, await hayM3());
    if (ahora) cobro = { facturado: ahora.facturado, cobrado: ahora.cobrado };
  }
  const cobran = await quienesCobran(prisma, tenantId, proyectoId, cab.lineas.map((l) => ({ personaId: l.personaId }) as ParticipanteFoto));
  const cobraEl = !!a.personaId && cobran.has(a.personaId);
  const pasos: PanelLiquidacion["pasos"] = [{ que: "Costos completos declarados", quien: cab.declaradaNombre, cuando: cab.declaradaEl }];
  if (cab.revisadaEl && cab.revisadaNombre) pasos.push({ que: "Revisada", quien: cab.revisadaNombre, cuando: cab.revisadaEl, nota: cab.notaRevision });
  if (cab.aprobadaEl && cab.aprobadaNombre) pasos.push({ que: "Aprobada", quien: cab.aprobadaNombre, cuando: cab.aprobadaEl });
  const params = (cab.parametros ?? {}) as { provisionales?: string[] };
  let accion: PanelLiquidacion["accion"] = null;
  let motivo: string | null = null;
  if (cab.estado === "BORRADOR") {
    if (!puede(a, "liquidaciones", "editar")) motivo = "La revisa Administración o Dirección.";
    else if (!a.personaId) motivo = SIN_FICHA_NO_REVISA;
    else if (cobraEl) motivo = "Cobrás en este proyecto: la revisa otra persona.";
    else accion = "REVISAR";
  } else if (cab.estado === "REVISADA") {
    if (a.rol !== "DIRECCION") motivo = "La aprueba Dirección con el código de su app.";
    else if (!a.personaId) motivo = SIN_FICHA_NO_REVISA;
    else if (cobraEl) motivo = "Cobrás en este proyecto: la aprueba otra persona de Dirección.";
    else accion = "APROBAR";
  }
  const propuesta = await propuestaDeAjuste(prisma, tenantId, cab);
  let motivoAjuste: string | null = null;
  if (propuesta) {
    if (a.rol !== "DIRECCION") motivoAjuste = "El ajuste lo aprueba Dirección con el código de su app.";
    else if (!a.personaId) motivoAjuste = SIN_FICHA_NO_REVISA;
    else if (cobraEl) motivoAjuste = "Cobrás en este proyecto: el ajuste lo aprueba otra persona de Dirección.";
  }
  return {
    ...base,
    esperado: n(cab.esperado),
    comparaciones: comparacionesDeRevision({ ...congelados, ...cobro }),
    pasos,
    propuesta,
    apruebaAjuste: !!propuesta && !motivoAjuste,
    motivoAjuste,
    provisionales: (params.provisionales ?? []).map(nombreDe),
    avisos: Array.isArray(cab.avisos) ? (cab.avisos as string[]) : [],
    accion,
    motivo,
  };
}

/**
 * «Mi liquidación»: la parte de la persona de la sesión en cada proyecto vivo donde está en el equipo. Sólo su fila (el
 * filtro de `liquidacionVisible` con `veTodo = false`), aunque quien entra tenga permiso de ver todas.
 */
export async function misPartesDeProyectos(a: { tenantId: string; personaId: string | null }) {
  if (!a.personaId) return [];
  const equipos = await prisma.proyectoEquipo.findMany({
    where: { tenantId: a.tenantId, personaId: a.personaId, proyecto: { perdidoEl: null } },
    orderBy: { proyecto: { fechaEvento: "desc" } },
    take: 12,
    select: { proyecto: { select: { id: true, nombre: true } } },
  });
  const vistos = new Set<string>();
  const partes = [];
  for (const { proyecto } of equipos) {
    if (vistos.has(proyecto.id)) continue;
    vistos.add(proyecto.id);
    const v = await liquidacionVisible(a, proyecto.id, false);
    const mia = v.filas[0];
    if (mia) partes.push({ proyectoId: proyecto.id, proyecto: proyecto.nombre, estado: v.estado, provisoria: v.provisoria, total: mia.total });
  }
  return partes;
}
