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

import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction, trasladoTransaction, type FasesDeTraslado } from "@/lib/rls";
import { isPrismaError } from "@/lib/prisma-errors";
import { claveEvento, claveMarca, esDia, ROLES as ROLES_EN_EVENTO, VERIFICACIONES } from "@/lib/eventos-sponsors/core";
import { VARA } from "./vara";
import { PRONOSTICO } from "./pronostico";
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
  diasEnEtapa,
  esPapel,
  montoPonderado,
  sinSeguimiento,
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
  validarTelefono,
  propuestaPorFaltaDeDatos,
  propuestaPorSilencio,
  proponerDestino,
  prospectarEnFrio,
  puedeEscribirle,
  puntuar,
  claveTareaVencida,
  TERMINALES,
  textoDelBrief,
  diaLegible,
  tipoDeTrabajoLegible,
  TIPOS,
  validarPase,
  validarPaseBorrador,
  validarProximoPaso,
  urlWeb,
  etiquetaTarea,
  ETIQUETA_PARA,
  ETIQUETA_DESTINO,
  ETIQUETA_PUESTO_CRM,
  ETIQUETA_PAPEL,
  MOTIVOS,
  type CamposBrief,
  type Canal,
  type DatosComerciales,
  type Destino,
  type EntradaHoy,
  type Etapa,
  type EvidenciaPase,
  type EstadoBorrador,
  type Papel,
  type TipoOportunidad,
  type VistaPase,
} from "./motor";
import { crearEnDestino, estadosEnDestino, existeClienteEnDestino, nuevoIdDeProyecto, SIN_VINCULO, type DestinoArm, type Huella, type Paquete } from "./vinculo";
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

// GSG-CRM-011 (20261116160000_crm_comercial_pronostico): OportunidadContacto y las tres columnas nuevas de la
// oportunidad. Sin esa migración, el CRM entero contesta «falta un paso» (no un 500), igual que sin la primera.
// GSG-CRM-017 (20261117010000_crm_vinculo_negocios): el vínculo ARM → destino, la asignación recibida y tres columnas.
const TABLAS = "MiembroCrmComercial|ContactoComercial|SupresionComercial|Oportunidad|ActividadComercial|BriefComercial|BorradorMensaje|TareaComercial|OportunidadContacto|VinculoNegocio|AsignacionRecibida";
const COLUMNAS = "tomadoPor|tomadoEl|cerradoEl|notaCierre|dominio|cuit|etapaDesde|ultimaActividadEl|cierreEsperadoEl|destinoTenantId|proyectoDestinoId|consultaId";

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

/** El motivo del catálogo en criollo (el valor interno sólo si no está en el catálogo). */
const etiquetaMotivo = (m: string): string => (MOTIVOS as Record<string, string>)[m] ?? m;

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
  pasePropuestoPor: true,
  pasePropuestoDatos: true,
  pedidosDeDatos: true,
  seguimientosSinRespuesta: true,
  proyectoId: true,
  destinoTenantId: true,
  proyectoDestinoId: true,
  moneda: true,
  monto: true,
  creadaPor: true,
  etapaDesde: true,
  ultimaActividadEl: true,
  cierreEsperadoEl: true,
  version: true,
} as const;
type FilaOp = Prisma.OportunidadGetPayload<{ select: typeof SEL_OP }>;

async function cargarOportunidad(tx: Tx, ctx: Ctx, id: string): Promise<FilaOp> {
  const o = await tx.oportunidad.findFirst({ where: { id, tenantId: ctx.tenantId }, select: SEL_OP });
  if (!o) no("Esa oportunidad no existe.");
  return o as FilaOp;
}

async function contextoDe(tx: Tx, ctx: Ctx, o: { id: string; duenoUserId: string | null; creadaPor: string; tipo: string }): Promise<ContextoOportunidad> {
  const tareas = await tx.tareaComercial.findMany({
    where: { tenantId: ctx.tenantId, oportunidadId: o.id, estado: "EN_CURSO" },
    select: { tomadaPor: true },
  });
  return { duenoUserId: o.duenoUserId, creadaPor: o.creadaPor, tipo: o.tipo, tomadoresEnCurso: tareas.map((t) => t.tomadaPor).filter((x): x is string => !!x) };
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
  const fila = await tx.actividadComercial.create({
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
    select: { id: true, createdAt: true },
  });
  // GSG-CRM-011: «última actividad» = la hora de esta fila, en la misma transacción. No toca la versión (no
  // es un cambio de la oportunidad que pise a otro). Los rechazos van por `registrarRechazo` y no cuentan.
  if (a.oportunidadId) {
    await tx.oportunidad.updateMany({ where: { id: a.oportunidadId, tenantId: ctx.tenantId }, data: { ultimaActividadEl: fila.createdAt } });
  }
}

/** Sube la versión sólo si nadie la cambió desde que se leyó (E2). Todo cambio de etapa fecha `etapaDesde`. */
async function escribirOp(tx: Tx, ctx: Ctx, o: { id: string; version: number }, data: Prisma.OportunidadUncheckedUpdateManyInput): Promise<void> {
  if (data.etapa !== undefined && data.etapaDesde === undefined) data = { ...data, etapaDesde: new Date() };
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
  if (typeof d.teniaPresupuesto === "boolean") out.teniaPresupuesto = d.teniaPresupuesto;
  return out;
}

/**
 * GSG-CRM-018c (V5): lo que queda en el ARM al asignar. El rango ya viajó al proyecto del destino en la misma
 * transacción; acá queda sólo si lo tenía (sí o no). Lo demás de los datos no cambia.
 */
export function datosAlAsignar(x: unknown): DatosComerciales {
  const { presupuestoMin, presupuestoMax, ...resto } = datosLimpios(x);
  const tenia = (presupuestoMin ?? 0) > 0 || (presupuestoMax ?? 0) > 0 || resto.teniaPresupuesto === true;
  return { ...resto, teniaPresupuesto: tenia };
}

