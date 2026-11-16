// ============================================================================
// CRM COMERCIAL — acceso a la base (GSG-CRM-010).
// ============================================================================
//
// Todo pasa por `tenantTransaction({ tenantId })` (RLS por negocio) y además filtra `tenantId` a mano: con
// RLS apagado el filtro explícito es lo único que acota (E13). Cada operación: (1) carga la membresía del
// usuario (`MiembroCrmComercial`; el permiso NO sale de `clients:manage`, E16), (2) pregunta a `permisos.ts`
// y, si es un puesto, sus topes del día (E11), (3) valida con `motor.ts` (el único que decide pases, E4),
// (4) escribe y deja una fila en `ActividadComercial` (quién, qué, sobre qué oportunidad: A10).
//
// Concurrencia: la etapa y el borrador se escriben con control optimista (`updateMany` con la `version` o el
// estado leídos: una entra, la otra recibe aviso, E2/A6). Tomar de la cola es atómico: `UPDATE … WHERE estado
// = 'EN_COLA'` (por id) o `FOR UPDATE SKIP LOCKED` (el siguiente): una sesión lo toma, la otra sigue con el
// siguiente (E22). Los reintentos del agente no duplican: claves `idempotencia` únicas por negocio (E3).
//
// Migración 20261116150000_crm_comercial sin aplicar (Gate 2): la tabla o columna ausente no es un 500,
// vuelve `faltaMigracion`. Nada de acá le manda nada a terceros: los mensajes los manda una persona.

import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { isPrismaError } from "@/lib/prisma-errors";
import { claveMarca } from "@/lib/eventos-sponsors/core";
import { VARA } from "./vara";
import {
  alCambiarFechaDelEvento,
  avisoDeExclusividad,
  bandejaHoy,
  CANALES,
  cierreDesdeProyecto,
  CONTACTO_ANONIMO,
  cuitValido,
  despertar,
  detectarInstruccion,
  diaValido,
  dominioDe,
  esEtapa,
  esMotivo,
  ETAPA_INICIAL,
  ETIQUETA_ETAPA,
  esTerminal,
  faltantesDelBrief,
  huellasDeContacto,
  identidadPorDominio,
  linkWhatsappSinNumero,
  normalizarEmail,
  normalizarTelefono,
  propuestaPorFaltaDeDatos,
  propuestaPorSilencio,
  proponerDestino,
  prospectarEnFrio,
  puedeEscribirle,
  puntuar,
  claveTareaVencida,
  TERMINALES,
  textoDelBrief,
  TIPOS,
  validarPase,
  validarPaseBorrador,
  validarProximoPaso,
  type CamposBrief,
  type Canal,
  type DatosComerciales,
  type Destino,
  type EntradaHoy,
  type Etapa,
  type EvidenciaPase,
  type EstadoBorrador,
  type TipoOportunidad,
  type VistaPase,
} from "./motor";
import { dentroDeTopes, PUESTOS, puede, ROLES, type ContextoOportunidad, type Contexto, type Miembro, type Operacion, type Puesto, type Rol } from "./permisos";

type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

/** Quién pide: el negocio del request y el usuario de la sesión. Lo arma la acción del servidor. */
export interface Ctx {
  tenantId: string;
  userId: string;
}

export const MIGRACION_PENDIENTE = "Falta un paso de base de datos para usar el CRM comercial. Avisale a GSG.";
const CAMBIO_CONCURRENTE = "Alguien la cambió recién. Recargá y mirá de nuevo antes de seguir.";

export type Res<T extends object = object> = ({ ok: true } & T) | { ok: false; motivo: string; faltaMigracion?: true };

/** Rechazo dentro de la transacción: deshace todo lo que se escribió y vuelve como `{ ok: false, motivo }`. */
export class RechazoCrm extends Error {
  constructor(
    readonly motivo: string,
    readonly oportunidadId: string | null = null,
  ) {
    super(motivo);
  }
}

const TABLAS = "MiembroCrmComercial|ContactoComercial|SupresionComercial|Oportunidad|ActividadComercial|BriefComercial|BorradorMensaje|TareaComercial";
const COLUMNAS = "tomadoPor|tomadoEl|cerradoEl|notaCierre|dominio|cuit";

/** ¿El error es «falta la tabla o la columna» (migración sin aplicar)? */
export function esFaltaDeTabla(e: unknown): boolean {
  if (isPrismaError(e, "P2021") || isPrismaError(e, "P2022")) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return new RegExp(`relation "(${TABLAS})" does not exist|column "?(\\w+\\.)?"?(${COLUMNAS})"? (of relation "\\w+" )?does not exist`).test(msg);
}

/**
 * Corre `fn` en una transacción del negocio. `RechazoCrm` → rechazo (y queda registrado en una transacción
 * aparte, porque la de la acción se deshizo: R5, «las intentadas quedan rechazadas y registradas»).
 */
async function correr<T extends object>(ctx: Ctx, fn: (tx: Tx) => Promise<Res<T>>): Promise<Res<T>> {
  try {
    return await tenantTransaction((tx) => fn(tx), { tenantId: ctx.tenantId });
  } catch (e) {
    if (e instanceof RechazoCrm) {
      await registrarRechazo(ctx, e).catch(() => {});
      return { ok: false, motivo: e.motivo };
    }
    if (esFaltaDeTabla(e)) return { ok: false, motivo: MIGRACION_PENDIENTE, faltaMigracion: true };
    throw e;
  }
}

async function registrarRechazo(ctx: Ctx, e: RechazoCrm): Promise<void> {
  await tenantTransaction(
    async (tx) => {
      const m = await tx.miembroCrmComercial.findUnique({ where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } }, select: { puesto: true } });
      let oportunidadId = e.oportunidadId;
      if (oportunidadId) {
        const existe = await tx.oportunidad.findFirst({ where: { id: oportunidadId, tenantId: ctx.tenantId }, select: { id: true } });
        if (!existe) oportunidadId = null;
      }
      await tx.actividadComercial.create({
        data: { tenantId: ctx.tenantId, oportunidadId, usuarioId: ctx.userId, puesto: m?.puesto ?? null, tipo: "ACCION_RECHAZADA", texto: e.motivo.slice(0, 4000) },
        select: { id: true },
      });
    },
    { tenantId: ctx.tenantId },
  );
}

const no = (motivo: string, oportunidadId: string | null = null): never => {
  throw new RechazoCrm(motivo, oportunidadId);
};

// ── Membresía, alcance y topes ──────────────────────────────────────────────

async function miembroDe(tx: Tx, ctx: Ctx): Promise<Miembro | null> {
  const m = await tx.miembroCrmComercial.findUnique({
    where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ctx.userId } },
    select: { userId: true, rol: true, puesto: true, activo: true, topeAccionesDia: true, topeCostoDiaUsd: true },
  });
  if (!m) return null;
  return {
    userId: m.userId,
    rol: m.rol as Rol,
    puesto: (m.puesto ?? null) as Puesto | null,
    activo: m.activo,
    topeAccionesDia: m.topeAccionesDia,
    topeCostoDiaUsd: m.topeCostoDiaUsd == null ? null : Number(m.topeCostoDiaUsd),
  };
}

/** Comienzo del día en Argentina (UTC−3, sin horario de verano). */
/** Igual al CHECK `Oportunidad_textos_check` (`proximoPaso` ≤ 300) de la migración. */
export const MAX_PROXIMO_PASO = 300;

export function inicioDelDiaAR(ahora: Date): Date {
  const MS_DIA = 86_400_000;
  const OFF = 3 * 3_600_000;
  return new Date(Math.floor((ahora.getTime() - OFF) / MS_DIA) * MS_DIA + OFF);
}

/** Permiso + topes del puesto (E11), ANTES de escribir (E12: el rechazo vive acá, no en la pantalla). */
async function guardia(tx: Tx, ctx: Ctx, op: Operacion, contexto: Contexto, ahora: Date, costoUsd = 0, oportunidadId: string | null = null): Promise<Miembro> {
  const m = await miembroDe(tx, ctx);
  const r = puede(m, op, contexto);
  if (!r.ok) no(r.motivo, oportunidadId);
  const miembro = m as Miembro;
  if (miembro.rol === "PUESTO") {
    const agg = await tx.actividadComercial.aggregate({
      where: { tenantId: ctx.tenantId, usuarioId: ctx.userId, createdAt: { gte: inicioDelDiaAR(ahora) }, tipo: { not: "ACCION_RECHAZADA" } },
      _count: { _all: true },
      _sum: { costoUsd: true },
    });
    const t = dentroDeTopes(miembro, { accionesHoy: agg._count._all, costoHoyUsd: Number(agg._sum.costoUsd ?? 0) }, costoUsd);
    if (!t.ok) no(t.motivo, oportunidadId);
  }
  return miembro;
}

const SEL_OP = {
  id: true,
  tipo: true,
  marcaId: true,
  eventoId: true,
  contactoId: true,
  etapa: true,
  etapaPrevia: true,
  duenoUserId: true,
  datos: true,
  identidadComprobada: true,
  destino: true,
  destinoConfirmado: true,
  proximoPaso: true,
  proximoPasoEl: true,
  despertarEl: true,
  pasePropuesto: true,
  pasePropuestoDatos: true,
  pedidosDeDatos: true,
  seguimientosSinRespuesta: true,
  proyectoId: true,
  moneda: true,
  monto: true,
  creadaPor: true,
  version: true,
} as const;
type FilaOp = Prisma.OportunidadGetPayload<{ select: typeof SEL_OP }>;

async function cargarOportunidad(tx: Tx, ctx: Ctx, id: string): Promise<FilaOp> {
  const o = await tx.oportunidad.findFirst({ where: { id, tenantId: ctx.tenantId }, select: SEL_OP });
  if (!o) no("Esa oportunidad no existe.");
  return o as FilaOp;
}

async function contextoDe(tx: Tx, ctx: Ctx, o: { id: string; duenoUserId: string | null; creadaPor: string }): Promise<ContextoOportunidad> {
  const tareas = await tx.tareaComercial.findMany({
    where: { tenantId: ctx.tenantId, oportunidadId: o.id, estado: "EN_CURSO" },
    select: { tomadaPor: true },
  });
  return { duenoUserId: o.duenoUserId, creadaPor: o.creadaPor, tomadoresEnCurso: tareas.map((t) => t.tomadaPor).filter((x): x is string => !!x) };
}

/** Atajo: carga la oportunidad, su contexto, y pasa la guardia. */
async function sobre(tx: Tx, ctx: Ctx, id: string, op: Operacion, ahora: Date, extra: Omit<Contexto, "oportunidad"> = {}, costoUsd = 0) {
  const o = await cargarOportunidad(tx, ctx, id);
  const miembro = await guardia(tx, ctx, op, { ...extra, oportunidad: await contextoDe(tx, ctx, o) }, ahora, costoUsd, o.id);
  return { o, miembro };
}

