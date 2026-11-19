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
import { parametrosDelNegocio } from "./parametros/leer.server";
import type { ParticipanteFoto } from "./precio-proyecto-core";
import { actorActual, proyectoVisible, puede, type Actor } from "./gestion.server";
import { CATALOGO } from "./parametros/catalogo";
import { calcularLiquidacion, comparacionesDeRevision, listaParaLaMensual, nombreDeLineaMensual, type Comparacion, type LiquidacionCalculada } from "./liquidacion-proyecto-core";

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
  const p = f.parametros as Record<string, unknown>;
  const comisiones = (p.comisiones ?? {}) as Record<string, number>;
  const participantes = f.participantes as unknown as ParticipanteFoto[];
  const valores = Object.fromEntries(CLAVES.map((k) => [k, String(params[k].valor)])) as Medicion["parametros"]["valores"];
  const provisionales = CLAVES.filter((k) => params[k].provisional);
  const costoReal = centavosDe(real.costoReal);
  const foto = { presupuestoId: f.presupuestoId, version: f.version, totalVenta: n(f.totalVentaCentavos), costoOriginal: n(f.costoOriginalCentavos), adicionales: n(f.adicionalesCentavos), redondeoBruto: n(f.redondeoBrutoCentavos), participantes };
  const calculo = calcularLiquidacion({
    totalVenta: foto.totalVenta,
    costoOriginal: foto.costoOriginal,
    adicionales: foto.adicionales,
    redondeoBruto: foto.redondeoBruto,
    rentabilidad: n(p.rentabilidad as number),
    margenError: n(p.margenError as number),
    comisiones,
    participantes,
    costoReal,
    defensaNegativa: valores["reparto.defensaNegativa"],
  });
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

/** Las líneas de comprobante imputadas DESPUÉS de congelar el costo: quedan fuera, marcadas para ajuste (T12). */
export async function comprobantesParaAjuste(db: Db, tenantId: string, proyectoId: string, costoDetalle: unknown): Promise<{ id: string; costo: number; origen: string }[]> {
  const congeladas = new Set(((costoDetalle as Medicion["costoDetalle"] | null)?.lineasDeComprobante ?? []) as string[]);
  const filas = await db.proyectoComprobanteLinea.findMany({
    where: { tenantId, proyectoId, comprobante: { anuladoEl: null } },
    select: { id: true, costoCentavos: true, comprobante: { select: { tipo: true, numero: true, supplier: { select: { name: true } } } } },
  });
  return filas.filter((l) => !congeladas.has(l.id)).map((l) => ({ id: l.id, costo: n(l.costoCentavos), origen: `${l.comprobante.supplier.name} · ${l.comprobante.tipo} ${l.comprobante.numero}` }));
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
    return { m5, provisoria: guardada.estado !== "APROBADA", estado: guardada.estado, filas: filtrar(filas), cabecera: veTodo ? guardada : null };
  }
  const m = await medirProyecto(prisma, tenantId, proyectoId, m3);
  if (!m) return { m5, provisoria: true, estado: null, filas: [] as FilaVisible[], cabecera: null };
  const filas: FilaVisible[] = m.calculo.lineas.map(({ detalle: _d, ...l }) => l);
  return { m5, provisoria: true, estado: null, filas: filtrar(filas), cabecera: null, medicion: veTodo ? m : undefined };
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
 */
export async function lineasParaLaMensual(db: Db, tenantId: string): Promise<{ porPersona: Map<string, string[]>; esperando: string[] }> {
  const porPersona = new Map<string, string[]>();
  const esperando: string[] = [];
  if (!(await hayM5(db))) return { porPersona, esperando };
  const aprobadas = await db.proyectoLiquidacionProyecto.findMany({
    where: { tenantId, estado: "APROBADA" },
    select: { proyectoId: true, proyecto: { select: { nombre: true } }, lineas: { where: { personaId: { not: null }, total: { gt: 0 } }, select: { id: true, personaId: true } } },
  });
  if (aprobadas.length === 0) return { porPersona, esperando };
  const [tc, config, params] = await Promise.all([tiposDeCambio(tenantId, db), configProyectos(tenantId, db as Prisma.TransactionClient), parametrosDelNegocio(tenantId, db)]);
  const cobranzas = await cobranzasDelNegocio(tenantId, tc, config.margenPct, aprobadas.map((l) => l.proyectoId), db);
  const cuando = String(params["reparto.cuandoSePaga"].valor);
  for (const l of aprobadas) {
    const r = listaParaLaMensual({ estado: "APROBADA", cuandoSePaga: cuando, porCobrar: centavosDe(cobranzas.get(l.proyectoId)?.porCobrar ?? 0) });
    if (!r.lista) {
      esperando.push(`${l.proyecto.nombre}: ${r.motivo}`);
      continue;
    }
    for (const x of l.lineas) porPersona.set(x.personaId!, [...(porPersona.get(x.personaId!) ?? []), x.id]);
  }
  return { porPersona, esperando };
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
  paraAjuste: { id: string; costo: number; origen: string }[];
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
  const base: PanelLiquidacion = { m5: v.m5, sinFoto, estado, provisoria: v.provisoria, veTodo, filas: v.filas, esperado: null, comparaciones: [], pasos: [], paraAjuste: [], provisionales: [], avisos: [], accion: null, motivo: null };
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
    else if (cobraEl) motivo = "Cobrás en este proyecto: la revisa otra persona.";
    else accion = "REVISAR";
  } else if (cab.estado === "REVISADA") {
    if (a.rol !== "DIRECCION") motivo = "La aprueba Dirección con el código de su app.";
    else if (cobraEl) motivo = "Cobrás en este proyecto: la aprueba otra persona de Dirección.";
    else accion = "APROBAR";
  }
  return {
    ...base,
    esperado: n(cab.esperado),
    comparaciones: comparacionesDeRevision({ ...congelados, ...cobro }),
    pasos,
    paraAjuste: cab.estado === "APROBADA" ? await comprobantesParaAjuste(prisma, tenantId, proyectoId, cab.costoDetalle) : [],
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