/** El brief: lo que ya sabe la oportunidad (marca, evento, datos) + lo que se escribió aparte (objetivo). */
function briefDe(o: { datos: unknown; moneda?: string | null }, marca: string | null, evento: string | null, guardado: unknown): CamposBrief {
  const d = datosLimpios(o.datos);
  const g = (guardado && typeof guardado === "object" ? guardado : {}) as Record<string, unknown>;
  // GSG-CRM-011: en plata, como se lee («$ 3.000.000 a $ 5.000.000»), en la moneda de la oportunidad.
  const plata = new Intl.NumberFormat("es-AR", { style: "currency", currency: o.moneda === "USD" ? "USD" : "ARS", maximumFractionDigits: 0 });
  const presupuesto =
    d.presupuestoMin != null || d.presupuestoMax != null
      ? [d.presupuestoMin, d.presupuestoMax].filter((x): x is number => x != null).map((x) => plata.format(x)).join(" a ")
      : typeof d.teniaPresupuesto === "boolean"
        ? `Tenía presupuesto: ${d.teniaPresupuesto ? "sí" : "no"}`
        : null;
  return {
    marca,
    evento,
    fechaEvento: d.fechaEvento ? diaLegible(d.fechaEvento) : null,
    tipoTrabajo: d.tipoTrabajo ? tipoDeTrabajoLegible(d.tipoTrabajo) : null,
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
    if (d.topeAccionesDia != null && !Number.isInteger(d.topeAccionesDia)) no("El tope de acciones por día va en número entero (o vacío, sin tope).");
    if (d.topeCostoDiaUsd != null && !Number.isFinite(d.topeCostoDiaUsd)) no("El tope de gasto por día va en número (o vacío, sin tope).");
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
    // Nadie se queda afuera: el CRM no queda sin una persona activa en Dirección (sacarse a uno mismo incluido).
    const quedan = await tx.miembroCrmComercial.count({ where: { tenantId: ctx.tenantId, rol: "DIRECCION", activo: true } });
    if (quedan === 0) no("El CRM no puede quedar sin nadie en Dirección: primero sumá a otra persona en Dirección.");
    await registrar(tx, ctx, m, { tipo: "MIEMBRO", texto: `Alta o cambio de miembro: ${d.rol === "DIRECCION" ? "Dirección" : d.rol === "COMERCIAL" ? "Comercial" : "Puesto del equipo"}${puesto ? ` · ${ETIQUETA_PUESTO_CRM[puesto] ?? puesto}` : ""}${datos.activo ? "" : " (dado de baja)"}.` });
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
  // GSG-CRM-011: «bodega.com.ar» se guarda como «https://bodega.com.ar» (el CHECK de la base pide el protocolo);
  // lo que no es una web se rechaza con el motivo, en vez de romper en Postgres.
  const web = p.web?.trim() ? urlWeb(p.web) : null;
  if (p.web?.trim() && !web) no("La web de la marca no es una dirección válida: escribila como marca.com.ar o https://marca.com.ar (o dejala vacía).");
  const dominio = dominioDe(p.dominio ?? web ?? null);
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
        data: { tenantId: ctx.tenantId, clave: claveMarca(nombre as string), nombre: nombre as string, web: web ? web.slice(0, 300) : null, dominio, cuit, rubro: txt(p.rubro, 120) },
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
  const vinc = await enVinculados(ctx, n);
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
          // V7: también es cliente si ya lo es en un negocio vinculado (lectura acotada: sí o no).
          const frio = prospectarEnFrio({ esCliente: previas.some((p) => p.etapa === "GANADA") || vinc.esCliente, proyectoActivo: previas.some((p) => p.etapa === "ASIGNADA") });
          if (!frio.ok) {
            // E17: no se prospecta; el aviso queda en la oportunidad que lo atiende y el rechazo, registrado.
            const quien = previas.find((p) => p.etapa === "ASIGNADA") ?? previas[0];
            if (quien) await registrar(tx, ctx, m, { oportunidadId: quien.id, tipo: "AVISO", texto: `Un puesto la quiso prospectar en frío y se frenó: ${frio.motivo}` });
            await registrar(tx, ctx, m, { oportunidadId: quien?.id ?? null, tipo: "ACCION_RECHAZADA", texto: frio.motivo });
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
          // V7: un competidor que es cliente de un negocio vinculado también cuenta (sólo su nombre, que es del ARM).
          const deVinculados = vinc.competidoresClientes.filter((c) => !clientes.some((x) => x.id === c.id));
          aviso = avisoDeExclusividad({ id: marca.id, rubro: marca.rubro }, [...clientes, ...deVinculados]);
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
          etapaDesde: ahora,
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
      if (tipo === "PROSPECTO" && m.rol !== "PUESTO") {
        // GSG-CRM-011: el prospecto que carga una persona deja su tarea al Verificador (como la carga de prueba):
        // sin ella ningún puesto lo ve y queda trancado en «Detectada». Misma clave que usa la carga de prueba,
        // así el reintento no la duplica. Los puestos que proponen dejan la tarea por su lado (carga, comandos).
        const clave = n.idempotencia ? `${n.idempotencia}-primera` : null;
        await tx.tareaComercial.create({
          data: { tenantId: ctx.tenantId, oportunidadId: op.id, para: "verificador", tipo: "VERIFICAR", venceEl: n.proximoPasoEl, creadaPor: ctx.userId, idempotencia: clave },
          select: { id: true },
        });
        await registrar(tx, ctx, m, { oportunidadId: op.id, tipo: "TAREA", texto: `Nueva tarea «${etiquetaTarea("VERIFICAR")}» para ${ETIQUETA_PARA("verificador")}.` });
      }
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

/**
 * V7: antes de proponer, ¿la marca (o un competidor del mismo rubro que va al mismo evento) ya es cliente en un negocio
 * vinculado? Se arman las huellas con lo del ARM (lectura) y se pregunta a cada destino sólo sí o no.
 */
async function enVinculados(ctx: Ctx, n: NuevaOportunidad): Promise<{ esCliente: boolean; competidoresClientes: { id: string; nombre: string; rubro: string | null }[] }> {
  const nada = { esCliente: false, competidoresClientes: [] };
  if (!n.marca) return nada;
  const pedido = n.marca;
  const leido = await tenantTransaction(
    async (tx) => {
      const hay = await tx.vinculoNegocio.count({ where: { tenantId: ctx.tenantId, activo: true } });
      if (hay === 0) return null;
      const propia = pedido.marcaId ? await tx.marcaRelevada.findFirst({ where: { id: pedido.marcaId, tenantId: ctx.tenantId }, select: { id: true, nombre: true, dominio: true, rubro: true } }) : null;
      const nombre = propia?.nombre ?? txt(pedido.nombre, 200);
      const dominio = propia?.dominio ?? dominioDe(pedido.dominio ?? (pedido.web?.trim() ? urlWeb(pedido.web) : null) ?? null);
      const rubro = (propia?.rubro ?? txt(pedido.rubro, 120))?.trim().toLowerCase() || null;
      const competidores =
        n.eventoId && rubro
          ? (
              await tx.eventoMarca.findMany({
                where: { tenantId: ctx.tenantId, eventoId: n.eventoId, ...(propia ? { marcaId: { not: propia.id } } : {}) },
                select: { marca: { select: { id: true, nombre: true, dominio: true, rubro: true } } },
              })
            )
              .map((r) => r.marca)
              .filter((m) => m.rubro?.trim().toLowerCase() === rubro && (!nombre || claveMarca(m.nombre) !== claveMarca(nombre)))
          : [];
      return { propia: { nombre, dominio, emails: [] } as Huella, competidores };
    },
    { tenantId: ctx.tenantId },
  ).catch((e) => {
    if (esFaltaDeTabla(e)) return null;
    throw e;
  });
  if (!leido) return nada;
  const si = await clienteEnVinculados(ctx, [leido.propia, ...leido.competidores.map((c) => ({ nombre: c.nombre, dominio: c.dominio, emails: [] }))]);
  return { esCliente: si[0], competidoresClientes: leido.competidores.filter((_, i) => si[i + 1]).map(({ id, nombre, rubro }) => ({ id, nombre, rubro })) };
}

/** Quién figura en el registro cuando la oportunidad la abre el formulario público (no hay usuario). */
export const USUARIO_FORMULARIO = "formulario-web";

/**
 * V8 · UNA SOLA PUERTA (GSG-CRM-017). En el ARM, la consulta del formulario web entra como siempre al modelo `Consulta`
 * (`registrarConsulta`, con el clasificador #179) y de ESA consulta nace la oportunidad: no hay un segundo formulario
 * ni un segundo embudo. Lo que el clasificador marca como «no es un cliente» (proveedor, spam) no abre oportunidad:
 * queda en Consultas para descartar. Idempotente: una consulta → una oportunidad (índice único en la base).
 * No hay usuario (la carga el formulario): no pasa por la membresía; la fila de registro dice «formulario-web».
 */
export async function oportunidadDesdeConsulta(tenantId: string, consultaId: string, ahora = new Date()): Promise<Res<{ id: string; repetida?: true }>> {
  const ctx: Ctx = { tenantId, userId: USUARIO_FORMULARIO };
  const intento = () =>
    correr<{ id: string; repetida?: true }>(ctx, async (tx) => {
      const c = await tx.consulta.findFirst({
        where: { id: consultaId, tenantId },
        select: { id: true, nombre: true, email: true, telefono: true, empresa: true, intencion: true, motivos: true, mensajes: { where: { direccion: "ENTRANTE" }, orderBy: { createdAt: "asc" }, take: 1, select: { texto: true } } },
      });
      if (!c) no("Esa consulta no existe.");
      const consulta = c as NonNullable<typeof c>;
      const ya = await tx.oportunidad.findFirst({ where: { tenantId, consultaId }, select: { id: true } });
      if (ya) return { ok: true, id: ya.id, repetida: true };
      if (consulta.intencion === "NO_CLIENTE") no("El clasificador dice que no es un cliente (proveedor o publicidad): queda en Consultas para descartar.");
      const texto = consulta.mensajes[0]?.texto ?? "";
      const op = await tx.oportunidad.create({
        data: {
          tenantId,
          tipo: "CONSULTA",
          etapa: ETAPA_INICIAL.CONSULTA,
          etapaDesde: ahora,
          consultaId,
          consultaTexto: texto.slice(0, 10_000) || null,
          proximoPaso: "Responder la consulta",
          proximoPasoEl: new Date(ahora.getTime() + 4 * 3_600_000),
          creadaPor: USUARIO_FORMULARIO,
        },
        select: { id: true },
      });
      const email = consulta.email ? normalizarEmail(consulta.email) : null;
      if (email || consulta.telefono) {
        const contacto = await tx.contactoComercial.create({
          data: { tenantId, nombre: (consulta.nombre || consulta.empresa || "Contacto de la consulta").slice(0, 200), email, telefono: consulta.telefono, origen: "CONSULTA_ENTRANTE", cargadoPor: USUARIO_FORMULARIO },
          select: { id: true },
        });
        await tx.oportunidad.updateMany({ where: { id: op.id, tenantId }, data: { contactoId: contacto.id } });
      }
      await registrar(tx, ctx, null, { oportunidadId: op.id, tipo: "CREADA", texto: `Entró una consulta por el formulario${consulta.empresa ? ` (${consulta.empresa.slice(0, 120)})` : ""}.` });
      if (consulta.intencion === "ESCALAR") await registrar(tx, ctx, null, { oportunidadId: op.id, tipo: "AVISO", texto: `Atender ya: ${consulta.motivos.join(", ").slice(0, 500)}.` });
      const ins = detectarInstruccion(texto);
      if (ins.nota) await registrar(tx, ctx, null, { oportunidadId: op.id, tipo: "INSTRUCCION_ANOTADA", texto: ins.nota });
      return { ok: true, id: op.id };
    });
  try {
    return await intento();
  } catch (e) {
    // Dos llamadas a la vez con la misma consulta: la base frena la segunda; se vuelve a leer la que entró.
    if (isPrismaError(e, "P2002")) return intento();
    throw e;
  }
}

/**
 * V7 · «ya es cliente» en los negocios VINCULADOS: por cada vínculo activo, una lectura acotada en el destino que
 * contesta sólo sí o no por cada huella (nunca la fila del cliente ajeno). Sin vínculos, todo «no».
 */
export async function clienteEnVinculados(ctx: Ctx, huellas: readonly Huella[]): Promise<boolean[]> {
  const res = huellas.map(() => false);
  if (huellas.length === 0) return res;
  const destinos = await tenantTransaction((tx) => tx.vinculoNegocio.findMany({ where: { tenantId: ctx.tenantId, activo: true }, select: { destinoTenantId: true } }), { tenantId: ctx.tenantId }).catch((e) => {
    if (esFaltaDeTabla(e)) return [];
    throw e;
  });
  for (const { destinoTenantId } of destinos) {
    const si = await trasladoTransaction({ origen: ctx.tenantId, destino: destinoTenantId }, (fases: FasesDeTraslado) =>
      fases.enDestino(async (tx) => {
        const r: boolean[] = [];
        for (const h of huellas) r.push(await existeClienteEnDestino(tx, destinoTenantId, h));
        return r;
      }),
    );
    si.forEach((v, i) => (res[i] = res[i] || v));
  }
  return res;
}

export interface PedidoDeDatos {
  datos?: unknown;
  objetivo?: string | null;
  proximoPaso?: string | null;
  proximoPasoEl?: Date | null;
  fechaLimite?: Date | null;
  monto?: number | null;
  moneda?: string | null;
  /** GSG-CRM-011: cierre esperado; lo carga una persona (null lo borra). */
  cierreEsperadoEl?: Date | null;
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
    const tocaPasoOPlata = d.proximoPaso !== undefined || d.proximoPasoEl !== undefined || d.fechaLimite !== undefined || d.monto !== undefined || d.moneda !== undefined || d.cierreEsperadoEl !== undefined;
    if (miembro.rol === "PUESTO" && tocaPasoOPlata) no("Un puesto del equipo no cambia el próximo paso, la plata ni el cierre esperado: lo hace una persona.", o.id);
    if (d.version !== undefined && d.version !== o.version) no(CAMBIO_CONCURRENTE, o.id);
    const etapa = o.etapa as Etapa;
    if (esTerminal(etapa)) no(`La oportunidad está cerrada («${ETIQUETA_ETAPA[etapa]}»).`, o.id);
    if (etapa === "ASIGNADA" && o.destinoTenantId) {
      // GSG-CRM-018c (V5): asignada a otro negocio, la plata vive en su proyecto; en el ARM no vuelven a entrar montos.
      const pedidos = d.datos !== undefined ? datosLimpios(d.datos) : {};
      if ((d.monto !== undefined && d.monto !== null) || pedidos.presupuestoMin != null || pedidos.presupuestoMax != null) {
        no("Está asignada: el presupuesto y el monto se cargan en su proyecto, en el negocio destino, no en el CRM.", o.id);
      }
    }

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
          data.etapaDesde = ahora;
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
    if (d.cierreEsperadoEl !== undefined) {
      if (d.cierreEsperadoEl !== null && (!(d.cierreEsperadoEl instanceof Date) || Number.isNaN(d.cierreEsperadoEl.getTime()))) no("La fecha de cierre esperado no es válida.", o.id);
      data.cierreEsperadoEl = d.cierreEsperadoEl;
    }
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
    const brief = briefDe({ datos, moneda: (data.moneda as string | undefined) ?? o.moneda }, marca?.nombre ?? null, evento?.nombre ?? null, guardado);
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
async function aplicar(tx: Tx, ctx: Ctx, m: Miembro | null, o: FilaOp, destino: Etapa, ev: PedidoDePase, ahora: Date, aprobada = false, asignacion: Asignacion | null = null): Promise<Paquete | null> {
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
  const data: Prisma.OportunidadUncheckedUpdateManyInput = { etapa: destino, etapaDesde: ahora, pasePropuesto: null, pasePropuestoPor: null, pasePropuestoEl: null, pasePropuestoDatos: Prisma.DbNull };
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

  let paquete: Paquete | null = null;
  if (destino === "ASIGNADA") {
    // GSG-CRM-017: el proyecto nace en el negocio vinculado, no acá (V1). Sin vínculo no hay asignación (V2). La
    // oportunidad guarda a dónde fue en la MISMA escritura que el cambio de etapa (V3), y el monto viaja al destino:
    // en el ARM no quedan montos (V5).
    if (!asignacion) no(SIN_VINCULO, o.id);
    const a = asignacion as Asignacion;
    data.duenoUserId = ev.comercialUserId;
    data.destinoTenantId = a.destinoTenantId;
    data.proyectoDestinoId = a.proyectoId;
    data.monto = null;
    // GSG-CRM-018c: el rango tampoco queda (viaja en el paquete, que se arma con `o.datos` de antes de vaciarlo).
    data.datos = datosAlAsignar(o.datos) as Prisma.InputJsonValue;
    paquete = await paqueteDe(tx, ctx, o, marcaNombre, brief, a, ahora);
  }
  await escribirOp(tx, ctx, o, data);
  if (o.etapa === "DETECTADA") {
    // GSG-CRM-011: salió de «Detectada» → la verificación que nadie tomó ya no hace falta (no ensucia la cola).
    await tx.tareaComercial.updateMany({
      where: { tenantId: ctx.tenantId, oportunidadId: o.id, tipo: "VERIFICAR", estado: "EN_COLA" },
      data: { estado: "DESCARTADA", cerradaEl: ahora, notaCierre: `Ya no hace falta: pasó a «${ETIQUETA_ETAPA[destino]}».` },
    });
  }
  if (destino === "SIN_CONTACTO") {
    // §2: SIN_CONTACTO deja la tarea «cargar a quién escribirle» en la cola de personas (un puesto no carga
    // contactos). Una por oportunidad y entrada a la etapa: el reintento no la duplica.
    const clave = `CARGAR_CONTACTO:${o.id}:${o.version}`;
    const ya = await tx.tareaComercial.findFirst({ where: { tenantId: ctx.tenantId, idempotencia: clave }, select: { id: true } });
    if (!ya) {
      await tx.tareaComercial.create({ data: { tenantId: ctx.tenantId, oportunidadId: o.id, para: "PERSONA", tipo: "CARGAR_CONTACTO", venceEl: ev.proximoPasoEl ?? o.proximoPasoEl ?? null, creadaPor: ctx.userId, idempotencia: clave }, select: { id: true } });
      await registrar(tx, ctx, m, { oportunidadId: o.id, tipo: "TAREA", texto: "Sin contacto: nueva tarea «Cargar un contacto» para una persona (cargar a quién escribirle)." });
    }
  }
  await registrar(tx, ctx, m, {
    oportunidadId: o.id,
    tipo: "PASE",
    // Quién aprobó el pase y cuándo = esta fila (usuarioId, createdAt); quién lo propuso, la PASE_PROPUESTO anterior.
    texto: `Pasó de «${ETIQUETA_ETAPA[o.etapa as Etapa]}» a «${ETIQUETA_ETAPA[destino]}».${data.motivo ? ` Motivo: ${etiquetaMotivo(String(data.motivo))}.` : ""}${ev.desdeProyecto ? " Lo puso el cierre del proyecto." : ""}${aprobada ? " Pase propuesto, aprobado." : ""}${asignacion ? ` El proyecto nace en ${asignacion.destinoNombre}.` : ""}`,
    fuenteUrl: ev.fuenteUrl,
    costoUsd: ev.costoUsd,
  });
  return paquete;
}

/** A qué negocio va la asignación: lo resuelve el vínculo (V2), nunca un formulario. */
interface Asignacion {
  destinoTenantId: string;
  destinoNombre: string;
  proyectoId: string;
}

/** El vínculo activo del ARM para ese destino (AGENCIA · TALLER), o null. Lectura del ARM: la app no lo escribe. */
async function vinculoActivo(tx: Tx, ctx: Ctx, destino: string | null): Promise<{ destinoTenantId: string; destinoNombre: string } | null> {
  if (destino !== "AGENCIA" && destino !== "TALLER") return null;
  const v = await tx.vinculoNegocio.findFirst({ where: { tenantId: ctx.tenantId, destino, activo: true }, select: { destinoTenantId: true, destinoTenant: { select: { name: true } } } });
  return v ? { destinoTenantId: v.destinoTenantId, destinoNombre: v.destinoTenant.name } : null;
}

/** Fecha y texto cortos para la conversación que viaja (dd/mm/aaaa, hora de Argentina). */
const fechaCorta = (d: Date): string => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10).split("-").reverse().join("/");

/**
 * Lo que viaja al destino (V5): el cliente (marca + contacto principal), el brief y la conversación (la consulta
 * entrante, los mensajes que mandó una persona y lo que respondió el cliente), en orden. Se arma en la fase del ARM.
 */
async function paqueteDe(tx: Tx, ctx: Ctx, o: FilaOp, marcaNombre: string | null, brief: CamposBrief, a: Asignacion, ahora: Date): Promise<Paquete> {
  const [op, contacto, enviados, respuestas, quien] = await Promise.all([
    tx.oportunidad.findFirst({ where: { id: o.id, tenantId: ctx.tenantId }, select: { consultaTexto: true, createdAt: true } }),
    o.contactoId ? tx.contactoComercial.findFirst({ where: { id: o.contactoId, tenantId: ctx.tenantId, suprimidoEl: null }, select: { nombre: true, email: true, telefono: true } }) : null,
    tx.borradorMensaje.findMany({ where: { tenantId: ctx.tenantId, oportunidadId: o.id, estado: "ENVIADO_POR_PERSONA" }, select: { cuerpo: true, canal: true, enviadoEl: true, updatedAt: true }, orderBy: { updatedAt: "asc" }, take: 30 }),
    tx.actividadComercial.findMany({ where: { tenantId: ctx.tenantId, oportunidadId: o.id, tipo: "RESPUESTA_CLIENTE" }, select: { texto: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 30 }),
    tx.user.findFirst({ where: { id: ctx.userId, tenantId: ctx.tenantId }, select: { name: true } }),
  ]);
  const lineas: { el: Date; texto: string }[] = [
    ...(op?.consultaTexto ? [{ el: op.createdAt, texto: `Consulta del cliente: ${op.consultaTexto}` }] : []),
    ...enviados.map((b) => ({ el: b.enviadoEl ?? b.updatedAt, texto: `Le escribimos (${b.canal === "WHATSAPP" ? "WhatsApp" : "mail"}): ${b.cuerpo}` })),
    ...respuestas.map((r) => ({ el: r.createdAt, texto: `Respondió el cliente: ${r.texto}` })),
  ].sort((x, y) => x.el.getTime() - y.el.getTime());
  const datos = datosLimpios(o.datos);
  const nombreCliente = (marcaNombre ?? contacto?.nombre ?? "Cliente de consulta").slice(0, 120);
  const monto = o.monto == null ? null : Number(o.monto);
  return {
    origenTenantId: ctx.tenantId,
    origenOportunidadId: o.id,
    proyectoId: a.proyectoId,
    cliente: { nombre: nombreCliente, email: contacto?.email ?? null, telefono: contacto?.telefono ?? null, contacto: contacto?.nombre ?? null },
    nombreProyecto: `${nombreCliente}${brief.evento ? ` · ${brief.evento}` : ""}`,
    brief: textoDelBrief(brief, puntuar(datos, ahora, VARA)),
    conversacion: lineas.map((l) => `· ${fechaCorta(l.el)} — ${l.texto.slice(0, 1000)}`),
    fechaEvento: datos.fechaEvento ? new Date(`${datos.fechaEvento}T12:00:00Z`) : null,
    moneda: o.moneda,
    presupuestoEstimado: monto ?? datos.presupuestoMax ?? datos.presupuestoMin ?? null,
    asignadoPor: quien?.name ?? "CRM comercial",
  };
}

/** Rechazo o falta de migración de una operación entre negocios: lo mismo que `correr`. */
async function rechazoEntreNegocios<T extends object>(ctx: Ctx, e: unknown): Promise<Res<T>> {
  if (e instanceof RechazoCrm) {
    await registrarRechazo(ctx, e).catch(() => {});
    return { ok: false, motivo: e.motivo };
  }
  if (esFaltaDeTabla(e)) return { ok: false, motivo: MIGRACION_PENDIENTE, faltaMigracion: true };
  throw e;
}

/**
 * ASIGNAR entre negocios (GSG-CRM-017 · V2–V6). Primero se lee, en el ARM, a qué negocio está vinculado el destino
 * de la oportunidad; después, UNA transacción Serializable con dos fases (`trasladoTransaction`, sin saltear RLS):
 *   1. ARM: permiso, motor y cambio de etapa con control de versión (y a qué negocio y proyecto fue), registro;
 *   2. destino: cliente, proyecto, presupuesto v1, `AsignacionRecibida` (única por oportunidad) y registro.
 * Todo o nada: si el destino falla, la etapa no cambia. Doble clic o dos personas a la vez: una entra; la otra
 * choca con la versión (o Postgres la reintenta y ya ve ASIGNADA). El reintento después de asignar se rechaza.
 * `faseArm` hace las guardias y el pase; devuelve el paquete a crear en el destino.
 */
async function asignarEntreNegocios(
  ctx: Ctx,
  id: string,
  faseArm: (tx: Tx, asignacion: Asignacion | null) => Promise<Paquete | null>,
): Promise<Res<{ etapa: Etapa }>> {
  const destino = await correr<{ v: { destinoTenantId: string; destinoNombre: string } | null }>(ctx, async (tx) => {
    const o = await cargarOportunidad(tx, ctx, id);
    return { ok: true, v: await vinculoActivo(tx, ctx, o.destinoConfirmado ? o.destino : null) };
  });
  if (!destino.ok) return destino;
  if (!destino.v) {
    // Sin vínculo: se corre igual la fase del ARM (sin destino) para que el rechazo sea el más preciso (permiso,
    // motor: «falta el destino confirmado») y, si todo eso pasa, «no tiene un negocio vinculado». No escribe nada.
    return correr(ctx, async (tx) => {
      await faseArm(tx, null);
      return no(SIN_VINCULO, id);
    });
  }
  const asignacion: Asignacion = { ...destino.v, proyectoId: nuevoIdDeProyecto() };
  try {
    return await trasladoTransaction({ origen: ctx.tenantId, destino: asignacion.destinoTenantId }, async (fases: FasesDeTraslado) => {
      const paquete = await fases.enOrigen(async (tx) => {
        // El vínculo se vuelve a leer adentro: si GSG lo apagó o lo cambió entre la lectura y acá, no se asigna.
        const o = await cargarOportunidad(tx, ctx, id);
        const v = await vinculoActivo(tx, ctx, o.destinoConfirmado ? o.destino : null);
        if (!v || v.destinoTenantId !== asignacion.destinoTenantId) no(SIN_VINCULO, id);
        return faseArm(tx, asignacion);
      });
      if (!paquete) no("No se pudo armar la asignación.", id);
      await fases.enDestino((tx) => crearEnDestino(tx, asignacion.destinoTenantId, paquete as Paquete));
      return { ok: true as const, etapa: "ASIGNADA" as Etapa };
    });
  } catch (e) {
    return rechazoEntreNegocios(ctx, e);
  }
}

/**
 * Aplicar un pase. Lo valida el motor (grafo + evidencia, E4) y el permiso (lo «con aprobación» lo aplica
 * sólo Dirección; GANADA no la pone nadie a mano). Control de versión: si otro la movió, aviso (E2).
 */
export async function aplicarPase(ctx: Ctx, id: string, destino: string, ev: PedidoDePase = {}, ahora = new Date()): Promise<Res<{ etapa: Etapa }>> {
  if (destino === "ASIGNADA") {
    return asignarEntreNegocios(ctx, id, async (tx, asignacion) => {
      const { o, miembro } = await sobre(tx, ctx, id, "aplicar_pase", ahora, { etapaDestino: "ASIGNADA" }, ev.costoUsd ?? 0);
      return aplicar(tx, ctx, miembro, o, "ASIGNADA", { ...ev, desdeProyecto: false }, ahora, false, asignacion);
    });
  }
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
    await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "PASE_PROPUESTO", texto: `Propone pasar a «${ETIQUETA_ETAPA[destino as Etapa]}»${ev.motivo ? ` (motivo: ${etiquetaMotivo(ev.motivo)})` : ""}. Lo decide Dirección.`, fuenteUrl: ev.fuenteUrl, costoUsd: ev.costoUsd });
    return { ok: true };
  });
}