async function registrar(
  tx: Tx,
  ctx: Ctx,
  m: Miembro | null,
  a: { oportunidadId?: string | null; tipo: string; texto: string; fuenteUrl?: string | null; costoUsd?: number | null; idempotencia?: string | null },
): Promise<void> {
  await tx.actividadComercial.create({
    data: {
      tenantId: ctx.tenantId,
      oportunidadId: a.oportunidadId ?? null,
      usuarioId: ctx.userId,
      puesto: m?.rol === "PUESTO" ? m.puesto : null,
      tipo: a.tipo,
      texto: a.texto.slice(0, 4000),
      fuenteUrl: a.fuenteUrl && /^https?:\/\//i.test(a.fuenteUrl) ? a.fuenteUrl.slice(0, 2000) : null,
      costoUsd: a.costoUsd != null && a.costoUsd > 0 ? a.costoUsd : null,
      idempotencia: a.idempotencia ?? null,
    },
    select: { id: true },
  });
}

/** Sube la versión sólo si nadie la cambió desde que se leyó (E2). */
async function escribirOp(tx: Tx, ctx: Ctx, o: { id: string; version: number }, data: Prisma.OportunidadUncheckedUpdateManyInput): Promise<void> {
  const r = await tx.oportunidad.updateMany({ where: { id: o.id, tenantId: ctx.tenantId, version: o.version }, data: { ...data, version: { increment: 1 } } });
  if (r.count !== 1) no(CAMBIO_CONCURRENTE, o.id);
}

// ── Datos estructurados y brief ─────────────────────────────────────────────

const txt = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** Sólo los campos que cuentan, con su tipo. Lo demás se descarta (el texto libre no entra, E24). */
export function datosLimpios(x: unknown): DatosComerciales {
  const d = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const out: DatosComerciales = {};
  if (diaValido(d.fechaEvento)) out.fechaEvento = d.fechaEvento as string;
  const tipo = txt(d.tipoTrabajo, 60);
  if (tipo) out.tipoTrabajo = tipo;
  const min = num(d.presupuestoMin);
  const max = num(d.presupuestoMax);
  if (min !== null) out.presupuestoMin = min;
  if (max !== null) out.presupuestoMax = max;
  const quien = txt(d.quienDecide, 120);
  if (quien) out.quienDecide = quien;
  if (typeof d.encaje === "boolean") out.encaje = d.encaje;
  return out;
}

/** El brief: lo que ya sabe la oportunidad (marca, evento, datos) + lo que se escribió aparte (objetivo). */
function briefDe(o: { datos: unknown }, marca: string | null, evento: string | null, guardado: unknown): CamposBrief {
  const d = datosLimpios(o.datos);
  const g = (guardado && typeof guardado === "object" ? guardado : {}) as Record<string, unknown>;
  const presupuesto =
    d.presupuestoMin != null || d.presupuestoMax != null ? [d.presupuestoMin, d.presupuestoMax].filter((x) => x != null).join(" a ") : null;
  return {
    marca,
    evento,
    fechaEvento: d.fechaEvento ?? null,
    tipoTrabajo: d.tipoTrabajo ?? null,
    presupuesto,
    quienDecide: d.quienDecide ?? null,
    objetivo: txt(g.objetivo, 2000),
  };
}

async function vistaDe(tx: Tx, ctx: Ctx, o: FilaOp): Promise<{ vista: VistaPase; marcaNombre: string | null; brief: CamposBrief }> {
  const [marca, evento, contacto, relacion, enviados, respuestas, brief] = await Promise.all([
    o.marcaId ? tx.marcaRelevada.findFirst({ where: { id: o.marcaId, tenantId: ctx.tenantId }, select: { nombre: true } }) : null,
    o.eventoId ? tx.eventoRelevado.findFirst({ where: { id: o.eventoId, tenantId: ctx.tenantId }, select: { nombre: true, verificacion: true, urlFuente: true } }) : null,
    o.contactoId ? tx.contactoComercial.findFirst({ where: { id: o.contactoId, tenantId: ctx.tenantId }, select: { origen: true, suprimidoEl: true, email: true, telefono: true } }) : null,
    o.marcaId && o.eventoId
      ? tx.eventoMarca.findFirst({
          where: { tenantId: ctx.tenantId, eventoId: o.eventoId, marcaId: o.marcaId },
          orderBy: [{ verificacion: "asc" }],
          select: { verificacion: true, urlFuente: true },
        })
      : null,
    tx.borradorMensaje.count({ where: { tenantId: ctx.tenantId, oportunidadId: o.id, estado: "ENVIADO_POR_PERSONA" } }),
    tx.actividadComercial.count({ where: { tenantId: ctx.tenantId, oportunidadId: o.id, tipo: "RESPUESTA_CLIENTE" } }),
    tx.briefComercial.findFirst({ where: { tenantId: ctx.tenantId, oportunidadId: o.id }, select: { campos: true } }),
  ]);
  // La marca se verifica EN el evento (EventoMarca: rol, fuente y verificación; «confirmado» ordena primero).
  const confirmada = relacion;
  const contactoSuprimido = contacto ? !!contacto.suprimidoEl || (await huellaSuprimida(tx, ctx, contacto)) : false;
  const campos = briefDe(o, marca?.nombre ?? null, evento?.nombre ?? null, brief?.campos);
  return {
    marcaNombre: marca?.nombre ?? null,
    brief: campos,
    vista: {
      tipo: o.tipo as TipoOportunidad,
      etapa: o.etapa as Etapa,
      etapaPrevia: (o.etapaPrevia ?? null) as Etapa | null,
      marca: confirmada ? { verificacion: confirmada.verificacion, urlFuente: confirmada.urlFuente } : null,
      evento: evento ? { verificacion: evento.verificacion, urlFuente: evento.urlFuente } : null,
      contacto: contacto ? { cargadoPorPersona: ["DIRECCION", "COMERCIAL", "CONSULTA_ENTRANTE"].includes(contacto.origen), suprimido: contactoSuprimido } : null,
      borradoresEnviadosPorPersona: enviados,
      respuestasDelCliente: respuestas,
      identidadComprobada: o.identidadComprobada,
      brief: campos,
      datos: datosLimpios(o.datos),
      destino: (o.destino ?? null) as Destino | null,
      destinoConfirmado: o.destinoConfirmado,
    },
  };
}

// ── Membresía (configurar) ──────────────────────────────────────────────────

export interface DatosMiembro {
  userId: string;
  rol: string;
  puesto?: string | null;
  topeAccionesDia?: number | null;
  topeCostoDiaUsd?: number | null;
  activo?: boolean;
}

/**
 * Alta o cambio de un miembro. Lo hace Dirección (`configurar`). Arranque: si el negocio todavía no tiene a
 * nadie en Dirección, la dueña del negocio (`esDuenioDelNegocio`, lo decide la acción) puede darse de alta.
 */