/** Dirección aprueba (aplica) el pase propuesto, con lo que haga falta completar (el comercial, el próximo paso). */
export async function aprobarPasePropuesto(ctx: Ctx, id: string, extra: PedidoDePase = {}, ahora = new Date()): Promise<Res<{ etapa: Etapa }>> {
  // ASIGNADA propuesta: el proyecto nace en el negocio vinculado (dos fases). Se mira qué se propuso antes de abrir
  // la transacción; adentro se vuelve a exigir que siga siendo ASIGNADA.
  const propuesto = await correr<{ pase: string | null }>(ctx, async (tx) => ({ ok: true, pase: (await cargarOportunidad(tx, ctx, id)).pasePropuesto }));
  if (!propuesto.ok) return propuesto;
  if (propuesto.pase === "ASIGNADA") {
    return asignarEntreNegocios(ctx, id, async (tx, asignacion) => {
      const o = await cargarOportunidad(tx, ctx, id);
      if (o.pasePropuesto !== "ASIGNADA") no(CAMBIO_CONCURRENTE, o.id);
      const miembro = await guardia(tx, ctx, "aplicar_pase", { oportunidad: await contextoDe(tx, ctx, o), etapaDestino: "ASIGNADA" }, ahora, 0, o.id);
      return aplicar(tx, ctx, miembro, o, "ASIGNADA", { ...evDePropuesta(o, extra), desdeProyecto: false }, ahora, true, asignacion);
    });
  }
  return correr(ctx, async (tx) => {
    const o = await cargarOportunidad(tx, ctx, id);
    if (!o.pasePropuesto || !esEtapa(o.pasePropuesto)) no("Esa oportunidad no tiene un pase propuesto.", o.id);
    const destino = o.pasePropuesto as Etapa;
    const miembro = await guardia(tx, ctx, "aplicar_pase", { oportunidad: await contextoDe(tx, ctx, o), etapaDestino: destino }, ahora, 0, o.id);
    await aplicar(tx, ctx, miembro, o, destino, { ...evDePropuesta(o, extra), desdeProyecto: false }, ahora, true);
    return { ok: true, etapa: destino };
  });
}

/** Lo que se propuso, con lo que completa Dirección al aprobar. */
function evDePropuesta(o: FilaOp, extra: PedidoDePase): PedidoDePase {
  const propuesto = (o.pasePropuestoDatos ?? {}) as Record<string, string | null>;
  return {
    motivo: extra.motivo ?? propuesto.motivo,
    nota: extra.nota ?? propuesto.nota,
    despertarEl: extra.despertarEl ?? propuesto.despertarEl,
    comercialUserId: extra.comercialUserId ?? propuesto.comercialUserId,
    proximoPaso: extra.proximoPaso,
    proximoPasoEl: extra.proximoPasoEl,
    version: extra.version,
  };
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
    const corrige = o.destino && o.destino !== destino ? ` (corrige la propuesta: ${ETIQUETA_DESTINO[o.destino] ?? o.destino})` : "";
    await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "DESTINO", texto: `Dirección confirmó el destino ${ETIQUETA_DESTINO[destino] ?? destino}${corrige}.` });
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
    if (prop) await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "PASE_PROPUESTO", texto: `${prop.explicacion} Se propone «${ETIQUETA_ETAPA[prop.destino]}» (${etiquetaMotivo(prop.motivo)}); decide una persona.` });
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

// ── Verificación de la fuente (evidencia del pase a VERIFICADA, diseño §2) ──

export interface PedidoDeVerificacion {
  /** «marca»: la marca EN el evento (EventoMarca). «evento»: el evento relevado. */
  que: string;
  /** «confirmado», «en duda» o «falla». */
  verificacion: string;
  urlFuente: string;
  /** Rol de la marca en el evento (sólo la primera vez que se registra). Sin él: el que ya tenía, o «EXPOSITOR». */
  rol?: string | null;
}

/**
 * GSG-CRM-011: marcar la marca en el evento o el evento como «confirmado» (o «en duda», «falla») con la URL de
 * la fuente. Permiso «verificar» sobre ESA oportunidad (Verificador con la tarea, Dirección, el comercial que la
 * tiene). Los ids de marca y evento salen de la oportunidad, nunca del pedido. La URL es dato: se guarda, no se
 * abre ni se sigue (E10). Va con su fila en la línea de tiempo, en la misma transacción.
 */
export async function verificarFuente(ctx: Ctx, id: string, d: PedidoDeVerificacion, ahora = new Date()): Promise<Res> {
  return correr(ctx, async (tx) => {
    const { o, miembro } = await sobre(tx, ctx, id, "verificar", ahora);
    if (esTerminal(o.etapa as Etapa)) no("La oportunidad está cerrada.", o.id);
    if (d.que !== "marca" && d.que !== "evento") no("Decí si verificás la marca en el evento o el evento.", o.id);
    if (!(VERIFICACIONES as readonly string[]).includes(d.verificacion) || d.verificacion === "sin verificar") {
      no("La verificación tiene que ser «confirmado», «en duda» o «falla».", o.id);
    }
    const url = urlWeb(d.urlFuente);
    if (!url) no("Falta la URL de la fuente (dónde se ve): escribila como evento.com.ar/sponsors o con https://.", o.id);
    if (!o.eventoId) no("Esta oportunidad no tiene evento: la marca se verifica en el evento donde se la vio.", o.id);
    const fuente = (url as string).slice(0, 1000);
    if (d.que === "evento") {
      await tx.eventoRelevado.updateMany({ where: { id: o.eventoId as string, tenantId: ctx.tenantId }, data: { verificacion: d.verificacion, urlFuente: fuente } });
    } else {
      if (!o.marcaId) no("Esta oportunidad no tiene marca para verificar.", o.id);
      if (d.rol != null && !(ROLES_EN_EVENTO as readonly string[]).includes(d.rol)) no("Ese rol de la marca en el evento no existe.", o.id);
      const donde = { tenantId: ctx.tenantId, eventoId: o.eventoId as string, marcaId: o.marcaId as string };
      const ya = await tx.eventoMarca.findMany({ where: donde, orderBy: [{ verificacion: "asc" }, { createdAt: "asc" }], select: { id: true, rol: true } });
      const fila = (d.rol ? ya.find((x) => x.rol === d.rol) : ya[0]) ?? null;
      if (fila) {
        await tx.eventoMarca.updateMany({ where: { id: fila.id, tenantId: ctx.tenantId }, data: { verificacion: d.verificacion, urlFuente: fuente } });
      } else {
        await tx.eventoMarca.create({ data: { ...donde, rol: d.rol ?? "EXPOSITOR", urlFuente: fuente, verificacion: d.verificacion }, select: { id: true } });
      }
    }
    await registrar(tx, ctx, miembro, {
      oportunidadId: o.id,
      tipo: "VERIFICACION",
      texto: `${d.que === "marca" ? "La marca en el evento" : "El evento"} quedó como «${d.verificacion}», con la fuente.`,
      fuenteUrl: fuente,
    });
    return { ok: true };
  });
}

export interface PedidoDeEvento {
  /** Un evento ya relevado de este negocio. Si viene, lo demás no se mira. */
  eventoId?: string | null;
  /** O uno nuevo: nombre, primer día (AAAA-MM-DD), último día opcional, lugar y región. */
  nombre?: string | null;
  fecha?: string | null;
  fechaHasta?: string | null;
  lugar?: string | null;
  region?: string | null;
}