export async function guardarMiembro(ctx: Ctx, d: DatosMiembro, opts: { esDuenioDelNegocio: boolean; ahora?: Date }): Promise<Res<{ id: string }>> {
  const ahora = opts.ahora ?? new Date();
  return correr(ctx, async (tx) => {
    const direccion = await tx.miembroCrmComercial.count({ where: { tenantId: ctx.tenantId, rol: "DIRECCION", activo: true } });
    const arranque = direccion === 0 && opts.esDuenioDelNegocio && d.userId === ctx.userId && d.rol === "DIRECCION";
    const m = arranque ? null : await guardia(tx, ctx, "configurar", {}, ahora);
    if (!(ROLES as readonly string[]).includes(d.rol)) no("Ese rol no existe en el CRM.");
    const puesto = d.rol === "PUESTO" ? d.puesto ?? null : null;
    if (d.rol === "PUESTO" && !(PUESTOS as readonly string[]).includes(puesto ?? "")) no("Elegí el puesto del equipo para ese usuario.");
    if ((d.topeAccionesDia ?? 0) < 0 || (d.topeCostoDiaUsd ?? 0) < 0) no("Los topes no pueden ser negativos.");
    const usuario = await tx.user.findFirst({ where: { id: d.userId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!usuario) no("Ese usuario no es de este negocio.");
    const datos = {
      rol: d.rol,
      puesto,
      topeAccionesDia: d.topeAccionesDia ?? null,
      topeCostoDiaUsd: d.topeCostoDiaUsd ?? null,
      activo: d.activo ?? true,
    };
    const fila = await tx.miembroCrmComercial.upsert({
      where: { tenantId_userId: { tenantId: ctx.tenantId, userId: d.userId } },
      create: { tenantId: ctx.tenantId, userId: d.userId, creadoPor: ctx.userId, ...datos },
      update: datos,
      select: { id: true },
    });
    await registrar(tx, ctx, m, { tipo: "MIEMBRO", texto: `Alta o cambio de miembro: ${d.rol}${puesto ? ` · ${puesto}` : ""}${datos.activo ? "" : " (inactivo)"}.` });
    return { ok: true, id: fila.id };
  });
}

// ── Marcas: E1 (dominio o CUIT) y E18 (no se unen solas) ───────────────────

export interface MarcaPedida {
  marcaId?: string | null;
  nombre?: string | null;
  web?: string | null;
  dominio?: string | null;
  cuit?: string | null;
  rubro?: string | null;
}

async function resolverMarca(tx: Tx, ctx: Ctx, p: MarcaPedida): Promise<{ id: string; nombre: string; rubro: string | null }> {
  const SEL = { id: true, nombre: true, rubro: true, dominio: true, cuit: true } as const;
  if (p.marcaId) {
    const m = await tx.marcaRelevada.findFirst({ where: { id: p.marcaId, tenantId: ctx.tenantId }, select: SEL });
    if (!m) no("Esa marca no existe.");
    return m as { id: string; nombre: string; rubro: string | null };
  }
  const dominio = dominioDe(p.dominio ?? p.web ?? null);
  const cuit = p.cuit ? cuitValido(p.cuit) : null;
  if (p.cuit && !cuit) no("El CUIT no es válido (revisá los 11 números).");
  const porDominio = dominio ? await tx.marcaRelevada.findFirst({ where: { tenantId: ctx.tenantId, dominio }, select: SEL }) : null;
  const porCuit = cuit ? await tx.marcaRelevada.findFirst({ where: { tenantId: ctx.tenantId, cuit }, select: SEL }) : null;
  if (porDominio && porCuit && porDominio.id !== porCuit.id) {
    no(`El dominio es de «${porDominio.nombre}» y el CUIT de «${porCuit.nombre}». No se unen solas: si son la misma, que lo decida una persona.`);
  }
  let m = porDominio ?? porCuit;
  if (!m) {
    const nombre = txt(p.nombre, 200);
    if (!nombre) no("Falta el nombre de la marca.");
    const porNombre = await tx.marcaRelevada.findFirst({ where: { tenantId: ctx.tenantId, clave: claveMarca(nombre as string) }, select: SEL });
    if (porNombre) {
      const choca = (dominio && porNombre.dominio && porNombre.dominio !== dominio) || (cuit && porNombre.cuit && porNombre.cuit !== cuit);
      if (choca) no(`Ya hay una marca «${porNombre.nombre}» con otro dominio o CUIT. No se unen solas: si son la misma (o compra a través de otra), que lo decida una persona.`);
      m = porNombre;
    } else {
      const creada = await tx.marcaRelevada.create({
        data: { tenantId: ctx.tenantId, clave: claveMarca(nombre as string), nombre: nombre as string, web: txt(p.web, 300), dominio, cuit, rubro: txt(p.rubro, 120) },
        select: SEL,
      });
      return creada;
    }
  }
  const completar: { dominio?: string; cuit?: string } = {};
  if (dominio && !m.dominio) completar.dominio = dominio;
  if (cuit && !m.cuit) completar.cuit = cuit;
  if (Object.keys(completar).length) await tx.marcaRelevada.updateMany({ where: { id: m.id, tenantId: ctx.tenantId }, data: completar });
  return m;
}

// ── Oportunidades ───────────────────────────────────────────────────────────

export interface NuevaOportunidad {
  tipo: string;
  marca?: MarcaPedida | null;
  eventoId?: string | null;
  compraAtravesDeMarcaId?: string | null;
  consultaTexto?: string | null;
  datos?: unknown;
  proximoPaso: string;
  proximoPasoEl: Date;
  fechaLimite?: Date | null;
  fuenteUrl?: string | null;
  costoUsd?: number | null;
  idempotencia?: string | null;
}

/**
 * Proponer una oportunidad (un puesto: prospecto relevado) o cargar una consulta entrante (una persona).
 * E1: si ya hay una abierta para la misma marca × evento, se une a esa. E3: el reintento con la misma clave
 * devuelve la misma. E5: sin próximo paso no se guarda. E10/E24: el texto se guarda como dato y no puntúa.
 * E17: una marca cliente o con proyecto activo no se prospecta en frío. E21: aviso de exclusividad de rubro.
 */
export async function proponerOportunidad(ctx: Ctx, n: NuevaOportunidad, ahora = new Date()): Promise<Res<{ id: string; repetida?: true; unida?: true; aviso?: string | null }>> {
  const intento = () =>
    correr<{ id: string; repetida?: true; unida?: true; aviso?: string | null }>(ctx, async (tx) => {
      const m = await guardia(tx, ctx, "proponer_oportunidad", {}, ahora, n.costoUsd ?? 0);
      if (!(TIPOS as readonly string[]).includes(n.tipo)) no("El tipo tiene que ser PROSPECTO o CONSULTA.");
      const tipo = n.tipo as TipoOportunidad;
      if (tipo === "CONSULTA" && m.rol === "PUESTO") no("Una consulta entrante la carga una persona, no un puesto del equipo.");
      if (n.idempotencia) {
        const ya = await tx.oportunidad.findFirst({ where: { tenantId: ctx.tenantId, idempotencia: n.idempotencia }, select: { id: true } });
        if (ya) return { ok: true, id: ya.id, repetida: true };
      }
      const etapa = ETAPA_INICIAL[tipo];
      const paso = validarProximoPaso(etapa, n.proximoPaso, n.proximoPasoEl);
      if (!paso.ok) no(paso.motivo);
      if (tipo === "PROSPECTO" && !n.marca) no("Un prospecto necesita la marca.");
      const marca = n.marca ? await resolverMarca(tx, ctx, n.marca) : null;
      const evento = n.eventoId ? await tx.eventoRelevado.findFirst({ where: { id: n.eventoId, tenantId: ctx.tenantId }, select: { id: true } }) : null;
      if (n.eventoId && !evento) no("Ese evento no existe.");
      if (n.compraAtravesDeMarcaId) {
        const via = await tx.marcaRelevada.findFirst({ where: { id: n.compraAtravesDeMarcaId, tenantId: ctx.tenantId }, select: { id: true } });
        if (!via || via.id === marca?.id) no("La marca por la que compra tiene que ser otra marca de este negocio.");
      }
      const consulta = txt(n.consultaTexto, 10_000);
      const instruccion = detectarInstruccion(consulta);
      let aviso: string | null = null;

      if (marca) {
        // E1: la misma marca × evento ya tiene una abierta → se une a esa (la consulta queda en su línea de tiempo).
        const abierta = await tx.oportunidad.findFirst({
          where: { tenantId: ctx.tenantId, marcaId: marca.id, eventoId: evento?.id ?? null, etapa: { notIn: [...TERMINALES] } },
          select: { id: true },
        });
        if (abierta) {
          await registrar(tx, ctx, m, { oportunidadId: abierta.id, tipo: "UNIDA", texto: `Llegó otra vez la misma marca (${tipo === "CONSULTA" ? "consulta entrante" : "prospecto"}): se une a esta oportunidad.${consulta ? ` Texto recibido: ${consulta}` : ""}`, fuenteUrl: n.fuenteUrl, costoUsd: n.costoUsd });
          if (instruccion.nota) await registrar(tx, ctx, m, { oportunidadId: abierta.id, tipo: "INSTRUCCION_ANOTADA", texto: instruccion.nota });
          return { ok: true, id: abierta.id, unida: true };
        }
        const previas = await tx.oportunidad.findMany({ where: { tenantId: ctx.tenantId, marcaId: marca.id, etapa: { in: ["ASIGNADA", "GANADA"] } }, select: { id: true, etapa: true, duenoUserId: true } });
        if (tipo === "PROSPECTO") {
          const frio = prospectarEnFrio({ esCliente: previas.some((p) => p.etapa === "GANADA"), proyectoActivo: previas.some((p) => p.etapa === "ASIGNADA") });
          if (!frio.ok) {
            // E17: no se prospecta; el aviso queda en la oportunidad que lo atiende y el rechazo, registrado.
            const quien = previas.find((p) => p.etapa === "ASIGNADA") ?? previas[0];
            await registrar(tx, ctx, m, { oportunidadId: quien.id, tipo: "AVISO", texto: `Un puesto la quiso prospectar en frío y se frenó: ${frio.motivo}` });
            await registrar(tx, ctx, m, { oportunidadId: quien.id, tipo: "ACCION_RECHAZADA", texto: frio.motivo });
            return { ok: false, motivo: frio.motivo };
          }
        }
        if (evento) {
          // E21: clientes activos (asignada o ganada) que van al mismo evento, del mismo rubro.
          const enElEvento = await tx.eventoMarca.findMany({ where: { tenantId: ctx.tenantId, eventoId: evento.id, marcaId: { not: marca.id } }, select: { marcaId: true } });
          const ids = [...new Set(enElEvento.map((r) => r.marcaId))];
          const clientes = ids.length
            ? await tx.marcaRelevada.findMany({
                where: { tenantId: ctx.tenantId, id: { in: ids }, oportunidades: { some: { tenantId: ctx.tenantId, etapa: { in: ["ASIGNADA", "GANADA"] } } } },
                select: { id: true, nombre: true, rubro: true },
              })
            : [];
          aviso = avisoDeExclusividad({ id: marca.id, rubro: marca.rubro }, clientes);
        }
      }

      const datos = datosLimpios(n.datos);
      const p = puntuar(datos, ahora, VARA);
      const op = await tx.oportunidad.create({
        data: {
          tenantId: ctx.tenantId,
          tipo,
          marcaId: marca?.id ?? null,
          eventoId: evento?.id ?? null,
          compraAtravesDeMarcaId: n.compraAtravesDeMarcaId ?? null,
          etapa,
          datos: datos as Prisma.InputJsonValue,
          puntaje: p.puntaje,
          puntajeDetalle: p.detalle as unknown as Prisma.InputJsonValue,
          consultaTexto: consulta,
          proximoPaso: n.proximoPaso.trim().slice(0, MAX_PROXIMO_PASO),
          proximoPasoEl: n.proximoPasoEl,
          fechaLimite: n.fechaLimite ?? null,
          creadaPor: ctx.userId,
          idempotencia: n.idempotencia ?? null,
        },
        select: { id: true },
      });
      await registrar(tx, ctx, m, {
        oportunidadId: op.id,
        tipo: "CREADA",
        texto: tipo === "CONSULTA" ? "Entró una consulta." : `Propuesta como prospecto${marca ? ` (${marca.nombre})` : ""}.`,
        fuenteUrl: n.fuenteUrl,
        costoUsd: n.costoUsd,
      });
      if (instruccion.nota) await registrar(tx, ctx, m, { oportunidadId: op.id, tipo: "INSTRUCCION_ANOTADA", texto: instruccion.nota });
      if (aviso) await registrar(tx, ctx, m, { oportunidadId: op.id, tipo: "AVISO_EXCLUSIVIDAD", texto: aviso });
      return { ok: true, id: op.id, aviso };
    });
  try {
    return await intento();
  } catch (e) {
    // Dos reintentos a la vez (misma clave) o dos altas a la vez (misma marca × evento): la base frena la
    // segunda; se vuelve a leer y se devuelve la que entró.
    if (isPrismaError(e, "P2002")) return intento();
    throw e;
  }
}

export interface PedidoDeDatos {
  datos?: unknown;
  objetivo?: string | null;
  proximoPaso?: string | null;
  proximoPasoEl?: Date | null;
  fechaLimite?: Date | null;
  monto?: number | null;
  moneda?: string | null;
  destinoPropuesto?: string | null;
  version?: number;
  fuenteUrl?: string | null;
  costoUsd?: number | null;
}

/**
 * Cargar datos estructurados (puntuar), el objetivo del brief, el próximo paso o la licitación. El puntaje se
 * recalcula y se explica; si cambia la fecha y una CALIFICADA ya no califica, vuelve a FALTAN_DATOS (E6).
 */
export async function actualizarDatos(ctx: Ctx, id: string, d: PedidoDeDatos, ahora = new Date()): Promise<Res<{ puntaje: number; aviso: string | null }>> {
  return correr(ctx, async (tx) => {
    const op: Operacion = d.datos !== undefined || d.destinoPropuesto !== undefined ? "puntuar" : d.objetivo !== undefined ? "editar_brief" : "ver_oportunidad";
    const { o, miembro } = await sobre(tx, ctx, id, op, ahora, {}, d.costoUsd ?? 0);
    if (d.objetivo !== undefined && op === "puntuar") {
      const r = puede(miembro, "editar_brief", { oportunidad: await contextoDe(tx, ctx, o) });
      if (!r.ok) no(r.motivo, o.id);
    }
    const tocaPasoOPlata = d.proximoPaso !== undefined || d.proximoPasoEl !== undefined || d.fechaLimite !== undefined || d.monto !== undefined || d.moneda !== undefined;
    if (miembro.rol === "PUESTO" && tocaPasoOPlata) no("Un puesto del equipo no cambia el próximo paso ni la plata: lo hace una persona.", o.id);
    if (d.version !== undefined && d.version !== o.version) no(CAMBIO_CONCURRENTE, o.id);
    const etapa = o.etapa as Etapa;
    if (esTerminal(etapa)) no(`La oportunidad está cerrada («${ETIQUETA_ETAPA[etapa]}»).`, o.id);

    const data: Prisma.OportunidadUncheckedUpdateManyInput = {};
    let datos = datosLimpios(o.datos);
    let aviso: string | null = null;
    if (d.datos !== undefined) {
      const nuevos = { ...datos, ...datosLimpios(d.datos) };
      const cambiaFecha = nuevos.fechaEvento !== datos.fechaEvento;
      if (cambiaFecha && nuevos.fechaEvento) {
        const r = alCambiarFechaDelEvento({ etapa, datos: nuevos }, nuevos.fechaEvento, ahora, VARA);
        if (r.nuevaEtapa) {
          data.etapa = r.nuevaEtapa;
          data.calificadaEl = null;
          aviso = r.aviso;
        }
      }
      datos = nuevos;
      data.datos = datos as Prisma.InputJsonValue;
    }
    const p = puntuar(datos, ahora, VARA);
    data.puntaje = p.puntaje;
    data.puntajeDetalle = p.detalle as unknown as Prisma.InputJsonValue;
    if (!o.destinoConfirmado && (d.destinoPropuesto !== undefined || d.datos !== undefined)) {
      const pedido = d.destinoPropuesto === "AGENCIA" || d.destinoPropuesto === "TALLER" ? d.destinoPropuesto : null;
      if (d.destinoPropuesto && !pedido) no("El destino tiene que ser Agencia o Taller.", o.id);
      data.destino = pedido ?? proponerDestino(datos, VARA);
    }
    if (d.proximoPaso !== undefined || d.proximoPasoEl !== undefined) {
      const paso = d.proximoPaso ?? o.proximoPaso;
      const el = d.proximoPasoEl ?? o.proximoPasoEl;
      const v = validarProximoPaso((data.etapa as Etapa | undefined) ?? etapa, paso, el);
      if (!v.ok) no(v.motivo, o.id);
      data.proximoPaso = paso?.trim().slice(0, MAX_PROXIMO_PASO) ?? null;
      data.proximoPasoEl = el;
    }
    if (d.fechaLimite !== undefined) data.fechaLimite = d.fechaLimite;
    if (d.monto !== undefined) {
      if (d.monto !== null && (!Number.isFinite(d.monto) || d.monto < 0)) no("El monto no es válido.", o.id);
      data.monto = d.monto;
    }
    if (d.moneda !== undefined && d.moneda !== null) {
      if (d.moneda !== "ARS" && d.moneda !== "USD") no("La moneda tiene que ser ARS o USD.", o.id);
      data.moneda = d.moneda;
    }
    await escribirOp(tx, ctx, o, data);

    const marca = o.marcaId ? await tx.marcaRelevada.findFirst({ where: { id: o.marcaId, tenantId: ctx.tenantId }, select: { nombre: true } }) : null;
    const evento = o.eventoId ? await tx.eventoRelevado.findFirst({ where: { id: o.eventoId, tenantId: ctx.tenantId }, select: { nombre: true } }) : null;
    const previo = await tx.briefComercial.findFirst({ where: { tenantId: ctx.tenantId, oportunidadId: o.id }, select: { campos: true } });
    const guardado = { ...((previo?.campos as Record<string, unknown> | null) ?? {}), ...(d.objetivo !== undefined ? { objetivo: txt(d.objetivo, 2000) } : {}) };
    const brief = briefDe({ datos }, marca?.nombre ?? null, evento?.nombre ?? null, guardado);
    await tx.briefComercial.upsert({
      where: { oportunidadId_tenantId: { oportunidadId: o.id, tenantId: ctx.tenantId } },
      create: { tenantId: ctx.tenantId, oportunidadId: o.id, campos: guardado as Prisma.InputJsonValue, faltantes: faltantesDelBrief(brief) },
      update: { campos: guardado as Prisma.InputJsonValue, faltantes: faltantesDelBrief(brief), version: { increment: 1 } },
      select: { id: true },
    });
    await registrar(tx, ctx, miembro, {
      oportunidadId: o.id,
      tipo: "DATOS",
      texto: `Datos actualizados. Puntaje ${p.puntaje}: ${p.detalle.map((x) => x.explicacion).join(" · ")}`,
      fuenteUrl: d.fuenteUrl,
      costoUsd: d.costoUsd,
    });
    if (aviso) await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "AVISO", texto: aviso });
    return { ok: true, puntaje: p.puntaje, aviso };
  });
}