/**
 * GSG-CRM-018 · callejón 1 de T2: un prospecto que llegó sin evento (el evento vino sin día y la carga no lo pudo
 * crear) no se podía verificar y ninguna pantalla dejaba cargárselo. Quien tiene permiso «verificar» sobre ESA
 * oportunidad (el Verificador con la tarea, Dirección, el comercial que la tiene) le pone el evento: uno ya
 * relevado o uno nuevo, que queda «sin verificar» y con origen MANUAL (si ya hay uno con la misma llave, se usa
 * ése: no se duplica). Sólo si todavía no tiene evento: cambiar el de otra no es esta salida. E1: si la misma
 * marca ya tiene otra abierta en ese evento, se rechaza y se dice cuál. Versión y registro en la misma transacción.
 */
export async function cargarEvento(ctx: Ctx, id: string, d: PedidoDeEvento, ahora = new Date()): Promise<Res<{ eventoId: string }>> {
  return correr(ctx, async (tx) => {
    const { o, miembro } = await sobre(tx, ctx, id, "verificar", ahora);
    if (esTerminal(o.etapa as Etapa)) no("La oportunidad está cerrada.", o.id);
    if (o.eventoId) no("Esta oportunidad ya tiene evento.", o.id);
    let evento: { id: string; nombre: string } | null = null;
    let nuevo = false;
    if (d.eventoId) {
      evento = await tx.eventoRelevado.findFirst({ where: { id: d.eventoId, tenantId: ctx.tenantId }, select: { id: true, nombre: true } });
      if (!evento) no("Ese evento no existe.", o.id);
    } else {
      const nombre = txt(d.nombre, 200);
      const lugar = txt(d.lugar, 200);
      const region = txt(d.region, 80);
      if (!nombre) no("Falta el nombre del evento.", o.id);
      if (!esDia(d.fecha)) no("Falta el día del evento (o no es una fecha real).", o.id);
      const hasta = d.fechaHasta?.trim() ? d.fechaHasta.trim() : null;
      if (hasta && (!esDia(hasta) || hasta < (d.fecha as string))) no("El último día tiene que ser una fecha real, igual o posterior al primero.", o.id);
      if (!lugar) no("Falta el lugar del evento.", o.id);
      if (!region) no("Falta la región del evento.", o.id);
      const clave = claveEvento(nombre as string, d.fecha as string, region as string);
      evento = await tx.eventoRelevado.findFirst({ where: { tenantId: ctx.tenantId, clave }, select: { id: true, nombre: true } });
      if (!evento) {
        evento = await tx.eventoRelevado.create({
          data: {
            tenantId: ctx.tenantId,
            clave,
            nombre: nombre as string,
            fecha: new Date(`${d.fecha}T00:00:00Z`),
            fechaHasta: hasta ? new Date(`${hasta}T00:00:00Z`) : null,
            lugar: lugar as string,
            region: region as string,
            origen: "MANUAL",
          },
          select: { id: true, nombre: true },
        });
        nuevo = true;
      }
    }
    const ev = evento as { id: string; nombre: string };
    if (o.marcaId) {
      const otra = await tx.oportunidad.findFirst({
        where: { tenantId: ctx.tenantId, marcaId: o.marcaId, eventoId: ev.id, id: { not: o.id }, etapa: { notIn: [...TERMINALES] } },
        select: { id: true },
      });
      if (otra) no("La misma marca ya tiene otra oportunidad abierta en ese evento: seguí por ésa o descartá ésta como repetida.", o.id);
    }
    await escribirOp(tx, ctx, o, { eventoId: ev.id });
    await registrar(tx, ctx, miembro, {
      oportunidadId: o.id,
      tipo: "EVENTO",
      texto: `Se le puso el evento «${ev.nombre}»${nuevo ? " (anotado a mano, sin verificar)" : ""}. Falta verificarlo con la fuente.`,
    });
    return { ok: true, eventoId: ev.id };
  });
}

/** Los eventos relevados para elegir desde la ficha: pide «verificar» sobre ESA oportunidad (no «proponer»). */
export async function eventosParaLaFicha(ctx: Ctx, id: string, ahora = new Date()): Promise<Res<{ eventos: { id: string; nombre: string; fecha: Date; region: string }[] }>> {
  return correr(ctx, async (tx) => {
    await sobre(tx, ctx, id, "verificar", ahora);
    const eventos = await tx.eventoRelevado.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ fecha: "asc" }, { id: "asc" }], take: 300, select: { id: true, nombre: true, fecha: true, region: true } });
    return { ok: true, eventos };
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
  /** GSG-CRM-011: si viene con oportunidad, queda vinculado con este papel en la misma transacción. */
  papel?: string | null;
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
    const tel = c.telefono?.trim() ? c.telefono.trim() : null;
    if (tel) {
      const v = validarTelefono(tel);
      if (!v.ok) no(v.motivo);
    }
    if (!email && !tel) no("Cargá al menos un mail o un teléfono.");
    if (o && c.marcaId && c.marcaId !== o.marcaId) no("El contacto es de otra marca que la de la oportunidad.", o.id);
    if (c.papel != null && !esPapel(c.papel)) no("El papel tiene que ser DECIDE, PIDE o PAGA.", o?.id ?? null);
    if (c.papel != null && !o) no("Para darle un papel, el contacto se carga desde una oportunidad.");
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
    if (o && c.papel) {
      await tx.oportunidadContacto.create({ data: { tenantId: ctx.tenantId, oportunidadId: o.id, contactoId: contacto.id, papel: c.papel, vinculadoPor: ctx.userId }, select: { id: true } });
    }
    const suprimido = suprimidas.length > 0;
    await registrar(tx, ctx, miembro, {
      oportunidadId: o?.id ?? null,
      tipo: "CONTACTO",
      texto: suprimido ? "Se cargó un contacto que había pedido la baja: no se le prepara ningún mensaje, nunca." : "Se cargó un contacto.",
    });
    return { ok: true, id: contacto.id, suprimido };
  });
}

export interface VinculoContacto {
  oportunidadId: string;
  contactoId: string;
  papel: string;
}

/**
 * GSG-CRM-011: el contacto queda en la oportunidad con su papel (DECIDE · PIDE · PAGA). Varios por oportunidad;
 * una persona puede tener más de un papel. Sólo una persona (E16, misma regla que cargar contactos). Pertenencia
 * contra la ficha (pericia punto 4, E8): el contacto es de la marca de la oportunidad; si la oportunidad no tiene
 * marca, sólo su contacto principal o uno ya vinculado. El reintento no duplica.
 */
export async function vincularContacto(ctx: Ctx, v: VinculoContacto, ahora = new Date()): Promise<Res<{ id: string; repetido?: true }>> {
  const intento = () =>
    correr<{ id: string; repetido?: true }>(ctx, async (tx) => {
      const { o, miembro } = await sobre(tx, ctx, v.oportunidadId, "crear_contacto", ahora);
      if (!esPapel(v.papel)) no("El papel tiene que ser DECIDE, PIDE o PAGA.", o.id);
      if (esTerminal(o.etapa as Etapa)) no("La oportunidad está cerrada.", o.id);
      const c = await tx.contactoComercial.findFirst({ where: { id: v.contactoId, tenantId: ctx.tenantId }, select: { id: true, marcaId: true, suprimidoEl: true } });
      if (!c) no("Ese contacto no existe.", o.id);
      const fila = c as NonNullable<typeof c>;
      if (fila.marcaId !== o.marcaId) no("Ese contacto no es de la marca de esta oportunidad.", o.id);
      if (!o.marcaId && fila.id !== o.contactoId) {
        const ya = await tx.oportunidadContacto.findFirst({ where: { tenantId: ctx.tenantId, oportunidadId: o.id, contactoId: fila.id }, select: { id: true } });
        if (!ya) no("Ese contacto no es de esta oportunidad: cargalo desde la oportunidad.", o.id);
      }
      if (fila.suprimidoEl) no("Esa persona pidió que no le escriban más: no se le da un papel.", o.id);
      const papel = v.papel as Papel;
      const repetido = await tx.oportunidadContacto.findFirst({ where: { tenantId: ctx.tenantId, oportunidadId: o.id, contactoId: fila.id, papel }, select: { id: true } });
      if (repetido) return { ok: true, id: repetido.id, repetido: true };
      const nuevo = await tx.oportunidadContacto.create({ data: { tenantId: ctx.tenantId, oportunidadId: o.id, contactoId: fila.id, papel, vinculadoPor: ctx.userId }, select: { id: true } });
      await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "CONTACTO_PAPEL", texto: `Un contacto quedó con el papel «${ETIQUETA_PAPEL[papel]}».` });
      return { ok: true, id: nuevo.id };
    });
  try {
    return await intento();
  } catch (e) {
    if (isPrismaError(e, "P2002")) return intento();
    throw e;
  }
}

/** GSG-CRM-011: le saca ese papel al contacto en la oportunidad (el contacto sigue existiendo). Sólo una persona. */
export async function desvincularContacto(ctx: Ctx, v: VinculoContacto, ahora = new Date()): Promise<Res<{ quitados: number }>> {
  return correr(ctx, async (tx) => {
    const { o, miembro } = await sobre(tx, ctx, v.oportunidadId, "crear_contacto", ahora);
    if (!esPapel(v.papel)) no("El papel tiene que ser DECIDE, PIDE o PAGA.", o.id);
    const r = await tx.oportunidadContacto.deleteMany({ where: { tenantId: ctx.tenantId, oportunidadId: o.id, contactoId: v.contactoId, papel: v.papel } });
    if (r.count) await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "CONTACTO_PAPEL", texto: `Un contacto dejó el papel «${ETIQUETA_PAPEL[v.papel as Papel] ?? v.papel}».` });
    return { ok: true, quitados: r.count };
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
    const fichas = await tx.oportunidad.findMany({ where: { tenantId: ctx.tenantId, contactoId: fila.id }, orderBy: { createdAt: "asc" }, select: { id: true, duenoUserId: true, creadaPor: true, tipo: true } });
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
        if (prop) await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "PASE_PROPUESTO", texto: `${prop.explicacion} Se propone «${ETIQUETA_ETAPA[prop.destino]}» (${etiquetaMotivo(prop.motivo)}); decide una persona.` });
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
    await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "TAREA", texto: `Nueva tarea «${etiquetaTarea(t.tipo)}» para ${ETIQUETA_PARA(t.para)}.` });
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
    await registrar(tx, ctx, yo, { oportunidadId: tomada.oportunidadId, tipo: "TAREA_TOMADA", texto: `Tomó la tarea «${etiquetaTarea(tomada.tipo)}».` });
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
    await registrar(tx, ctx, m, { oportunidadId: fila.oportunidadId, tipo: "TAREA_CERRADA", texto: `Cerró la tarea «${etiquetaTarea(fila.tipo)}» como ${d.estado === "HECHA" ? "hecha" : "descartada"}.${d.nota ? ` ${txt(d.nota, 500)}` : ""}` });
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
    await registrar(tx, ctx, m, { tipo: "PEDIDO_CERRADO", texto: `Cerró un pedido al equipo como ${d.estado === "HECHO" ? "hecho" : d.estado.toLowerCase()}.` });
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
  const r = await ponerAlDiaEnElArm(ctx, ahora);
  if (!r.ok) return r;
  const desdeDestinos = await cerrarDesdeDestinos(ctx, ahora);
  if (!desdeDestinos.ok) return desdeDestinos;
  return { ...r, cerradas: r.cerradas + desdeDestinos.cerradas };
}