export interface PedidoDePase extends EvidenciaPase {
  proximoPaso?: string | null;
  proximoPasoEl?: Date | null;
  version?: number;
  fuenteUrl?: string | null;
  costoUsd?: number | null;
}

/** Lo común de aplicar un pase (persona, Dirección aprobando, o el cierre del proyecto). */
async function aplicar(tx: Tx, ctx: Ctx, m: Miembro | null, o: FilaOp, destino: Etapa, ev: PedidoDePase, ahora: Date): Promise<void> {
  if (ev.version !== undefined && ev.version !== o.version) no(CAMBIO_CONCURRENTE, o.id);
  if (destino === "ASIGNADA") {
    const c = ev.comercialUserId
      ? await tx.miembroCrmComercial.findUnique({ where: { tenantId_userId: { tenantId: ctx.tenantId, userId: ev.comercialUserId } }, select: { rol: true, activo: true } })
      : null;
    if (ev.comercialUserId && (!c || !c.activo || (c.rol !== "COMERCIAL" && c.rol !== "DIRECCION"))) no("Ese usuario no es un comercial activo del CRM.", o.id);
  }
  const { vista, marcaNombre, brief } = await vistaDe(tx, ctx, o);
  const v = validarPase(vista, destino, ev, ahora, VARA);
  if (!v.ok) no(v.motivo, o.id);

  const abierta = !esTerminal(destino) && destino !== "DORMIDA";
  const data: Prisma.OportunidadUncheckedUpdateManyInput = { etapa: destino, pasePropuesto: null, pasePropuestoPor: null, pasePropuestoEl: null, pasePropuestoDatos: Prisma.DbNull };
  if (abierta) {
    const paso = ev.proximoPaso ?? o.proximoPaso;
    const el = ev.proximoPasoEl ?? o.proximoPasoEl;
    const r = validarProximoPaso(destino, paso, el);
    if (!r.ok) no(r.motivo, o.id);
    data.proximoPaso = paso?.trim().slice(0, MAX_PROXIMO_PASO);
    data.proximoPasoEl = el;
  }
  if (destino === "DORMIDA") {
    data.etapaPrevia = o.etapa;
    data.despertarEl = new Date(`${ev.despertarEl}T12:00:00Z`);
  }
  if (["DORMIDA", "PERDIDA", "DESCARTADA"].includes(destino)) data.motivo = esMotivo(ev.motivo) ? ev.motivo : "OTRO";
  if (ev.nota) data.nota = ev.nota.trim().slice(0, 4000);
  if (destino === "CALIFICADA") data.calificadaEl = ahora;
  if (destino === "FALTAN_DATOS") data.calificadaEl = null;

  if (destino === "ASIGNADA") {
    data.duenoUserId = ev.comercialUserId;
    data.proyectoId = await crearProyecto(tx, ctx, o, marcaNombre, brief, ahora);
  }
  await escribirOp(tx, ctx, o, data);
  if (destino === "SIN_CONTACTO") {
    // §2: SIN_CONTACTO deja la tarea «cargar a quién escribirle» en la cola de personas (un puesto no carga
    // contactos). Una por oportunidad y entrada a la etapa: el reintento no la duplica.
    const clave = `CARGAR_CONTACTO:${o.id}:${o.version}`;
    const ya = await tx.tareaComercial.findFirst({ where: { tenantId: ctx.tenantId, idempotencia: clave }, select: { id: true } });
    if (!ya) {
      await tx.tareaComercial.create({ data: { tenantId: ctx.tenantId, oportunidadId: o.id, para: "PERSONA", tipo: "CARGAR_CONTACTO", venceEl: ev.proximoPasoEl ?? o.proximoPasoEl ?? null, creadaPor: ctx.userId, idempotencia: clave }, select: { id: true } });
      await registrar(tx, ctx, m, { oportunidadId: o.id, tipo: "TAREA", texto: "Sin contacto: nueva tarea CARGAR_CONTACTO para una persona (cargar a quién escribirle)." });
    }
  }
  await registrar(tx, ctx, m, {
    oportunidadId: o.id,
    tipo: "PASE",
    texto: `Pasó de «${ETIQUETA_ETAPA[o.etapa as Etapa]}» a «${ETIQUETA_ETAPA[destino]}».${data.motivo ? ` Motivo: ${data.motivo}.` : ""}${ev.desdeProyecto ? " Lo puso el cierre del proyecto." : ""}`,
    fuenteUrl: ev.fuenteUrl,
    costoUsd: ev.costoUsd,
  });
}

/**
 * ASIGNADA: nace el proyecto en «Lead / brief» con el brief armado (cliente nuevo con el nombre de la marca).
 * Mínimo y sin tocar Proyectos: proyecto + presupuesto v1, como el alta de Proyectos. (Desvío: no llama a
 * `crearLead`, que exige FormData y la sesión de Proyectos.) Sin lista de tareas base: en Proyectos la crea el alta
 * (`src/lib/proyectos/acciones-ficha.ts`) o el botón manual de la ficha; acá queda pendiente para T2.
 */
async function crearProyecto(tx: Tx, ctx: Ctx, o: FilaOp, marcaNombre: string | null, brief: CamposBrief, ahora: Date): Promise<string> {
  const nombreCliente = (marcaNombre ?? "Cliente de consulta").slice(0, 120);
  const cliente = await tx.client.create({ data: { tenantId: ctx.tenantId, name: nombreCliente, phone: `sin-tel-${randomBytes(4).toString("hex")}` }, select: { id: true } });
  const ultimo = await tx.proyecto.findFirst({ where: { tenantId: ctx.tenantId }, orderBy: { numero: "desc" }, select: { numero: true } });
  const datos = datosLimpios(o.datos);
  const p = await tx.proyecto.create({
    data: {
      tenantId: ctx.tenantId,
      numero: (ultimo?.numero ?? 0) + 1,
      clientId: cliente.id,
      nombre: `${nombreCliente}${brief.evento ? ` · ${brief.evento}` : ""}`.slice(0, 120),
      servicio: "EVENTOS",
      etapa: "PEDIDO",
      fechaEvento: datos.fechaEvento ? new Date(`${datos.fechaEvento}T12:00:00Z`) : null,
      moneda: o.moneda,
      presupuestoEstimado: datos.presupuestoMax ?? datos.presupuestoMin ?? null,
      brief: textoDelBrief(brief, puntuar(datos, ahora, VARA)),
    },
    select: { id: true },
  });
  await tx.proyectoPresupuesto.create({
    data: { tenantId: ctx.tenantId, proyectoId: p.id, version: 1, token: randomBytes(18).toString("base64url"), creadoPor: "CRM comercial", nota: "Versión inicial" },
    select: { id: true },
  });
  return p.id;
}

/**
 * Aplicar un pase. Lo valida el motor (grafo + evidencia, E4) y el permiso (lo «con aprobación» lo aplica
 * sólo Dirección; GANADA no la pone nadie a mano). Control de versión: si otro la movió, aviso (E2).
 */
export async function aplicarPase(ctx: Ctx, id: string, destino: string, ev: PedidoDePase = {}, ahora = new Date()): Promise<Res<{ etapa: Etapa }>> {
  return correr(ctx, async (tx) => {
    if (!esEtapa(destino)) no("Esa etapa no existe.");
    const { o, miembro } = await sobre(tx, ctx, id, "aplicar_pase", ahora, { etapaDestino: destino as Etapa }, ev.costoUsd ?? 0);
    await aplicar(tx, ctx, miembro, o, destino as Etapa, { ...ev, desdeProyecto: false }, ahora);
    return { ok: true, etapa: destino as Etapa };
  });
}

/** Un puesto (o un comercial) PROPONE un pase que aprueba Dirección. El motor lo valida igual: no se propone lo imposible. */
export async function proponerPase(ctx: Ctx, id: string, destino: string, ev: PedidoDePase = {}, ahora = new Date()): Promise<Res> {
  return correr(ctx, async (tx) => {
    if (!esEtapa(destino)) no("Esa etapa no existe.");
    const { o, miembro } = await sobre(tx, ctx, id, "proponer_pase", ahora, { etapaDestino: destino as Etapa }, ev.costoUsd ?? 0);
    if (ev.version !== undefined && ev.version !== o.version) no(CAMBIO_CONCURRENTE, o.id);
    const { vista } = await vistaDe(tx, ctx, o);
    // ASIGNADA la completa Dirección (elige al comercial): se valida sin ese dato.
    const v = validarPase(vista, destino as Etapa, destino === "ASIGNADA" ? { ...ev, comercialUserId: ev.comercialUserId ?? "por-elegir" } : { ...ev, desdeProyecto: false }, ahora, VARA);
    if (!v.ok) no(v.motivo, o.id);
    const datos = { motivo: ev.motivo ?? null, nota: ev.nota ?? null, despertarEl: ev.despertarEl ?? null, comercialUserId: ev.comercialUserId ?? null };
    await escribirOp(tx, ctx, o, { pasePropuesto: destino, pasePropuestoPor: ctx.userId, pasePropuestoEl: ahora, pasePropuestoDatos: datos as Prisma.InputJsonValue });
    await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "PASE_PROPUESTO", texto: `Propone pasar a «${ETIQUETA_ETAPA[destino as Etapa]}»${ev.motivo ? ` (motivo ${ev.motivo})` : ""}. Lo decide Dirección.`, fuenteUrl: ev.fuenteUrl, costoUsd: ev.costoUsd });
    return { ok: true };
  });
}

/** Dirección aprueba (aplica) el pase propuesto, con lo que haga falta completar (el comercial, el próximo paso). */
export async function aprobarPasePropuesto(ctx: Ctx, id: string, extra: PedidoDePase = {}, ahora = new Date()): Promise<Res<{ etapa: Etapa }>> {
  return correr(ctx, async (tx) => {
    const o = await cargarOportunidad(tx, ctx, id);
    if (!o.pasePropuesto || !esEtapa(o.pasePropuesto)) no("Esa oportunidad no tiene un pase propuesto.", o.id);
    const destino = o.pasePropuesto as Etapa;
    const miembro = await guardia(tx, ctx, "aplicar_pase", { oportunidad: await contextoDe(tx, ctx, o), etapaDestino: destino }, ahora, 0, o.id);
    const propuesto = (o.pasePropuestoDatos ?? {}) as Record<string, string | null>;
    const ev: PedidoDePase = {
      motivo: extra.motivo ?? propuesto.motivo,
      nota: extra.nota ?? propuesto.nota,
      despertarEl: extra.despertarEl ?? propuesto.despertarEl,
      comercialUserId: extra.comercialUserId ?? propuesto.comercialUserId,
      proximoPaso: extra.proximoPaso,
      proximoPasoEl: extra.proximoPasoEl,
      version: extra.version,
    };
    await aplicar(tx, ctx, miembro, o, destino, { ...ev, desdeProyecto: false }, ahora);
    return { ok: true, etapa: destino };
  });
}

/** Dirección rechaza el pase propuesto (queda registrado el porqué). */
export async function rechazarPasePropuesto(ctx: Ctx, id: string, motivo: string, ahora = new Date()): Promise<Res> {
  return correr(ctx, async (tx) => {
    const o = await cargarOportunidad(tx, ctx, id);
    if (!o.pasePropuesto) no("Esa oportunidad no tiene un pase propuesto.", o.id);
    const miembro = await guardia(tx, ctx, "aplicar_pase", { oportunidad: await contextoDe(tx, ctx, o), etapaDestino: o.pasePropuesto as Etapa }, ahora, 0, o.id);
    if (!motivo?.trim()) no("Escribí por qué no se aplica el pase.", o.id);
    await escribirOp(tx, ctx, o, { pasePropuesto: null, pasePropuestoPor: null, pasePropuestoEl: null, pasePropuestoDatos: Prisma.DbNull });
    await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "PASE_RECHAZADO", texto: `No se aplicó el pase a «${ETIQUETA_ETAPA[o.pasePropuesto as Etapa]}»: ${motivo.trim()}` });
    return { ok: true };
  });
}

/** E14: el destino lo propone el Calificador y lo confirma (o corrige) Dirección. Queda registrado. */
export async function confirmarDestino(ctx: Ctx, id: string, destino: string, ahora = new Date()): Promise<Res> {
  return correr(ctx, async (tx) => {
    const { o, miembro } = await sobre(tx, ctx, id, "confirmar_destino", ahora);
    if (destino !== "AGENCIA" && destino !== "TALLER") no("El destino tiene que ser Agencia o Taller.", o.id);
    if (esTerminal(o.etapa as Etapa)) no("La oportunidad está cerrada.", o.id);
    await escribirOp(tx, ctx, o, { destino, destinoConfirmado: true });
    const corrige = o.destino && o.destino !== destino ? ` (corrige la propuesta: ${o.destino})` : "";
    await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "DESTINO", texto: `Dirección confirmó el destino ${destino}${corrige}.` });
    return { ok: true };
  });
}