/**
 * GSG-CRM-017 (V6): las asignadas cuyo proyecto vive en un negocio vinculado toman su cierre de ahí. Por cada destino,
 * dos fases: en el destino se lee SÓLO el estado de los proyectos que nacieron de este ARM (`estadosEnDestino`);
 * en el ARM se aplica el pase (GANADA o PERDIDA con su motivo). Ningún dato personal ni monto cruza de vuelta.
 */
async function cerrarDesdeDestinos(ctx: Ctx, ahora: Date): Promise<Res<{ cerradas: number }>> {
  const destinos = await correr<{ ids: string[] }>(ctx, async (tx) => {
    await guardia(tx, ctx, "configurar", {}, ahora);
    const filas = await tx.oportunidad.findMany({ where: { tenantId: ctx.tenantId, etapa: "ASIGNADA", destinoTenantId: { not: null } }, select: { destinoTenantId: true }, distinct: ["destinoTenantId"] });
    return { ok: true, ids: filas.map((f) => f.destinoTenantId as string) };
  });
  if (!destinos.ok) return destinos;
  let cerradas = 0;
  for (const destinoTenantId of destinos.ids) {
    try {
      cerradas += await trasladoTransaction({ origen: ctx.tenantId, destino: destinoTenantId }, async (fases: FasesDeTraslado) => {
        const asignadas = await fases.enOrigen((tx) => tx.oportunidad.findMany({ where: { tenantId: ctx.tenantId, etapa: "ASIGNADA", destinoTenantId }, select: SEL_OP }));
        const estados = await fases.enDestino((tx) => estadosEnDestino(tx, destinoTenantId, ctx.tenantId, asignadas.map((o) => o.proyectoDestinoId as string)));
        const cierre = new Map(estados.map((e) => [e.proyectoId, e.cierre]));
        return fases.enOrigen(async (tx) => {
          const m = await miembroDe(tx, ctx);
          let n = 0;
          for (const o of asignadas) {
            const c = cierre.get(o.proyectoDestinoId as string);
            if (!c) continue;
            await aplicar(tx, ctx, m, o, c.destino, { motivo: c.motivo, nota: c.nota, desdeProyecto: true }, ahora);
            n++;
          }
          return n;
        });
      });
    } catch (e) {
      return rechazoEntreNegocios(ctx, e);
    }
  }
  return { ok: true, cerradas };
}

/**
 * GSG-CRM-017 · B2 (PROVISIONAL a confirmar por el dueño): una asignada se gana o se pierde en SU PROYECTO, en el
 * negocio destino (lo cierra quien ve todos los proyectos allá). Desde la ficha del ARM, Dirección o el comercial que la
 * atiende traen ese cierre al momento, sin esperar a «poner al día»: misma lectura acotada que `cerrarDesdeDestinos`
 * (V6), sólo para esta oportunidad. Si el proyecto sigue en curso, no cambia nada y lo dice.
 */
export async function traerCierreDelProyecto(ctx: Ctx, oportunidadId: string, ahora = new Date()): Promise<Res<{ etapa: string; cerrada: boolean }>> {
  const pre = await correr<{ destinoTenantId: string }>(ctx, async (tx) => {
    const m = await miembroDe(tx, ctx);
    const o = await tx.oportunidad.findFirst({ where: { tenantId: ctx.tenantId, id: oportunidadId }, select: { etapa: true, destinoTenantId: true, proyectoDestinoId: true, duenoUserId: true } });
    if (!o) throw new RechazoCrm("No existe esa oportunidad.");
    if (!m || !m.activo || (m.rol !== "DIRECCION" && o.duenoUserId !== ctx.userId)) throw new RechazoCrm("Lo trae Dirección o el comercial que la atiende.", oportunidadId);
    if (o.etapa !== "ASIGNADA" || !o.destinoTenantId || !o.proyectoDestinoId) throw new RechazoCrm("Sólo una oportunidad asignada a un negocio vinculado trae el cierre de su proyecto.", oportunidadId);
    return { ok: true, destinoTenantId: o.destinoTenantId };
  });
  if (!pre.ok) return pre;
  const { destinoTenantId } = pre;
  try {
    return await trasladoTransaction({ origen: ctx.tenantId, destino: destinoTenantId }, async (fases: FasesDeTraslado) => {
      const o = await fases.enOrigen((tx) => tx.oportunidad.findFirst({ where: { tenantId: ctx.tenantId, id: oportunidadId, etapa: "ASIGNADA", destinoTenantId }, select: SEL_OP }));
      if (!o) return { ok: true as const, etapa: "ASIGNADA", cerrada: false }; // otro la cerró recién
      const [estado] = await fases.enDestino((tx) => estadosEnDestino(tx, destinoTenantId, ctx.tenantId, [o.proyectoDestinoId as string]));
      if (!estado?.cierre) return { ok: true as const, etapa: "ASIGNADA", cerrada: false };
      const c = estado.cierre;
      return fases.enOrigen(async (tx) => {
        const m = await miembroDe(tx, ctx);
        await aplicar(tx, ctx, m, o, c.destino, { motivo: c.motivo, nota: c.nota, desdeProyecto: true }, ahora);
        return { ok: true as const, etapa: c.destino, cerrada: true };
      });
    });
  } catch (e) {
    return rechazoEntreNegocios(ctx, e);
  }
}