/** E9: pedir los datos que faltan. A los N pedidos sin brief completo se propone DESCARTADA «sin datos». */
export async function registrarPedidoDeDatos(ctx: Ctx, id: string, ahora = new Date(), idempotencia?: string | null): Promise<Res<{ propuesta: Etapa | null; repetido?: true }>> {
  // A7: un reintento no cuenta como un segundo pedido al cliente. Sin clave del agente, la clave es una por
  // oportunidad y día (dos pedidos de datos el mismo día son el mismo pedido).
  const clave = (idempotencia?.trim() || `PEDIDO_DATOS:${id}:${inicioDelDiaAR(ahora).toISOString().slice(0, 10)}`).slice(0, 200);
  const intento = () => correr<{ propuesta: Etapa | null; repetido?: true }>(ctx, async (tx) => {
    // Dos reintentos a la vez: el segundo espera al primero y después ve su clave (en vez de chocar por versión).
    await tx.$queryRaw`SELECT id FROM "Oportunidad" WHERE id = ${id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    const { o, miembro } = await sobre(tx, ctx, id, "marcar_faltantes", ahora);
    const ya = await tx.actividadComercial.findFirst({ where: { tenantId: ctx.tenantId, idempotencia: clave }, select: { oportunidadId: true } });
    if (ya) {
      if (ya.oportunidadId !== o.id) no("Esa clave ya se usó en otra oportunidad.", o.id);
      return { ok: true, propuesta: (o.pasePropuesto ?? null) as Etapa | null, repetido: true };
    }
    const { brief } = await vistaDe(tx, ctx, o);
    const pedidos = o.pedidosDeDatos + 1;
    const prop = propuestaPorFaltaDeDatos({ etapa: o.etapa as Etapa, pedidosDeDatos: pedidos, brief }, VARA);
    await escribirOp(tx, ctx, o, {
      pedidosDeDatos: pedidos,
      ...(prop && !o.pasePropuesto ? { pasePropuesto: prop.destino, pasePropuestoPor: ctx.userId, pasePropuestoEl: ahora, pasePropuestoDatos: { motivo: prop.motivo, nota: prop.explicacion } } : {}),
    });
    await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "PEDIDO_DE_DATOS", texto: `Se pidieron los datos que faltan (pedido ${pedidos}).`, idempotencia: clave });
    if (prop) await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "PASE_PROPUESTO", texto: `${prop.explicacion} Se propone «${ETIQUETA_ETAPA[prop.destino]}» (${prop.motivo}); decide una persona.` });
    return { ok: true, propuesta: prop?.destino ?? null };
  });
  try {
    return await intento();
  } catch (e) {
    // Dos reintentos a la vez con la misma clave: la base frena el segundo; se vuelve a leer y se ve el primero.
    if (isPrismaError(e, "P2002")) return intento();
    throw e;
  }
}

/** La persona que recibió la respuesta del cliente la registra (evidencia de EN_CONVERSACION). El texto es dato. */
export async function registrarRespuesta(ctx: Ctx, id: string, texto: string, ahora = new Date()): Promise<Res> {
  return correr(ctx, async (tx) => {
    const { o, miembro } = await sobre(tx, ctx, id, "registrar_respuesta", ahora);
    const t = txt(texto, 4000);
    if (!t) no("Escribí qué respondió el cliente.", o.id);
    await escribirOp(tx, ctx, o, { seguimientosSinRespuesta: 0 });
    await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "RESPUESTA_CLIENTE", texto: t as string });
    const ins = detectarInstruccion(t);
    if (ins.nota) await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "INSTRUCCION_ANOTADA", texto: ins.nota });
    return { ok: true };
  });
}

/** Consulta entrante: una persona comprueba quién escribe (por el dominio del mail o confirmándolo ella). */
export async function comprobarIdentidad(ctx: Ctx, id: string, d: { emailDeQuienEscribe?: string | null; confirmadaPorPersona?: boolean }, ahora = new Date()): Promise<Res> {
  return correr(ctx, async (tx) => {
    const { o, miembro } = await sobre(tx, ctx, id, "comprobar_identidad", ahora);
    const marca = o.marcaId ? await tx.marcaRelevada.findFirst({ where: { id: o.marcaId, tenantId: ctx.tenantId }, select: { dominio: true } }) : null;
    const porDominio = !!d.emailDeQuienEscribe && identidadPorDominio(d.emailDeQuienEscribe, marca?.dominio ?? null);
    if (!porDominio && d.confirmadaPorPersona !== true) {
      no("El dominio del mail no coincide con el de la marca. Si sabés quién es, confirmalo vos.", o.id);
    }
    await escribirOp(tx, ctx, o, { identidadComprobada: true });
    await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "IDENTIDAD", texto: porDominio ? "Identidad comprobada: el dominio del mail coincide con la marca." : "Identidad confirmada por una persona." });
    return { ok: true };
  });
}

// ── Contactos y supresión (E8, E16) ─────────────────────────────────────────

export interface NuevoContacto {
  oportunidadId?: string | null;
  marcaId?: string | null;
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  cargo?: string | null;
  deConsultaEntrante?: boolean;
}

/** Sólo una persona carga contactos (E16). Si la persona ya había pedido la baja, se avisa: nunca se le escribe (E8). */
export async function crearContacto(ctx: Ctx, c: NuevoContacto, ahora = new Date()): Promise<Res<{ id: string; suprimido: boolean }>> {
  return correr(ctx, async (tx) => {
    const o = c.oportunidadId ? await cargarOportunidad(tx, ctx, c.oportunidadId) : null;
    const miembro = await guardia(tx, ctx, "crear_contacto", o ? { oportunidad: await contextoDe(tx, ctx, o) } : {}, ahora, 0, o?.id ?? null);
    const nombre = txt(c.nombre, 200);
    if (!nombre) no("Falta el nombre del contacto.");
    const email = c.email?.trim() ? normalizarEmail(c.email) : null;
    if (c.email?.trim() && !email) no("El mail no es válido.");
    const tel = c.telefono?.trim() ? c.telefono.trim().slice(0, 40) : null;
    if (tel && !normalizarTelefono(tel)) no("El teléfono no es válido.");
    if (!email && !tel) no("Cargá al menos un mail o un teléfono.");
    if (o && c.marcaId && c.marcaId !== o.marcaId) no("El contacto es de otra marca que la de la oportunidad.", o.id);
    const marcaId = c.marcaId ?? o?.marcaId ?? null;
    if (marcaId) {
      const m = await tx.marcaRelevada.findFirst({ where: { id: marcaId, tenantId: ctx.tenantId }, select: { id: true } });
      if (!m) no("Esa marca no existe.");
    }
    const huellas = huellasDeContacto({ email, telefono: tel });
    const suprimidas = await tx.supresionComercial.findMany({ where: { tenantId: ctx.tenantId, huella: { in: huellas } }, select: { huella: true } });
    const contacto = await tx.contactoComercial.create({
      data: {
        tenantId: ctx.tenantId,
        marcaId,
        nombre: nombre as string,
        email,
        telefono: tel,
        cargo: txt(c.cargo, 200),
        origen: c.deConsultaEntrante ? "CONSULTA_ENTRANTE" : miembro.rol,
        cargadoPor: ctx.userId,
      },
      select: { id: true },
    });
    if (o) await escribirOp(tx, ctx, o, { contactoId: contacto.id });
    const suprimido = suprimidas.length > 0;
    await registrar(tx, ctx, miembro, {
      oportunidadId: o?.id ?? null,
      tipo: "CONTACTO",
      texto: suprimido ? "Se cargó un contacto que había pedido la baja: no se le prepara ningún mensaje, nunca." : "Se cargó un contacto.",
    });
    return { ok: true, id: contacto.id, suprimido };
  });
}

/**
 * E8: «no me escriban más». Queda la huella (sha256 del mail y del teléfono, nunca se borra), el contacto se
 * anonimiza y sus borradores pendientes se rechazan. Ningún borrador nuevo para esa persona, aunque la recarguen.
 */
export async function suprimirContacto(ctx: Ctx, contactoId: string, ahora = new Date()): Promise<Res<{ huellas: number }>> {
  return correr(ctx, async (tx) => {
    const c = await tx.contactoComercial.findFirst({ where: { id: contactoId, tenantId: ctx.tenantId }, select: { id: true, email: true, telefono: true, suprimidoEl: true, cargadoPor: true } });
    const miembro = await guardia(tx, ctx, "suprimir_contacto", {}, ahora);
    if (!c) no("Ese contacto no existe.");
    const fila = c as NonNullable<typeof c>;
    // Menor privilegio: fuera de Dirección, sólo se da de baja el contacto de una ficha que te toca (o uno suelto
    // que cargaste vos). La baja queda registrada con su oportunidad.
    const fichas = await tx.oportunidad.findMany({ where: { tenantId: ctx.tenantId, contactoId: fila.id }, orderBy: { createdAt: "asc" }, select: { id: true, duenoUserId: true, creadaPor: true } });
    let oportunidadId: string | null = fichas[0]?.id ?? null;
    if (miembro.rol !== "DIRECCION") {
      let propia: string | null = null;
      for (const f of fichas) {
        if (puede(miembro, "ver_oportunidad", { oportunidad: await contextoDe(tx, ctx, f) }).ok) {
          propia = f.id;
          break;
        }
      }
      if (fichas.length ? !propia : fila.cargadoPor !== ctx.userId) {
        no("Ese contacto es de una oportunidad que no te toca: la baja la registra su comercial o Dirección.", oportunidadId);
      }
      oportunidadId = propia;
    }
    const huellas = huellasDeContacto(fila);
    const tipos = [...(fila.email && normalizarEmail(fila.email) ? ["EMAIL"] : []), ...(fila.telefono && normalizarTelefono(fila.telefono) ? ["TELEFONO"] : [])];
    if (huellas.length) {
      await tx.supresionComercial.createMany({
        data: huellas.map((huella, i) => ({ tenantId: ctx.tenantId, huella, tipo: tipos[i] ?? "EMAIL", registradaPor: ctx.userId })),
        skipDuplicates: true,
      });
    }
    await tx.contactoComercial.updateMany({ where: { id: fila.id, tenantId: ctx.tenantId }, data: { ...CONTACTO_ANONIMO, suprimidoEl: fila.suprimidoEl ?? ahora } });
    await tx.borradorMensaje.updateMany({
      where: { tenantId: ctx.tenantId, contactoId: fila.id, estado: { in: ["BORRADOR", "APROBADO"] } },
      data: { estado: "RECHAZADO", motivoRechazo: "La persona pidió que no le escriban más.", version: { increment: 1 } },
    });
    await registrar(tx, ctx, miembro, { oportunidadId, tipo: "BAJA", texto: "Un contacto pidió que no le escriban más: se anonimizó y quedó su huella." });
    return { ok: true, huellas: huellas.length };
  });
}

async function huellaSuprimida(tx: Tx, ctx: Ctx, c: { email: string | null; telefono: string | null }): Promise<boolean> {
  const huellas = huellasDeContacto(c);
  if (!huellas.length) return false;
  const sup = await tx.supresionComercial.findMany({ where: { tenantId: ctx.tenantId, huella: { in: huellas } }, select: { huella: true } });
  return !puedeEscribirle(huellas, new Set(sup.map((s) => s.huella))).ok;
}

async function chequearSupresion(tx: Tx, ctx: Ctx, contactoId: string | null, oportunidadId: string): Promise<void> {
  if (!contactoId) return;
  const c = await tx.contactoComercial.findFirst({ where: { id: contactoId, tenantId: ctx.tenantId }, select: { email: true, telefono: true, suprimidoEl: true } });
  if (!c) no("Ese contacto no existe.", oportunidadId);
  if (c?.suprimidoEl) no("Esa persona pidió que no le escriban más. No se le prepara ningún mensaje, nunca.", oportunidadId);
  const huellas = huellasDeContacto(c as { email: string | null; telefono: string | null });
  const sup = await tx.supresionComercial.findMany({ where: { tenantId: ctx.tenantId, huella: { in: huellas } }, select: { huella: true } });
  const r = puedeEscribirle(huellas, new Set(sup.map((s) => s.huella)));
  if (!r.ok) no(r.motivo, oportunidadId);
}

// ── Borradores (E2, E16) ────────────────────────────────────────────────────

export interface NuevoBorrador {
  oportunidadId: string;
  contactoId?: string | null;
  canal: string;
  asunto?: string | null;
  cuerpo: string;
  idempotencia?: string | null;
  costoUsd?: number | null;
}

export async function escribirBorrador(ctx: Ctx, b: NuevoBorrador, ahora = new Date()): Promise<Res<{ id: string; repetido?: true }>> {
  const intento = () =>
    correr<{ id: string; repetido?: true }>(ctx, async (tx) => {
      const { o, miembro } = await sobre(tx, ctx, b.oportunidadId, "escribir_borrador", ahora, {}, b.costoUsd ?? 0);
      if (b.idempotencia) {
        const ya = await tx.borradorMensaje.findFirst({ where: { tenantId: ctx.tenantId, idempotencia: b.idempotencia }, select: { id: true } });
        if (ya) return { ok: true, id: ya.id, repetido: true };
      }
      if (!(CANALES as readonly string[]).includes(b.canal)) no("El canal tiene que ser MAIL o WHATSAPP.", o.id);
      if (esTerminal(o.etapa as Etapa)) no("La oportunidad está cerrada.", o.id);
      const cuerpo = txt(b.cuerpo, 10_000);
      if (!cuerpo) no("El borrador está vacío.", o.id);
      const contactoId = b.contactoId ?? o.contactoId;
      if (b.contactoId && b.contactoId !== o.contactoId) {
        // Pericia punto 4: cada id que llega se comprueba contra la ficha, no sólo contra el negocio.
        const c = await tx.contactoComercial.findFirst({ where: { id: b.contactoId, tenantId: ctx.tenantId }, select: { marcaId: true } });
        if (!c || c.marcaId !== o.marcaId) no("Ese contacto no es de la marca de esta oportunidad.", o.id);
      }
      await chequearSupresion(tx, ctx, contactoId, o.id);
      const fila = await tx.borradorMensaje.create({
        data: { tenantId: ctx.tenantId, oportunidadId: o.id, contactoId, canal: b.canal as Canal, asunto: txt(b.asunto, 300), cuerpo: cuerpo as string, redactadoPor: ctx.userId, idempotencia: b.idempotencia ?? null },
        select: { id: true },
      });
      await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "BORRADOR", texto: `Borrador de ${b.canal === "MAIL" ? "mail" : "WhatsApp"} listo para revisar.`, costoUsd: b.costoUsd });
      return { ok: true, id: fila.id };
    });
  try {
    return await intento();
  } catch (e) {
    if (isPrismaError(e, "P2002")) return intento();
    throw e;
  }
}

async function cambiarBorrador(
  ctx: Ctx,
  id: string,
  hacia: EstadoBorrador,
  op: Operacion,
  extra: { version?: number; motivo?: string | null },
  ahora: Date,
): Promise<Res<{ link?: string | null }>> {
  return correr<{ link?: string | null }>(ctx, async (tx) => {
    const b = await tx.borradorMensaje.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, oportunidadId: true, contactoId: true, estado: true, version: true, canal: true, cuerpo: true } });
    if (!b) no("Ese borrador no existe.");
    const fila = b as NonNullable<typeof b>;
    const { o, miembro } = await sobre(tx, ctx, fila.oportunidadId, op, ahora);
    if (extra.version !== undefined && extra.version !== fila.version) no("Otra persona cambió ese borrador recién. Recargá y miralo de nuevo.", o.id);
    const v = validarPaseBorrador(fila.estado as EstadoBorrador, hacia, extra.motivo);
    if (!v.ok) no(v.motivo, o.id);
    if (hacia !== "RECHAZADO") {
      // A8: el mensaje le llega a quien hoy es el contacto de la ficha, aunque el borrador se haya escrito antes
      // (sin contacto o con otro). Se miran los dos: el del borrador y el actual de la oportunidad.
      await chequearSupresion(tx, ctx, fila.contactoId, o.id);
      if (o.contactoId && o.contactoId !== fila.contactoId) await chequearSupresion(tx, ctx, o.contactoId, o.id);
    }
    const data: Prisma.BorradorMensajeUpdateManyMutationInput = { estado: hacia, version: { increment: 1 } };
    if (hacia === "APROBADO") Object.assign(data, { aprobadoPor: ctx.userId, aprobadoEl: ahora });
    if (hacia === "RECHAZADO") data.motivoRechazo = (extra.motivo ?? "").trim().slice(0, 1000);
    if (hacia === "ENVIADO_POR_PERSONA") Object.assign(data, { enviadoPor: ctx.userId, enviadoEl: ahora });
    // Atómico: sólo si sigue en el estado (y la versión) que se leyó. Dos aprobaciones a la vez → una entra (E2/A6).
    const r = await tx.borradorMensaje.updateMany({ where: { id: fila.id, tenantId: ctx.tenantId, estado: fila.estado, version: fila.version }, data });
    if (r.count !== 1) no("Otra persona cambió ese borrador recién. Recargá y miralo de nuevo.", o.id);
    const texto = { APROBADO: "Borrador aprobado.", RECHAZADO: `Borrador rechazado: ${(extra.motivo ?? "").trim()}`, ENVIADO_POR_PERSONA: "La persona mandó el mensaje y lo marcó como enviado.", BORRADOR: "" }[hacia];
    await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: `BORRADOR_${hacia}`.slice(0, 40), texto });

    if (hacia === "ENVIADO_POR_PERSONA") {
      // E23: cuenta un seguimiento sin respuesta (se pone en 0 al registrar la respuesta).
      const yaContactada = ["CONTACTADA", "EN_CONVERSACION", "FALTAN_DATOS", "CALIFICADA", "RECIBIDA"].includes(o.etapa);
      if (yaContactada) {
        const seguimientos = o.seguimientosSinRespuesta + 1;
        const prop = propuestaPorSilencio({ etapa: o.etapa as Etapa, seguimientosSinRespuesta: seguimientos }, VARA);
        await escribirOp(tx, ctx, o, {
          seguimientosSinRespuesta: seguimientos,
          ...(prop && !o.pasePropuesto ? { pasePropuesto: prop.destino, pasePropuestoPor: ctx.userId, pasePropuestoEl: ahora, pasePropuestoDatos: { motivo: prop.motivo, nota: prop.explicacion } } : {}),
        });
        if (prop) await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "PASE_PROPUESTO", texto: `${prop.explicacion} Se propone «${ETIQUETA_ETAPA[prop.destino]}» (${prop.motivo}); decide una persona.` });
      }
      return { ok: true, link: fila.canal === "WHATSAPP" ? linkWhatsappSinNumero(fila.cuerpo) : null };
    }
    return { ok: true };
  });
}

export const aprobarBorrador = (ctx: Ctx, id: string, version?: number, ahora = new Date()) => cambiarBorrador(ctx, id, "APROBADO", "aprobar_borrador", { version }, ahora);
export const rechazarBorrador = (ctx: Ctx, id: string, motivo: string, version?: number, ahora = new Date()) => cambiarBorrador(ctx, id, "RECHAZADO", "rechazar_borrador", { version, motivo }, ahora);
/** Lo marca la persona que mandó el mensaje, fuera del sistema. El sistema no manda nada (para WhatsApp da un link sin número). */
export const marcarEnviado = (ctx: Ctx, id: string, ahora = new Date()) => cambiarBorrador(ctx, id, "ENVIADO_POR_PERSONA", "marcar_enviado", {}, ahora);

// ── Cola de tareas del CRM (E5, E22) ────────────────────────────────────────

const PARAS = [...PUESTOS, "PERSONA", "DIRECCION"] as const;

export async function crearTarea(ctx: Ctx, t: { oportunidadId: string; para: string; tipo: string; venceEl?: Date | null; idempotencia?: string | null }, ahora = new Date()): Promise<Res<{ id: string; repetida?: true }>> {
  return correr<{ id: string; repetida?: true }>(ctx, async (tx) => {
    const { o, miembro } = await sobre(tx, ctx, t.oportunidadId, "crear_tarea_seguimiento", ahora);
    if (!(PARAS as readonly string[]).includes(t.para)) no("Esa cola no existe.", o.id);
    if (!/^[A-Z][A-Z_]{1,39}$/.test(t.tipo)) no("El tipo de tarea no es válido.", o.id);
    if (t.idempotencia) {
      const ya = await tx.tareaComercial.findFirst({ where: { tenantId: ctx.tenantId, idempotencia: t.idempotencia }, select: { id: true } });
      if (ya) return { ok: true, id: ya.id, repetida: true };
    }
    const fila = await tx.tareaComercial.create({
      data: { tenantId: ctx.tenantId, oportunidadId: o.id, para: t.para, tipo: t.tipo, venceEl: t.venceEl ?? null, creadaPor: ctx.userId, idempotencia: t.idempotencia ?? null },
      select: { id: true },
    });
    await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "TAREA", texto: `Nueva tarea ${t.tipo} para ${t.para}.` });
    return { ok: true, id: fila.id };
  });
}

export interface TareaTomada {
  id: string;
  oportunidadId: string;
  tipo: string;
  para: string;
}

/**
 * Tomar una tarea. Con `tareaId`: esa, si sigue en cola. Sin `tareaId`: la siguiente de MI cola (un puesto,
 * la suya; Dirección, la de Dirección y la de personas; un comercial, la de personas de sus oportunidades),
 * con `FOR UPDATE SKIP LOCKED`: dos sesiones a la vez no toman la misma (E22).
 */
export async function tomarTarea(ctx: Ctx, d: { tareaId?: string | null } = {}, ahora = new Date()): Promise<Res<{ tarea: TareaTomada | null }>> {
  return correr<{ tarea: TareaTomada | null }>(ctx, async (tx) => {
    const m = await miembroDe(tx, ctx);
    if (!m || !m.activo) no("No estás dado de alta en el CRM comercial. Pedíselo a Dirección.");
    const yo = m as Miembro;
    let tomada: TareaTomada | null = null;
    if (d.tareaId) {
      const t = await tx.tareaComercial.findFirst({ where: { id: d.tareaId, tenantId: ctx.tenantId }, select: { id: true, oportunidadId: true, tipo: true, para: true, estado: true } });
      if (!t) no("Esa tarea no existe.");
      const fila = t as NonNullable<typeof t>;
      const o = await cargarOportunidad(tx, ctx, fila.oportunidadId);
      await guardia(tx, ctx, "tomar_tarea", { oportunidad: await contextoDe(tx, ctx, o), tareaPara: fila.para }, ahora, 0, o.id);
      const r = await tx.tareaComercial.updateMany({ where: { id: fila.id, tenantId: ctx.tenantId, estado: "EN_COLA" }, data: { estado: "EN_CURSO", tomadaPor: ctx.userId, tomadaEl: ahora } });
      if (r.count !== 1) no("Esa tarea ya la tomó otro. Seguí con la siguiente.", o.id);
      tomada = { id: fila.id, oportunidadId: fila.oportunidadId, tipo: fila.tipo, para: fila.para };
    } else {
      const paras = yo.rol === "PUESTO" ? [yo.puesto as string] : yo.rol === "DIRECCION" ? ["DIRECCION", "PERSONA"] : ["PERSONA"];
      const soloMias = yo.rol === "COMERCIAL" ? Prisma.sql`AND o."duenoUserId" = ${ctx.userId}` : Prisma.empty;
      const filas = await tx.$queryRaw<TareaTomada[]>`
        UPDATE "TareaComercial" SET estado = 'EN_CURSO', "tomadaPor" = ${ctx.userId}, "tomadaEl" = ${ahora}, "updatedAt" = ${ahora}
        WHERE "tenantId" = ${ctx.tenantId} AND id = (
          SELECT t.id FROM "TareaComercial" t
          JOIN "Oportunidad" o ON o.id = t."oportunidadId" AND o."tenantId" = t."tenantId"
          WHERE t."tenantId" = ${ctx.tenantId} AND t.estado = 'EN_COLA' AND t.para IN (${Prisma.join(paras)}) ${soloMias}
          ORDER BY t."createdAt", t.id
          LIMIT 1
          FOR UPDATE OF t SKIP LOCKED
        )
        RETURNING id, "oportunidadId", tipo, para`;
      if (!filas.length) return { ok: true, tarea: null };
      tomada = filas[0];
      const o = await cargarOportunidad(tx, ctx, tomada.oportunidadId);
      await guardia(tx, ctx, "tomar_tarea", { oportunidad: await contextoDe(tx, ctx, o), tareaPara: tomada.para }, ahora, 0, o.id);
    }
    await registrar(tx, ctx, yo, { oportunidadId: tomada.oportunidadId, tipo: "TAREA_TOMADA", texto: `Tomó la tarea ${tomada.tipo}.` });
    return { ok: true, tarea: tomada };
  });
}

/** Cerrar una tarea propia en curso (HECHA o DESCARTADA, con nota). */
export async function cerrarTarea(ctx: Ctx, tareaId: string, d: { estado: string; nota?: string | null }, ahora = new Date()): Promise<Res> {
  return correr(ctx, async (tx) => {
    const m = await miembroDe(tx, ctx);
    if (!m || !m.activo) no("No estás dado de alta en el CRM comercial. Pedíselo a Dirección.");
    if (d.estado !== "HECHA" && d.estado !== "DESCARTADA") no("La tarea se cierra como HECHA o DESCARTADA.");
    const t = await tx.tareaComercial.findFirst({ where: { id: tareaId, tenantId: ctx.tenantId }, select: { id: true, oportunidadId: true, tipo: true } });
    if (!t) no("Esa tarea no existe.");
    const fila = t as NonNullable<typeof t>;
    const r = await tx.tareaComercial.updateMany({
      where: { id: fila.id, tenantId: ctx.tenantId, estado: "EN_CURSO", tomadaPor: ctx.userId },
      data: { estado: d.estado, cerradaEl: ahora, notaCierre: txt(d.nota, 1000) },
    });
    if (r.count !== 1) no("Esa tarea no está en curso a tu nombre.", fila.oportunidadId);
    await registrar(tx, ctx, m, { oportunidadId: fila.oportunidadId, tipo: "TAREA_CERRADA", texto: `Cerró la tarea ${fila.tipo} como ${d.estado}.${d.nota ? ` ${txt(d.nota, 500)}` : ""}` });
    return { ok: true };
  });
}

// ── Pedidos al equipo (cola de Eventos y sponsors): tomar y cerrar (E22) ────

export interface PedidoTomado {
  id: string;
  puesto: string;
  pedido: string;
  region: string | null;
}

/**
 * Un puesto toma el siguiente pedido de SU cola (o uno por id). Atómico: dos sesiones no toman el mismo (E22).
 * Las columnas de toma son aditivas (20261116150000): sin la migración vuelve `faltaMigracion`.
 */
export async function tomarPedido(ctx: Ctx, d: { pedidoId?: string | null } = {}, ahora = new Date()): Promise<Res<{ pedido: PedidoTomado | null }>> {
  return correr<{ pedido: PedidoTomado | null }>(ctx, async (tx) => {
    const m = await miembroDe(tx, ctx);
    if (!m || !m.activo) no("No estás dado de alta en el CRM comercial. Pedíselo a Dirección.");
    const yo = m as Miembro;
    if (yo.rol !== "PUESTO") no("Los pedidos al equipo los toma un puesto del equipo, no una persona.");
    await guardia(tx, ctx, "tomar_tarea", { oportunidad: { duenoUserId: null, creadaPor: "", tomadoresEnCurso: [] }, tareaPara: yo.puesto as string }, ahora);
    const porId = d.pedidoId ? Prisma.sql`AND id = ${d.pedidoId}` : Prisma.empty;
    const filas = await tx.$queryRaw<PedidoTomado[]>`
      UPDATE "PedidoAlEquipo" SET estado = 'EN_CURSO', "tomadoPor" = ${ctx.userId}, "tomadoEl" = ${ahora}, "updatedAt" = ${ahora}
      WHERE "tenantId" = ${ctx.tenantId} AND id = (
        SELECT id FROM "PedidoAlEquipo"
        WHERE "tenantId" = ${ctx.tenantId} AND estado = 'EN_COLA' AND puesto = ${yo.puesto} ${porId}
        ORDER BY "createdAt", id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, puesto, pedido, region`;
    if (!filas.length) {
      if (d.pedidoId) no("Ese pedido ya lo tomó otro (o no es de tu puesto). Seguí con el siguiente.");
      return { ok: true, pedido: null };
    }
    await registrar(tx, ctx, yo, { tipo: "PEDIDO_TOMADO", texto: `Tomó el pedido al equipo: ${filas[0].pedido.slice(0, 300)}` });
    return { ok: true, pedido: filas[0] };
  });
}

export async function cerrarPedido(ctx: Ctx, pedidoId: string, d: { estado: string; nota?: string | null }, ahora = new Date()): Promise<Res> {
  return correr(ctx, async (tx) => {
    const m = await miembroDe(tx, ctx);
    if (!m || !m.activo) no("No estás dado de alta en el CRM comercial. Pedíselo a Dirección.");
    if (d.estado !== "HECHO" && d.estado !== "DESCARTADO") no("El pedido se cierra como HECHO o DESCARTADO.");
    const r = await tx.pedidoAlEquipo.updateMany({
      where: { id: pedidoId, tenantId: ctx.tenantId, estado: "EN_CURSO", tomadoPor: ctx.userId },
      data: { estado: d.estado, cerradoEl: ahora, notaCierre: txt(d.nota, 1000) },
    });
    if (r.count !== 1) no("Ese pedido no está en curso a tu nombre.");
    await registrar(tx, ctx, m, { tipo: "PEDIDO_CERRADO", texto: `Cerró un pedido al equipo como ${d.estado}.` });
    return { ok: true };
  });
}

// ── Poner al día: vencidas (E5), dormidas que despiertan (E19), cierre del proyecto (A3) ──

/**
 * Lo corre Dirección (o un proceso con su usuario). (1) Paso vencido → tarea SEGUIMIENTO al Seguidor, sin
 * duplicar la misma vencida. (2) DORMIDA con fecha cumplida → vuelve a su etapa y a «Hoy». (3) ASIGNADA cuyo
 * proyecto llegó a «Confirmado» → GANADA; perdida en el proyecto → PERDIDA. Proyectos no se toca: se lee.
 */
export async function ponerAlDia(ctx: Ctx, ahora = new Date()): Promise<Res<{ tareas: number; despertadas: number; cerradas: number }>> {
  return correr(ctx, async (tx) => {
    const m = await guardia(tx, ctx, "configurar", {}, ahora);
    const vencidas = await tx.oportunidad.findMany({
      where: { tenantId: ctx.tenantId, etapa: { notIn: [...TERMINALES, "DORMIDA"] }, proximoPasoEl: { lt: ahora } },
      select: { id: true, proximoPasoEl: true },
    });
    const conClave = vencidas.map((o) => ({ ...o, clave: claveTareaVencida(o.id, o.proximoPasoEl as Date) }));
    const yaEstan = conClave.length
      ? new Set((await tx.tareaComercial.findMany({ where: { tenantId: ctx.tenantId, idempotencia: { in: conClave.map((o) => o.clave) } }, select: { idempotencia: true } })).map((t) => t.idempotencia))
      : new Set<string | null>();
    const nuevas = conClave.filter((o) => !yaEstan.has(o.clave));
    const tareas = nuevas.length
      ? (
          await tx.tareaComercial.createMany({
            data: nuevas.map((o) => ({ tenantId: ctx.tenantId, oportunidadId: o.id, para: "seguidor", tipo: "SEGUIMIENTO", venceEl: o.proximoPasoEl, creadaPor: ctx.userId, idempotencia: o.clave })),
            skipDuplicates: true,
          })
        ).count
      : 0;
    for (const o of nuevas) await registrar(tx, ctx, m, { oportunidadId: o.id, tipo: "TAREA", texto: "El próximo paso venció: nueva tarea SEGUIMIENTO para seguidor." });

    let despertadas = 0;
    const dormidas = await tx.oportunidad.findMany({ where: { tenantId: ctx.tenantId, etapa: "DORMIDA", despertarEl: { lte: ahora } }, select: SEL_OP });
    for (const o of dormidas) {
      const r = despertar({ etapa: "DORMIDA", etapaPrevia: (o.etapaPrevia ?? null) as Etapa | null, despertarEl: o.despertarEl }, ahora);
      if (!r.ok) continue;
      await escribirOp(tx, ctx, o, { etapa: r.etapa, etapaPrevia: null, despertarEl: null, proximoPaso: "Retomar: le tocó despertar", proximoPasoEl: ahora });
      await registrar(tx, ctx, m, { oportunidadId: o.id, tipo: "DESPERTO", texto: `Le tocó despertar: vuelve a «${ETIQUETA_ETAPA[r.etapa]}».` });
      despertadas++;
    }

    let cerradas = 0;
    const asignadas = await tx.oportunidad.findMany({ where: { tenantId: ctx.tenantId, etapa: "ASIGNADA", proyectoId: { not: null } }, select: SEL_OP });
    for (const o of asignadas) {
      const p = await tx.proyecto.findFirst({ where: { id: o.proyectoId as string, tenantId: ctx.tenantId }, select: { etapa: true, perdidoEl: true, motivoPerdida: true } });
      const cierre = p ? cierreDesdeProyecto(p) : null;
      if (!cierre) continue;
      await aplicar(tx, ctx, m, o, cierre.destino, { motivo: cierre.motivo, nota: cierre.nota, desdeProyecto: true }, ahora);
      cerradas++;
    }
    return { ok: true, tareas, despertadas, cerradas };
  });
}

// ── Lecturas ────────────────────────────────────────────────────────────────

/** Lo que cada uno ve (E12): Dirección todo; el comercial, las suyas; el puesto, las que creó o tiene en curso. */
function filtroVisible(ctx: Ctx, m: Miembro): Prisma.OportunidadWhereInput {
  if (m.rol === "DIRECCION") return { tenantId: ctx.tenantId };
  if (m.rol === "COMERCIAL") return { tenantId: ctx.tenantId, duenoUserId: ctx.userId };
  return { tenantId: ctx.tenantId, OR: [{ creadaPor: ctx.userId }, { tareas: { some: { tenantId: ctx.tenantId, estado: "EN_CURSO", tomadaPor: ctx.userId } } }] };
}

export interface FilaOportunidad {
  id: string;
  tipo: string;
  etapa: string;
  marca: string | null;
  evento: string | null;
  puntaje: number | null;
  destino: string | null;
  proximoPaso: string | null;
  proximoPasoEl: Date | null;
  pasePropuesto: string | null;
  duenoUserId: string | null;
  version: number;
}

export async function listarOportunidades(ctx: Ctx, f: { etapa?: string | null } = {}, ahora = new Date()): Promise<Res<{ filas: FilaOportunidad[] }>> {
  return correr(ctx, async (tx) => {
    // Sólo la membresía: el alcance lo pone `filtroVisible` (el contexto es el del propio usuario).
    const m = await guardia(tx, ctx, "ver_oportunidad", { oportunidad: { duenoUserId: ctx.userId, creadaPor: ctx.userId, tomadoresEnCurso: [] } }, ahora);
    const filas = await tx.oportunidad.findMany({
      where: { ...filtroVisible(ctx, m), ...(f.etapa && esEtapa(f.etapa) ? { etapa: f.etapa } : {}) },
      orderBy: [{ proximoPasoEl: "asc" }, { id: "asc" }],
      take: 500,
      select: { id: true, tipo: true, etapa: true, puntaje: true, destino: true, proximoPaso: true, proximoPasoEl: true, pasePropuesto: true, duenoUserId: true, version: true, marca: { select: { nombre: true } }, evento: { select: { nombre: true } } },
    });
    return { ok: true, filas: filas.map(({ marca, evento, ...r }) => ({ ...r, marca: marca?.nombre ?? null, evento: evento?.nombre ?? null })) };
  });
}

/** «Hoy»: lo que vence o espera, ordenado por urgencia (E7, E19, E20). */
export async function hoy(ctx: Ctx, ahora = new Date()): Promise<Res<{ entradas: EntradaHoy[] }>> {
  return correr(ctx, async (tx) => {
    const m = await guardia(tx, ctx, "ver_oportunidad", { oportunidad: { duenoUserId: ctx.userId, creadaPor: ctx.userId, tomadoresEnCurso: [] } }, ahora);
    const items = await tx.oportunidad.findMany({
      where: { ...filtroVisible(ctx, m), etapa: { notIn: [...TERMINALES] } },
      take: 1000,
      select: { id: true, etapa: true, proximoPasoEl: true, fechaLimite: true, calificadaEl: true, despertarEl: true, pasePropuesto: true },
    });
    return { ok: true, entradas: bandejaHoy(items.map((i) => ({ ...i, etapa: i.etapa as Etapa, pasePropuesto: (i.pasePropuesto ?? null) as Etapa | null })), ahora, VARA) };
  });
}

/** La ficha: la oportunidad, su línea de tiempo, el brief y los borradores. */
export async function ficha(ctx: Ctx, id: string, ahora = new Date()) {
  return correr(ctx, async (tx) => {
    const { o } = await sobre(tx, ctx, id, "ver_oportunidad", ahora);
    const { vista, brief } = await vistaDe(tx, ctx, o);
    const [actividades, borradores] = await Promise.all([
      tx.actividadComercial.findMany({ where: { tenantId: ctx.tenantId, oportunidadId: o.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 500, select: { id: true, usuarioId: true, puesto: true, tipo: true, texto: true, fuenteUrl: true, createdAt: true } }),
      tx.borradorMensaje.findMany({ where: { tenantId: ctx.tenantId, oportunidadId: o.id }, orderBy: { createdAt: "asc" }, select: { id: true, canal: true, asunto: true, cuerpo: true, estado: true, motivoRechazo: true, version: true } }),
    ]);
    const p = puntuar(vista.datos, ahora, VARA);
    return { ok: true as const, oportunidad: { ...o, monto: o.monto == null ? null : Number(o.monto) }, brief, puntaje: p, actividades, borradores };
  });
}

/** Registro por puesto (A10): quién hizo qué y cuánto costó. Sólo Dirección. */
export async function registroPorPuesto(ctx: Ctx, d: { desde?: Date } = {}, ahora = new Date()) {
  return correr(ctx, async (tx) => {
    await guardia(tx, ctx, "ver_registro", {}, ahora);
    const filas = await tx.actividadComercial.groupBy({
      by: ["usuarioId", "puesto"],
      where: { tenantId: ctx.tenantId, createdAt: { gte: d.desde ?? inicioDelDiaAR(ahora) } },
      _count: { _all: true },
      _sum: { costoUsd: true },
    });
    return { ok: true as const, filas: filas.map((f) => ({ usuarioId: f.usuarioId, puesto: f.puesto, acciones: f._count._all, costoUsd: Number(f._sum.costoUsd ?? 0) })) };
  });
}