async function ponerAlDiaEnElArm(ctx: Ctx, ahora: Date): Promise<Res<{ tareas: number; despertadas: number; cerradas: number }>> {
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
    for (const o of nuevas) await registrar(tx, ctx, m, { oportunidadId: o.id, tipo: "TAREA", texto: "El próximo paso venció: nueva tarea «Seguimiento» para el Seguidor." });

    let despertadas = 0;
    const dormidas = await tx.oportunidad.findMany({ where: { tenantId: ctx.tenantId, etapa: "DORMIDA", despertarEl: { lte: ahora } }, select: SEL_OP });
    for (const o of dormidas) {
      const r = despertar({ etapa: "DORMIDA", etapaPrevia: (o.etapaPrevia ?? null) as Etapa | null, despertarEl: o.despertarEl }, ahora);
      if (!r.ok) continue;
      await escribirOp(tx, ctx, o, { etapa: r.etapa, etapaDesde: ahora, etapaPrevia: null, despertarEl: null, proximoPaso: "Retomar: le tocó despertar", proximoPasoEl: ahora });
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
  // GSG-CRM-011 (B7): lo mismo que `verOportunidad` en permisos.ts (asignada a él, o la consulta que cargó él sin dueño).
  if (m.rol === "COMERCIAL") return { tenantId: ctx.tenantId, OR: [{ duenoUserId: ctx.userId }, { duenoUserId: null, tipo: "CONSULTA", creadaPor: ctx.userId }] };
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
  // GSG-CRM-011
  diasEnEtapa: number | null;
  ultimaActividadEl: Date | null;
  cierreEsperadoEl: Date | null;
  monto: number | null;
  moneda: string;
  montoPonderado: number | null;
  /** Probabilidad (%) de la etapa, de pronostico.ts. */
  probabilidad: number;
  /** Se pasó del plazo de seguimiento de la etapa (pronostico.ts). */
  sinSeguimiento: boolean;
  contactos: ContactoConPapel[];
}

/** Un contacto de la oportunidad con sus papeles (uno o más). */
export interface ContactoConPapel {
  contactoId: string;
  nombre: string;
  cargo: string | null;
  papeles: Papel[];
  suprimido: boolean;
}

const SEL_VINCULOS = {
  orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  select: { papel: true, contacto: { select: { id: true, nombre: true, cargo: true, suprimidoEl: true } } },
} satisfies Prisma.OportunidadContactoFindManyArgs;

/** Agrupa las filas de `OportunidadContacto` por persona, en el orden en que se vincularon. */
function contactosConPapel(v: readonly { papel: string; contacto: { id: string; nombre: string; cargo: string | null; suprimidoEl: Date | null } }[]): ContactoConPapel[] {
  const por = new Map<string, ContactoConPapel>();
  for (const x of v) {
    if (!esPapel(x.papel)) continue;
    const c = por.get(x.contacto.id) ?? { contactoId: x.contacto.id, nombre: x.contacto.nombre, cargo: x.contacto.cargo, papeles: [], suprimido: !!x.contacto.suprimidoEl };
    if (!c.papeles.includes(x.papel)) c.papeles.push(x.papel);
    por.set(c.contactoId, c);
  }
  return [...por.values()];
}

/** Lo que suma GSG-CRM-011 a cada oportunidad leída (lista y ficha). */
function pronosticoDe(o: { etapa: string; etapaDesde: Date | null; ultimaActividadEl: Date | null; monto: Prisma.Decimal | null }, ahora: Date) {
  const etapa = o.etapa as Etapa;
  const monto = o.monto == null ? null : Number(o.monto);
  return {
    diasEnEtapa: diasEnEtapa(o.etapaDesde, ahora),
    montoPonderado: montoPonderado(monto, etapa),
    probabilidad: PRONOSTICO[etapa].probabilidad,
    sinSeguimiento: sinSeguimiento({ etapa, ultimaActividadEl: o.ultimaActividadEl, etapaDesde: o.etapaDesde }, ahora).atrasada,
  };
}

export async function listarOportunidades(ctx: Ctx, f: { etapa?: string | null } = {}, ahora = new Date()): Promise<Res<{ filas: FilaOportunidad[] }>> {
  return correr(ctx, async (tx) => {
    // Sólo la membresía: el alcance lo pone `filtroVisible` (el contexto es el del propio usuario).
    const m = await guardia(tx, ctx, "ver_oportunidad", { oportunidad: { duenoUserId: ctx.userId, creadaPor: ctx.userId, tomadoresEnCurso: [] } }, ahora);
    const filas = await tx.oportunidad.findMany({
      where: { ...filtroVisible(ctx, m), ...(f.etapa && esEtapa(f.etapa) ? { etapa: f.etapa } : {}) },
      orderBy: [{ proximoPasoEl: "asc" }, { id: "asc" }],
      take: 500,
      select: {
        id: true, tipo: true, etapa: true, puntaje: true, destino: true, proximoPaso: true, proximoPasoEl: true, pasePropuesto: true, duenoUserId: true, version: true,
        etapaDesde: true, ultimaActividadEl: true, cierreEsperadoEl: true, monto: true, moneda: true,
        marca: { select: { nombre: true } }, evento: { select: { nombre: true } }, contactos: SEL_VINCULOS,
      },
    });
    return {
      ok: true,
      filas: filas.map(({ marca, evento, contactos, etapaDesde, ...r }) => ({
        ...r,
        ...pronosticoDe({ ...r, etapaDesde }, ahora),
        monto: r.monto == null ? null : Number(r.monto),
        marca: marca?.nombre ?? null,
        evento: evento?.nombre ?? null,
        contactos: contactosConPapel(contactos),
      })),
    };
  });
}

/** «Hoy»: lo que vence o espera, ordenado por urgencia (E7, E19, E20). */
export async function hoy(ctx: Ctx, ahora = new Date()): Promise<Res<{ entradas: EntradaHoy[] }>> {
  return correr(ctx, async (tx) => {
    const m = await guardia(tx, ctx, "ver_oportunidad", { oportunidad: { duenoUserId: ctx.userId, creadaPor: ctx.userId, tomadoresEnCurso: [] } }, ahora);
    const items = await tx.oportunidad.findMany({
      where: { ...filtroVisible(ctx, m), etapa: { notIn: [...TERMINALES] } },
      take: 1000,
      select: { id: true, etapa: true, proximoPasoEl: true, fechaLimite: true, calificadaEl: true, despertarEl: true, pasePropuesto: true, ultimaActividadEl: true, etapaDesde: true },
    });
    return { ok: true, entradas: bandejaHoy(items.map((i) => ({ ...i, etapa: i.etapa as Etapa, pasePropuesto: (i.pasePropuesto ?? null) as Etapa | null })), ahora, VARA) };
  });
}

/** La ficha: la oportunidad, su línea de tiempo, el brief y los borradores. */
export async function ficha(ctx: Ctx, id: string, ahora = new Date()) {
  return correr(ctx, async (tx) => {
    const { o } = await sobre(tx, ctx, id, "ver_oportunidad", ahora);
    const { vista, brief } = await vistaDe(tx, ctx, o);
    const [actividades, borradores, vinculos, principal] = await Promise.all([
      tx.actividadComercial.findMany({ where: { tenantId: ctx.tenantId, oportunidadId: o.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 500, select: { id: true, usuarioId: true, puesto: true, tipo: true, texto: true, fuenteUrl: true, createdAt: true } }),
      tx.borradorMensaje.findMany({ where: { tenantId: ctx.tenantId, oportunidadId: o.id }, orderBy: { createdAt: "asc" }, select: { id: true, canal: true, asunto: true, cuerpo: true, estado: true, motivoRechazo: true, version: true } }),
      tx.oportunidadContacto.findMany({ where: { tenantId: ctx.tenantId, oportunidadId: o.id }, ...SEL_VINCULOS }),
      o.contactoId ? tx.contactoComercial.findFirst({ where: { id: o.contactoId, tenantId: ctx.tenantId }, select: { id: true, nombre: true, cargo: true, suprimidoEl: true } }) : null,
    ]);
    // GSG-CRM-011: el contacto principal sin papel también es de la ficha (se le escribe y se le da un papel).
    const contactos = contactosConPapel(vinculos);
    if (principal && !contactos.some((c) => c.contactoId === principal.id)) {
      contactos.unshift({ contactoId: principal.id, nombre: principal.nombre, cargo: principal.cargo, papeles: [], suprimido: !!principal.suprimidoEl });
    }
    const p = puntuar(vista.datos, ahora, VARA);
    // GSG-CRM-017: en qué negocio nació (o nacería) el proyecto. Sólo el nombre, del vínculo del ARM.
    // Para una asignada, también la dirección del negocio (su subdominio) para enlazar al proyecto (B2).
    const asignadaA = o.destinoTenantId
      ? (await tx.vinculoNegocio.findFirst({ where: { tenantId: ctx.tenantId, destinoTenantId: o.destinoTenantId }, select: { destinoTenant: { select: { name: true, subdomain: true } } } }))?.destinoTenant
      : null;
    const negocioDestino = o.destinoTenantId
      ? (asignadaA?.name ?? "el negocio vinculado")
      : ((await vinculoActivo(tx, ctx, o.destinoConfirmado ? o.destino : null))?.destinoNombre ?? null);
    const subdominioDestino = asignadaA?.subdomain ?? null;
    return {
      ok: true as const,
      oportunidad: { ...o, monto: o.monto == null ? null : Number(o.monto), ...pronosticoDe(o, ahora) },
      negocioDestino,
      subdominioDestino,
      contactos,
      brief,
      puntaje: p,
      actividades,
      borradores,
    };
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

// ── GSG-CRM-011 · lecturas de las pantallas y edición del borrador ──────────
//
// Las pantallas (src/app/admin/(dashboard)/crm) sólo esconden lo que no le toca a cada uno: el rechazo vive
// acá, igual que en el resto del repo (E12). Todo pasa por `correr` (tenantTransaction + tenantId a mano).

/** Una persona del CRM con su nombre (línea de tiempo, elegir comercial). */
export interface PersonaCrm {
  userId: string;
  nombre: string;
  rol: Rol;
  puesto: Puesto | null;
  activo: boolean;
}

/** Quién soy en el CRM. La pantalla decide qué botones mostrar con `puede`; el servidor igual rechaza. */
export async function miMembresia(ctx: Ctx): Promise<Res<{ miembro: Miembro | null; hayDireccion: boolean }>> {
  return correr(ctx, async (tx) => {
    const miembro = await miembroDe(tx, ctx);
    const hayDireccion = (await tx.miembroCrmComercial.count({ where: { tenantId: ctx.tenantId, rol: "DIRECCION", activo: true } })) > 0;
    return { ok: true, miembro, hayDireccion };
  });
}

/** Las personas y puestos del CRM, con su nombre. Hace falta estar dado de alta (activo). */
export async function personasDelCrm(ctx: Ctx): Promise<Res<{ personas: PersonaCrm[] }>> {
  return correr(ctx, async (tx) => {
    const m = await miembroDe(tx, ctx);
    if (!m || !m.activo) no("No estás dado de alta en el CRM comercial. Pedíselo a Dirección.");
    const filas = await tx.miembroCrmComercial.findMany({ where: { tenantId: ctx.tenantId }, select: { userId: true, rol: true, puesto: true, activo: true } });
    const usuarios = await tx.user.findMany({ where: { tenantId: ctx.tenantId, id: { in: filas.map((f) => f.userId) } }, select: { id: true, name: true } });
    const nombre = new Map(usuarios.map((u) => [u.id, u.name]));
    return {
      ok: true,
      personas: filas.map((f) => ({ userId: f.userId, nombre: nombre.get(f.userId) ?? "Usuario sin nombre", rol: f.rol as Rol, puesto: (f.puesto ?? null) as Puesto | null, activo: f.activo })),
    };
  });
}

/** Un usuario del negocio y su lugar en el CRM (o null: sin acceso). Pantalla «Miembros del CRM». */
export interface UsuarioYMiembro {
  userId: string;
  nombre: string;
  email: string;
  /** Activo en el ERP (un usuario dado de baja en el panel no entra, tenga el papel que tenga en el CRM). */
  activoEnErp: boolean;
  miembro: { rol: Rol; puesto: Puesto | null; activo: boolean; topeAccionesDia: number | null; topeCostoDiaUsd: number | null } | null;
}

/**
 * Los usuarios del negocio con su papel en el CRM. Sólo Dirección (`configurar`): el resto lo rechaza el servidor
 * y el rechazo queda registrado. El usuario del ERP no se crea acá (alta de usuarios del panel).
 */
export async function usuariosYMiembros(ctx: Ctx, ahora = new Date()): Promise<Res<{ usuarios: UsuarioYMiembro[] }>> {
  return correr(ctx, async (tx) => {
    await guardia(tx, ctx, "configurar", {}, ahora);
    const usuarios = await tx.user.findMany({
      where: { tenantId: ctx.tenantId, deletedAt: null },
      select: { id: true, name: true, email: true, active: true },
      orderBy: { name: "asc" },
    });
    const filas = await tx.miembroCrmComercial.findMany({
      where: { tenantId: ctx.tenantId },
      select: { userId: true, rol: true, puesto: true, activo: true, topeAccionesDia: true, topeCostoDiaUsd: true },
    });
    const de = new Map(filas.map((f) => [f.userId, f]));
    return {
      ok: true,
      usuarios: usuarios.map((u) => {
        const f = de.get(u.id);
        return {
          userId: u.id,
          nombre: u.name,
          email: u.email,
          activoEnErp: u.active,
          miembro: f
            ? { rol: f.rol as Rol, puesto: (f.puesto ?? null) as Puesto | null, activo: f.activo, topeAccionesDia: f.topeAccionesDia, topeCostoDiaUsd: f.topeCostoDiaUsd == null ? null : Number(f.topeCostoDiaUsd) }
            : null,
        };
      }),
    };
  });
}

export interface BorradorEnLista {
  id: string;
  oportunidadId: string;
  canal: string;
  asunto: string | null;
  cuerpo: string;
  estado: string;
  motivoRechazo: string | null;
  version: number;
  createdAt: Date;
  redactadoPor: string;
  marca: string | null;
  evento: string | null;
  contacto: string | null;
}

/** Los borradores de las oportunidades que la persona ve (E12), los más viejos primero. */
export async function listarBorradores(ctx: Ctx, f: { estados?: readonly string[] } = {}, ahora = new Date()): Promise<Res<{ borradores: BorradorEnLista[] }>> {
  return correr(ctx, async (tx) => {
    const m = await guardia(tx, ctx, "ver_oportunidad", { oportunidad: { duenoUserId: ctx.userId, creadaPor: ctx.userId, tomadoresEnCurso: [] } }, ahora);
    const estados = (f.estados ?? ["BORRADOR", "APROBADO"]).filter((e) => (["BORRADOR", "APROBADO", "ENVIADO_POR_PERSONA", "RECHAZADO"] as readonly string[]).includes(e));
    const filas = await tx.borradorMensaje.findMany({
      where: { tenantId: ctx.tenantId, estado: { in: estados }, oportunidad: filtroVisible(ctx, m) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 300,
      select: {
        id: true, oportunidadId: true, canal: true, asunto: true, cuerpo: true, estado: true, motivoRechazo: true, version: true, createdAt: true, redactadoPor: true,
        oportunidad: { select: { marca: { select: { nombre: true } }, evento: { select: { nombre: true } } } },
        contacto: { select: { nombre: true } },
      },
    });
    return {
      ok: true,
      borradores: filas.map(({ oportunidad, contacto, ...b }) => ({ ...b, marca: oportunidad.marca?.nombre ?? null, evento: oportunidad.evento?.nombre ?? null, contacto: contacto?.nombre ?? null })),
    };
  });
}

/**
 * Corregir el texto de un borrador ANTES de aprobarlo. Lo hace quien lo revisa (una persona: la misma regla
 * que aprobar). Control de versión: si otro lo cambió, aviso (E2). Queda en la línea de tiempo (sirve para
 * medir «borradores aprobados sin editar», diseño §4.6).
 */
export async function editarBorrador(ctx: Ctx, id: string, d: { asunto?: string | null; cuerpo: string; version?: number }, ahora = new Date()): Promise<Res<{ version: number }>> {
  return correr<{ version: number }>(ctx, async (tx) => {
    const b = await tx.borradorMensaje.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, oportunidadId: true, estado: true, version: true } });
    if (!b) no("Ese borrador no existe.");
    const fila = b as NonNullable<typeof b>;
    const { o, miembro } = await sobre(tx, ctx, fila.oportunidadId, "aprobar_borrador", ahora);
    if (d.version !== undefined && d.version !== fila.version) no("Otra persona cambió ese borrador recién. Recargá y miralo de nuevo.", o.id);
    if (fila.estado !== "BORRADOR") no("Sólo se corrige un borrador que todavía no se aprobó.", o.id);
    const cuerpo = txt(d.cuerpo, 10_000);
    if (!cuerpo) no("El borrador está vacío.", o.id);
    const r = await tx.borradorMensaje.updateMany({
      where: { id: fila.id, tenantId: ctx.tenantId, estado: "BORRADOR", version: fila.version },
      data: { cuerpo: cuerpo as string, asunto: txt(d.asunto, 300), version: { increment: 1 } },
    });
    if (r.count !== 1) no("Otra persona cambió ese borrador recién. Recargá y miralo de nuevo.", o.id);
    await registrar(tx, ctx, miembro, { oportunidadId: o.id, tipo: "BORRADOR_EDITADO", texto: "Borrador corregido antes de aprobarlo." });
    return { ok: true, version: fila.version + 1 };
  });
}

export interface TareaEnLista {
  id: string;
  oportunidadId: string;
  tipo: string;
  para: string;
  venceEl: Date | null;
  createdAt: Date;
}
export interface PedidoEnLista {
  id: string;
  puesto: string;
  pedido: string;
  region: string | null;
  estado: string;
}

/**
 * La cola de cada uno: lo que espera en SU cola (un puesto, la de su puesto; Dirección, la de Dirección y la
 * de personas; un comercial, la de personas sobre lo suyo) y lo que tiene en curso. Un puesto ve además los
 * pedidos al equipo de su puesto. Sin el detalle de la oportunidad: eso se ve al tomarla.
 */
export async function colaDeTrabajo(ctx: Ctx): Promise<Res<{ enCola: TareaEnLista[]; enCurso: TareaEnLista[]; pedidosEnCola: PedidoEnLista[]; pedidosEnCurso: PedidoEnLista[] }>> {
  return correr(ctx, async (tx) => {
    const m = await miembroDe(tx, ctx);
    if (!m || !m.activo) no("No estás dado de alta en el CRM comercial. Pedíselo a Dirección.");
    const yo = m as Miembro;
    const paras = yo.rol === "PUESTO" ? [yo.puesto as string] : yo.rol === "DIRECCION" ? ["DIRECCION", "PERSONA"] : ["PERSONA"];
    const SEL = { id: true, oportunidadId: true, tipo: true, para: true, venceEl: true, createdAt: true } as const;
    const [enCola, enCurso] = await Promise.all([
      tx.tareaComercial.findMany({
        where: { tenantId: ctx.tenantId, estado: "EN_COLA", para: { in: paras }, ...(yo.rol === "COMERCIAL" ? { oportunidad: { duenoUserId: ctx.userId } } : {}) },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 100,
        select: SEL,
      }),
      tx.tareaComercial.findMany({ where: { tenantId: ctx.tenantId, estado: "EN_CURSO", tomadaPor: ctx.userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100, select: SEL }),
    ]);
    let pedidosEnCola: PedidoEnLista[] = [];
    let pedidosEnCurso: PedidoEnLista[] = [];
    if (yo.rol === "PUESTO") {
      const SELP = { id: true, puesto: true, pedido: true, region: true, estado: true } as const;
      [pedidosEnCola, pedidosEnCurso] = await Promise.all([
        tx.pedidoAlEquipo.findMany({ where: { tenantId: ctx.tenantId, estado: "EN_COLA", puesto: yo.puesto as string }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50, select: SELP }),
        tx.pedidoAlEquipo.findMany({ where: { tenantId: ctx.tenantId, estado: "EN_CURSO", tomadoPor: ctx.userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 50, select: SELP }),
      ]);
    }
    return { ok: true, enCola, enCurso, pedidosEnCola, pedidosEnCurso };
  });
}

export interface TomaDePedido {
  tomadoPor: string | null;
  tomadoEl: Date | null;
  cerradoEl: Date | null;
  notaCierre: string | null;
}

/**
 * Para la pantalla «Equipo» de Eventos y sponsors: quién tomó cada pedido y cuándo. Esa página ya pasó su
 * guardia (interruptor, rol de gestión y negocio) y la llama sólo con el CRM prendido. Sin la migración de las
 * columnas de toma (Gate 2) devuelve vacío: la pantalla queda como estaba.
 */
/** El puesto en criollo («Verificador», no «verificador»); sin puesto, nada. */
const etiquetaDePuesto = (p: string | null | undefined): string | null => (p ? (ETIQUETA_PUESTO_CRM[p] ?? p) : null);

export async function tomasDePedidos(tenantId: string, ids: readonly string[]): Promise<Map<string, TomaDePedido>> {
  if (ids.length === 0) return new Map();
  try {
    return await tenantTransaction(
      async (tx) => {
        const filas = await tx.pedidoAlEquipo.findMany({ where: { tenantId, id: { in: [...ids] } }, select: { id: true, tomadoPor: true, tomadoEl: true, cerradoEl: true, notaCierre: true } });
        const quienes = [...new Set(filas.map((f) => f.tomadoPor).filter((x): x is string => !!x))];
        const usuarios = quienes.length ? await tx.user.findMany({ where: { tenantId, id: { in: quienes } }, select: { id: true, name: true } }) : [];
        const miembros = quienes.length ? await tx.miembroCrmComercial.findMany({ where: { tenantId, userId: { in: quienes } }, select: { userId: true, puesto: true } }) : [];
        const nombre = new Map(usuarios.map((u) => [u.id, u.name]));
        const puesto = new Map(miembros.map((x) => [x.userId, x.puesto]));
        return new Map(
          filas.map((f) => [
            f.id,
            {
              tomadoPor: f.tomadoPor ? [nombre.get(f.tomadoPor) ?? "Alguien del equipo", etiquetaDePuesto(puesto.get(f.tomadoPor))].filter(Boolean).join(" · ") : null,
              tomadoEl: f.tomadoEl,
              cerradoEl: f.cerradoEl,
              notaCierre: f.notaCierre,
            },
          ]),
        );
      },
      { tenantId },
    );
  } catch (e) {
    if (esFaltaDeTabla(e)) return new Map();
    throw e;
  }
}

/** Lo que la ficha muestra además de `ficha`: la consulta (como dato), la licitación, el motivo y la verificación de la fuente. */
export async function detalleDeFicha(ctx: Ctx, id: string, ahora = new Date()) {
  return correr(ctx, async (tx) => {
    const { o } = await sobre(tx, ctx, id, "ver_oportunidad", ahora);
    const [extra, marca, evento, relacion] = await Promise.all([
      tx.oportunidad.findFirst({ where: { id: o.id, tenantId: ctx.tenantId }, select: { consultaTexto: true, fechaLimite: true, motivo: true, nota: true, createdAt: true } }),
      o.marcaId ? tx.marcaRelevada.findFirst({ where: { id: o.marcaId, tenantId: ctx.tenantId }, select: { id: true, nombre: true, dominio: true, rubro: true } }) : null,
      o.eventoId ? tx.eventoRelevado.findFirst({ where: { id: o.eventoId, tenantId: ctx.tenantId }, select: { id: true, nombre: true, fecha: true, lugar: true, verificacion: true, urlFuente: true } }) : null,
      o.marcaId && o.eventoId
        ? tx.eventoMarca.findFirst({ where: { tenantId: ctx.tenantId, eventoId: o.eventoId, marcaId: o.marcaId }, orderBy: [{ verificacion: "asc" }], select: { verificacion: true, urlFuente: true } })
        : null,
    ]);
    return { ok: true as const, ...extra, marca, evento, marcaEnEvento: relacion };
  });
}

/** Los eventos relevados, para elegir al cargar un prospecto. Pide poder proponer oportunidades. */
export async function eventosParaElegir(ctx: Ctx, ahora = new Date()): Promise<Res<{ eventos: { id: string; nombre: string; fecha: Date; region: string }[] }>> {
  return correr(ctx, async (tx) => {
    await guardia(tx, ctx, "proponer_oportunidad", {}, ahora);
    const eventos = await tx.eventoRelevado.findMany({ where: { tenantId: ctx.tenantId }, orderBy: [{ fecha: "asc" }, { id: "asc" }], take: 300, select: { id: true, nombre: true, fecha: true, region: true } });
    return { ok: true, eventos };
  });
}
