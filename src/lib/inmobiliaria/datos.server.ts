// ============================================================================
// INMOBILIARIA — lecturas del servidor. Siempre acotadas al negocio (tenantId). Hay tres
// públicos distintos y cada lectura dice para cuál es:
//   · la calle (sitio público): sólo fichas publicadas y sólo los datos que van a la vista;
//   · el equipo (panel): pide permiso; el agente ve fichas y SUS consultas, no la plata;
//   · el inquilino y el propietario (link sin login): la llave es el token.
// Las escrituras viven en acciones.ts. La plata sale de la base en decimal y cruza este borde
// como `number` (ADR-100 §4).
// ============================================================================

import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability } from "@/lib/capabilities";
import type { SessionUser } from "@/lib/session";
import { getLocation } from "@/lib/settings";
import { todayInBusinessTz } from "@/lib/datetime";
import {
  avisosDeContrato,
  calcularAjuste,
  CONSULTA_ABIERTA,
  diaDe,
  estadoCuota,
  ESTADOS_EN_LA_WEB,
  etiquetas,
  inicioDeTramo,
  instanteDe,
  liquidarPorContrato,
  mesesDelContrato,
  minutosSinResponder,
  pendienteDeLiquidar,
  PLANTILLAS_DEFAULT,
  punitorioSugerido,
  redondear,
  repartoLiquidado,
  revisarFicha,
  saldoCuota,
  sumarDias,
  tituloProlijo,
  totalCuota,
  tramoDe,
  usaSerie,
  leerReciboConfig,
  numeroDeRecibo,
  type AvisoContrato,
  type ClavePlantilla,
  type ReciboConfig,
  type CobroALiquidar,
  type ContratoCalc,
  type Dia,
  type EstadoConsulta,
  type EstadoCuota,
  type EstadoPropiedad,
  type Etiqueta,
  type Extra,
  type Filtros,
  type IndiceAjuste,
  type Liquidacion,
  type Periodo,
  type PorRubro,
  type PuntoIndice,
  type ResultadoAjuste,
  type RevisionFicha,
} from "./core";

// ── Bordes ──────────────────────────────────────────────────────────────────

const n = (v: unknown): number => (v == null ? 0 : Number(v));
const nN = (v: unknown): number | null => (v == null ? null : Number(v));
const dia = (d: Date | null | undefined): Dia | null => (d ? diaDe(d) : null);
export const hoyDia = (): Dia => todayInBusinessTz();

/**
 * Una foto guardada como data URL nunca viaja dentro de la página: la sirve su propia ruta.
 * Los listados no leen la columna `url` de esas fotos (pesa cientos de KB cada una): con `esData`
 * alcanza para armar el link. `url` llega sólo para las fotos que son un link.
 */
export const srcDeFoto = (f: { id: string; url?: string | null; esData: boolean }): string =>
  f.esData || !f.url || f.url.startsWith("data:") ? `/propiedades/foto/${f.id}` : f.url;

/** Lo mínimo que un listado lee de cada foto. */
const SELECT_FOTO_LIVIANA = { id: true, esData: true } satisfies Prisma.InmoFotoSelect;
type FotoLiviana = { id: string; esData: boolean };

/**
 * El `src` de cada foto de una lista, en UNA consulta más que trae la `url` sólo de las que son
 * un link (las data URL no se leen: su src es la ruta). Devuelve id → src.
 */
async function srcsDeFotos(tenantId: string, fotos: readonly FotoLiviana[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const links = fotos.filter((f) => !f.esData).map((f) => f.id);
  const urls = links.length ? await prisma.inmoFoto.findMany({ where: { tenantId, id: { in: links }, esData: false }, select: { id: true, url: true } }) : [];
  const porId = new Map(urls.map((u) => [u.id, u.url]));
  for (const f of fotos) out.set(f.id, srcDeFoto({ id: f.id, esData: f.esData, url: porId.get(f.id) ?? null }));
  return out;
}

export function leerExtras(json: unknown): Extra[] {
  if (!Array.isArray(json)) return [];
  const out: Extra[] = [];
  for (const e of json) {
    if (e && typeof e === "object" && typeof (e as Extra).concepto === "string" && Number.isFinite(Number((e as Extra).monto))) {
      out.push({ concepto: (e as Extra).concepto, monto: Number((e as Extra).monto) });
    }
  }
  return out;
}

// ── Configuración y datos del negocio ───────────────────────────────────────

export interface ConfigInmo {
  prefijoCodigo: string;
  comisionAdminPct: number;
  ivaComisionPct: number;
  punitorioDiarioPct: number;
  punitoriosAlPropietario: boolean;
  aliasCbu: string;
  linkMercadoPago: string;
  matricula: string;
  plantillas: Record<ClavePlantilla, string>;
  recibo: ReciboConfig;
}

export async function configInmo(tenantId: string): Promise<ConfigInmo> {
  const c = await prisma.inmoConfig.findUnique({ where: { tenantId } });
  const p = (c?.plantillas ?? {}) as Record<string, unknown>;
  const plantillas = { ...PLANTILLAS_DEFAULT } as Record<ClavePlantilla, string>;
  for (const k of Object.keys(plantillas) as ClavePlantilla[]) {
    if (typeof p[k] === "string" && (p[k] as string).trim()) plantillas[k] = p[k] as string;
  }
  return {
    prefijoCodigo: c?.prefijoCodigo ?? "PRO",
    comisionAdminPct: c?.comisionAdminPct ?? 0,
    ivaComisionPct: c?.ivaComisionPct ?? 0,
    punitorioDiarioPct: c?.punitorioDiarioPct ?? 0,
    punitoriosAlPropietario: c?.punitoriosAlPropietario ?? true,
    aliasCbu: c?.aliasCbu ?? "",
    linkMercadoPago: c?.linkMercadoPago ?? "",
    matricula: c?.matricula ?? "",
    plantillas,
    recibo: leerReciboConfig(c?.recibo),
  };
}

/** Datos del negocio que van en el sitio, en los mensajes y en los papeles. */
export async function negocioInmo(tenantId: string) {
  const [tenant, loc] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, slug: true } }),
    getLocation(),
  ]);
  return {
    nombre: tenant?.name ?? "La inmobiliaria",
    slug: tenant?.slug ?? "",
    lema: loc.shortLabel,
    calle: loc.addressLine,
    ciudad: loc.city,
    direccion: [loc.addressLine, loc.city].filter(Boolean).join(", "),
    horario: loc.hoursLabel,
    whatsapp: loc.whatsapp,
    email: loc.email,
    instagramUrl: loc.instagramUrl,
    instagramLabel: loc.instagramLabel,
    mapsUrl: loc.mapsUrl,
  };
}
export type NegocioInmo = Awaited<ReturnType<typeof negocioInmo>>;

// ── Sitio público ───────────────────────────────────────────────────────────

export interface TarjetaPropiedad {
  id: string;
  slug: string;
  codigo: string;
  titulo: string;
  tipo: string;
  estado: EstadoPropiedad;
  zona: string;
  localidad: string;
  enVenta: boolean;
  enAlquiler: boolean;
  precioVenta: number | null;
  monedaVenta: string;
  precioAlquiler: number | null;
  monedaAlquiler: string;
  expensas: number | null;
  ambientes: number | null;
  dormitorios: number | null;
  banos: number | null;
  cocheras: number | null;
  supCubierta: number | null;
  supTotal: number | null;
  aptoCredito: boolean;
  destacada: boolean;
  foto: string | null;
  fotos: number;
  etiquetas: Etiqueta[];
}

const SELECT_TARJETA = {
  id: true, slug: true, codigo: true, titulo: true, tipo: true, estado: true, barrio: true, localidad: true,
  enVenta: true, enAlquiler: true, precioVenta: true, monedaVenta: true, precioAlquiler: true, monedaAlquiler: true, expensas: true,
  ambientes: true, dormitorios: true, banos: true, cocheras: true, supCubierta: true, supTotal: true,
  aptoCredito: true, destacada: true, publicadaEl: true, bajoDePrecioEl: true,
  fotos: { orderBy: [{ posicion: "asc" }, { createdAt: "asc" }], take: 1, select: SELECT_FOTO_LIVIANA },
  _count: { select: { fotos: true } },
} satisfies Prisma.InmoPropiedadSelect;

type FilaTarjeta = Prisma.InmoPropiedadGetPayload<{ select: typeof SELECT_TARJETA }>;

/** Los src de las tapas de una lista de fichas (una consulta para todas). */
const tapasDe = (tenantId: string, filas: readonly FilaTarjeta[]) => srcsDeFotos(tenantId, filas.flatMap((p) => p.fotos));

function aTarjeta(p: FilaTarjeta, hoy: Dia, tapas: ReadonlyMap<string, string>): TarjetaPropiedad {
  const primera = p.fotos[0];
  return {
    id: p.id,
    slug: p.slug,
    codigo: p.codigo,
    titulo: tituloProlijo(p.titulo, [p.localidad, p.barrio]),
    tipo: p.tipo,
    estado: p.estado as EstadoPropiedad,
    zona: [p.barrio, p.localidad].filter((v) => v && v.trim()).join(", "),
    localidad: p.localidad,
    enVenta: p.enVenta,
    enAlquiler: p.enAlquiler,
    precioVenta: nN(p.precioVenta),
    monedaVenta: p.monedaVenta,
    precioAlquiler: nN(p.precioAlquiler),
    monedaAlquiler: p.monedaAlquiler,
    expensas: nN(p.expensas),
    ambientes: p.ambientes,
    dormitorios: p.dormitorios,
    banos: p.banos,
    cocheras: p.cocheras,
    supCubierta: p.supCubierta,
    supTotal: p.supTotal,
    aptoCredito: p.aptoCredito,
    destacada: p.destacada,
    foto: primera ? (tapas.get(primera.id) ?? srcDeFoto(primera)) : null,
    fotos: p._count.fotos,
    etiquetas: etiquetas({ estado: p.estado, publicadaEl: dia(p.publicadaEl), bajoDePrecioEl: dia(p.bajoDePrecioEl), aptoCredito: p.aptoCredito, enVenta: p.enVenta }, hoy),
  };
}

const EN_LA_WEB = { in: [...ESTADOS_EN_LA_WEB] as string[] };

function whereDeBusqueda(tenantId: string, f: Filtros): Prisma.InmoPropiedadWhereInput {
  const and: Prisma.InmoPropiedadWhereInput[] = [];
  if (f.operacion === "venta") and.push({ enVenta: true });
  if (f.operacion === "alquiler") and.push({ enAlquiler: true });
  if (f.tipo) and.push({ tipo: f.tipo });
  if (f.localidad) and.push({ localidad: { equals: f.localidad, mode: "insensitive" } });
  if (f.ambientes) and.push({ ambientes: { gte: f.ambientes } });
  if (f.dormitorios) and.push({ dormitorios: { gte: f.dormitorios } });
  if (f.aptoCredito) and.push({ aptoCredito: true, enVenta: true });
  if (f.precioMin || f.precioMax) {
    // El rango se aplica al precio de la operación elegida; sin operación, a cualquiera de las dos.
    const rango = { ...(f.precioMin ? { gte: f.precioMin } : {}), ...(f.precioMax ? { lte: f.precioMax } : {}) };
    if (f.operacion === "venta") and.push({ precioVenta: rango });
    else if (f.operacion === "alquiler") and.push({ precioAlquiler: rango });
    else and.push({ OR: [{ enVenta: true, precioVenta: rango }, { enAlquiler: true, precioAlquiler: rango }] });
  }
  if (f.texto) {
    const contiene = { contains: f.texto, mode: "insensitive" as const };
    and.push({ OR: [{ titulo: contiene }, { codigo: contiene }, { barrio: contiene }, { localidad: contiene }, { mostrarDireccion: true, direccion: contiene }, { descripcion: contiene }] });
  }
  return { tenantId, estado: EN_LA_WEB, AND: and };
}

export const POR_PAGINA = 12;

export async function buscarPropiedades(tenantId: string, f: Filtros) {
  const where = whereDeBusqueda(tenantId, f);
  const campoPrecio = f.operacion === "alquiler" ? "precioAlquiler" : "precioVenta";
  const orderBy: Prisma.InmoPropiedadOrderByWithRelationInput[] =
    f.orden === "precio-asc"
      ? [{ [campoPrecio]: { sort: "asc", nulls: "last" } }]
      : f.orden === "precio-desc"
        ? [{ [campoPrecio]: { sort: "desc", nulls: "last" } }]
        : [{ destacada: "desc" }, { publicadaEl: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
  const [total, filas] = await Promise.all([
    prisma.inmoPropiedad.count({ where }),
    prisma.inmoPropiedad.findMany({ where, orderBy, skip: (f.pagina - 1) * POR_PAGINA, take: POR_PAGINA, select: SELECT_TARJETA }),
  ]);
  const hoy = hoyDia();
  const tapas = await tapasDe(tenantId, filas);
  return { total, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)), items: filas.map((p) => aTarjeta(p, hoy, tapas)) };
}

/** Lo que va en la portada: las destacadas y, si no alcanzan, las últimas publicadas. */
export async function propiedadesDePortada(tenantId: string, cuantas = 6): Promise<TarjetaPropiedad[]> {
  const filas = await prisma.inmoPropiedad.findMany({
    where: { tenantId, estado: EN_LA_WEB },
    orderBy: [{ destacada: "desc" }, { publicadaEl: { sort: "desc", nulls: "last" } }],
    take: cuantas,
    select: SELECT_TARJETA,
  });
  const hoy = hoyDia();
  const tapas = await tapasDe(tenantId, filas);
  return filas.map((p) => aTarjeta(p, hoy, tapas));
}

/** Las zonas donde hay algo publicado, con su cantidad: arma el buscador y "Dónde trabajamos". */
export async function zonasPublicadas(tenantId: string): Promise<{ localidad: string; cantidad: number }[]> {
  const grupos = await prisma.inmoPropiedad.groupBy({ by: ["localidad"], where: { tenantId, estado: EN_LA_WEB, localidad: { not: "" } }, _count: { _all: true } });
  return grupos.map((g) => ({ localidad: g.localidad, cantidad: g._count._all })).sort((a, b) => b.cantidad - a.cantidad || a.localidad.localeCompare(b.localidad, "es"));
}

/** Números de la portada: cuánto hay publicado de cada cosa. */
export async function numerosPublicos(tenantId: string) {
  const [venta, alquiler] = await Promise.all([
    prisma.inmoPropiedad.count({ where: { tenantId, estado: EN_LA_WEB, enVenta: true } }),
    prisma.inmoPropiedad.count({ where: { tenantId, estado: EN_LA_WEB, enAlquiler: true } }),
  ]);
  return { venta, alquiler };
}

export async function propiedadPublica(tenantId: string, slug: string) {
  if (!/^[a-z0-9-]{3,120}$/.test(slug)) return null;
  const p = await prisma.inmoPropiedad.findFirst({
    where: { tenantId, slug, estado: EN_LA_WEB },
    include: { fotos: { orderBy: [{ posicion: "asc" }, { createdAt: "asc" }], select: { ...SELECT_FOTO_LIVIANA, alt: true } } },
  });
  if (!p) return null;
  const hoy = hoyDia();
  const parecidas = await prisma.inmoPropiedad.findMany({
    where: { tenantId, estado: EN_LA_WEB, id: { not: p.id }, tipo: p.tipo, ...(p.enAlquiler && !p.enVenta ? { enAlquiler: true } : { enVenta: true }) },
    orderBy: [{ localidad: p.localidad ? "asc" : "desc" }, { publicadaEl: { sort: "desc", nulls: "last" } }],
    take: 12,
    select: SELECT_TARJETA,
  });
  // Primero las de la misma localidad.
  const ordenadas = [...parecidas].sort((a, b) => Number(b.localidad === p.localidad) - Number(a.localidad === p.localidad)).slice(0, 3);
  // Las fotos de la ficha y las tapas de las parecidas, con la url leída sólo de las que son un link.
  const srcs = await srcsDeFotos(tenantId, [...p.fotos, ...ordenadas.flatMap((x) => x.fotos)]);
  return {
    id: p.id,
    slug: p.slug,
    codigo: p.codigo,
    titulo: tituloProlijo(p.titulo, [p.localidad, p.barrio]),
    // Párrafo por párrafo, para no perder los saltos de línea.
    descripcion: p.descripcion.split(/\n+/).map((parrafo) => tituloProlijo(parrafo, [p.localidad, p.barrio])).filter(Boolean).join("\n\n"),
    tipo: p.tipo,
    estado: p.estado as EstadoPropiedad,
    enVenta: p.enVenta,
    enAlquiler: p.enAlquiler,
    precioVenta: nN(p.precioVenta),
    monedaVenta: p.monedaVenta,
    precioAlquiler: nN(p.precioAlquiler),
    monedaAlquiler: p.monedaAlquiler,
    expensas: nN(p.expensas),
    aptoCredito: p.aptoCredito,
    aptoMascotas: p.aptoMascotas,
    // El número de puerta sólo sale si el dueño lo permite.
    direccion: p.mostrarDireccion ? p.direccion : "",
    barrio: p.barrio,
    localidad: p.localidad,
    partido: p.partido,
    provincia: p.provincia,
    zona: [p.barrio, p.localidad].filter((v) => v && v.trim()).join(", "),
    lat: p.mostrarDireccion ? p.lat : null,
    lng: p.mostrarDireccion ? p.lng : null,
    ambientes: p.ambientes,
    dormitorios: p.dormitorios,
    banos: p.banos,
    cocheras: p.cocheras,
    supCubierta: p.supCubierta,
    supTotal: p.supTotal,
    antiguedad: p.antiguedad,
    comodidades: p.comodidades,
    videoUrl: p.videoUrl,
    fotos: p.fotos.map((f) => ({ id: f.id, src: srcs.get(f.id) ?? srcDeFoto(f), alt: f.alt })),
    etiquetas: etiquetas({ estado: p.estado, publicadaEl: dia(p.publicadaEl), bajoDePrecioEl: dia(p.bajoDePrecioEl), aptoCredito: p.aptoCredito, enVenta: p.enVenta }, hoy),
    precioAnterior: dia(p.bajoDePrecioEl) ? nN(p.precioAnterior) : null,
    parecidas: ordenadas.map((x) => aTarjeta(x, hoy, srcs)),
  };
}
export type PropiedadPublica = NonNullable<Awaited<ReturnType<typeof propiedadPublica>>>;

/** Los bytes de una foto guardada como data URL (para /propiedades/foto/[id]). */
export async function fotoGuardada(tenantId: string, id: string): Promise<{ tipo: string; bytes: Buffer } | null> {
  if (!/^[a-z0-9]{10,40}$/.test(id)) return null;
  const f = await prisma.inmoFoto.findFirst({ where: { id, tenantId }, select: { url: true } });
  // Sólo formatos de foto: un SVG subido por alguien podría traer código adentro.
  const m = f?.url.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return null;
  return { tipo: m[1], bytes: Buffer.from(m[2], "base64") };
}

/** Todas las fichas publicadas, para el mapa del sitio (sitemap). */
export async function slugsPublicados(tenantId: string): Promise<{ slug: string; cambio: Date }[]> {
  const filas = await prisma.inmoPropiedad.findMany({ where: { tenantId, estado: EN_LA_WEB }, select: { slug: true, updatedAt: true }, take: 2000 });
  return filas.map((f) => ({ slug: f.slug, cambio: f.updatedAt }));
}

// ── Sesión ──────────────────────────────────────────────────────────────────

export const veLaPlata = (u: SessionUser): boolean => roleHasCapability(u.role, "agenda:manage");

/** El agente ve sus consultas y las que todavía no tienen a nadie. */
function consultasDeRol(u: SessionUser): Prisma.InmoConsultaWhereInput {
  return veLaPlata(u) ? {} : { OR: [{ asignadaUserId: u.id }, { asignadaUserId: null }] };
}

// ── Panel: lo de hoy ────────────────────────────────────────────────────────

export interface ConsultaVista {
  id: string;
  tipo: string;
  origen: string;
  estado: EstadoConsulta;
  nombre: string;
  telefono: string;
  email: string;
  mensaje: string;
  propiedad: { id: string; titulo: string; codigo: string; slug: string } | null;
  asignada: string | null;
  asignadaUserId: string | null;
  visitaEl: Date | null;
  notas: string;
  creada: Date;
  /** Minutos esperando la primera respuesta (0 si ya se respondió). */
  esperando: number;
}

const INCLUDE_CONSULTA = { propiedad: { select: { id: true, titulo: true, codigo: true, slug: true, localidad: true, barrio: true } } } satisfies Prisma.InmoConsultaInclude;
type FilaConsulta = Prisma.InmoConsultaGetPayload<{ include: typeof INCLUDE_CONSULTA }>;

function aConsulta(c: FilaConsulta, ahora: Date): ConsultaVista {
  return {
    id: c.id,
    tipo: c.tipo,
    origen: c.origen,
    estado: c.estado as EstadoConsulta,
    nombre: c.nombre,
    telefono: c.telefono,
    email: c.email,
    mensaje: c.mensaje,
    propiedad: c.propiedad ? { id: c.propiedad.id, titulo: tituloProlijo(c.propiedad.titulo, [c.propiedad.localidad, c.propiedad.barrio]), codigo: c.propiedad.codigo, slug: c.propiedad.slug } : null,
    asignada: c.asignadaNombre,
    asignadaUserId: c.asignadaUserId,
    visitaEl: c.visitaEl,
    notas: c.notas ?? "",
    creada: c.createdAt,
    esperando: c.estado === "NUEVA" ? minutosSinResponder(c.createdAt, c.respondidaEl, ahora) : 0,
  };
}

export interface CuotaVista {
  id: string;
  contratoId: string;
  numero: number;
  periodo: Periodo;
  vence: Dia;
  tramo: number;
  alquiler: number;
  ajustePendiente: boolean;
  extras: Extra[];
  punitorios: number;
  pagado: number;
  total: number;
  saldo: number;
  estado: EstadoCuota;
  liquidada: boolean;
  /** true: la mora se perdonó a propósito (no se sugiere ni se cobra). */
  moraPerdonada: boolean;
  mora: { dias: number; monto: number };
}

interface FilaCuota {
  id: string;
  contratoId: string;
  numero: number;
  periodo: string;
  vence: Date;
  tramo: number;
  alquiler: unknown;
  ajustePendiente: boolean;
  extras: unknown;
  punitorios: unknown;
  pagado: unknown;
  anulada: boolean;
  liquidado: unknown;
  moraPerdonada: boolean;
}

function aCuota(c: FilaCuota, hoy: Dia, tasaDiariaPct: number): CuotaVista {
  const calc = { alquiler: n(c.alquiler), extras: leerExtras(c.extras), punitorios: n(c.punitorios), pagado: n(c.pagado), vence: diaDe(c.vence), anulada: c.anulada, moraPerdonada: c.moraPerdonada };
  const estado = estadoCuota(calc, hoy);
  return {
    id: c.id,
    contratoId: c.contratoId,
    numero: c.numero,
    periodo: c.periodo,
    vence: calc.vence,
    tramo: c.tramo,
    alquiler: calc.alquiler,
    ajustePendiente: c.ajustePendiente,
    extras: calc.extras,
    punitorios: calc.punitorios,
    pagado: calc.pagado,
    total: totalCuota(calc),
    saldo: c.anulada ? 0 : saldoCuota(calc),
    estado,
    liquidada: calc.pagado > 0.005 && n(c.liquidado) >= calc.pagado - 0.005,
    moraPerdonada: c.moraPerdonada,
    // La mora se sugiere sólo si todavía no se cargó ninguna en la cuota y no se perdonó
    // (`punitorioSugerido` devuelve 0 con `moraPerdonada`).
    mora: estado === "VENCIDA" || estado === "PARCIAL" ? (calc.punitorios > 0 ? { dias: 0, monto: 0 } : punitorioSugerido(calc, hoy, tasaDiariaPct)) : { dias: 0, monto: 0 },
  };
}

const aContratoCalc = (c: { inicio: Date; fin: Date; montoInicial: unknown; diaVencimiento: number; ajusteIndice: string; ajusteCadaMeses: number; ajusteFijoPct: number | null }): ContratoCalc => ({
  inicio: diaDe(c.inicio),
  fin: diaDe(c.fin),
  montoInicial: n(c.montoInicial),
  diaVencimiento: c.diaVencimiento,
  ajusteIndice: c.ajusteIndice as IndiceAjuste,
  ajusteCadaMeses: c.ajusteCadaMeses,
  ajusteFijoPct: c.ajusteFijoPct,
});

export interface PorCobrar extends CuotaVista {
  contratoNumero: number;
  /** VIGENTE, FINALIZADO o RESCINDIDO: una deuda de un contrato cerrado sigue siendo deuda. */
  contratoEstado: string;
  propiedad: string;
  inquilino: string;
  telefono: string;
  token: string;
}

export interface AvisoDeContrato extends AvisoContrato {
  contratoId: string;
  contratoNumero: number;
  propiedad: string;
  inquilino: string;
}

export async function tableroInmo() {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const conPlata = veLaPlata(user);
  const hoy = hoyDia();
  const ahora = new Date();
  const inicioHoy = new Date(`${hoy}T00:00:00-03:00`);

  const [consultas, visitas, porEstado, abiertas] = await Promise.all([
    prisma.inmoConsulta.findMany({ where: { tenantId, estado: "NUEVA", ...consultasDeRol(user) }, orderBy: { createdAt: "asc" }, take: 30, include: INCLUDE_CONSULTA }),
    prisma.inmoConsulta.findMany({
      where: { tenantId, ...consultasDeRol(user), estado: { in: [...CONSULTA_ABIERTA] as string[] }, visitaEl: { gte: inicioHoy, lt: new Date(inicioHoy.getTime() + 3 * 86_400_000) } },
      orderBy: { visitaEl: "asc" },
      include: INCLUDE_CONSULTA,
    }),
    prisma.inmoPropiedad.groupBy({ by: ["estado"], where: { tenantId }, _count: { _all: true } }),
    prisma.inmoConsulta.count({ where: { tenantId, ...consultasDeRol(user), estado: { in: ["CONTACTADA", "VISITA", "NEGOCIACION"] } } }),
  ]);
  const cartera = Object.fromEntries(porEstado.map((g) => [g.estado, g._count._all])) as Partial<Record<EstadoPropiedad, number>>;

  let porCobrar: PorCobrar[] = [];
  let avisos: AvisoDeContrato[] = [];
  let cobradoMes = 0;
  let liquidacionesPendientes = 0;
  let contratosVigentes = 0;
  if (conPlata) {
    const inicioMes = new Date(`${hoy.slice(0, 7)}-01T00:00:00-03:00`);
    const [cuotas, contratos, pagos, liqs] = await Promise.all([
      prisma.inmoCuota.findMany({
        where: {
          tenantId,
          anulada: false,
          OR: [
            // Del contrato vigente: lo vencido del último año y lo que vence en la semana.
            { contrato: { estado: "VIGENTE" }, vence: { gte: instanteDe(sumarDias(hoy, -400)), lte: instanteDe(sumarDias(hoy, 7)) } },
            // De los contratos cerrados: toda cuota vencida que quedó sin anular. Si quedó sin pagar
            // es una deuda real (cerrar el contrato anula sólo las futuras sin cobrar). El saldo se
            // filtra abajo: una cuota vieja pagada no viene.
            { contrato: { estado: { in: ["FINALIZADO", "RESCINDIDO"] } }, vence: { lt: instanteDe(hoy) } },
          ],
        },
        orderBy: { vence: "asc" },
        include: {
          contrato: {
            select: { numero: true, estado: true, punitorioDiarioPct: true, tokenInquilino: true, propiedad: { select: { titulo: true, direccion: true, localidad: true, barrio: true } }, inquilino: { select: { name: true, phone: true } } },
          },
        },
      }),
      prisma.inmoContrato.findMany({
        where: { tenantId, estado: "VIGENTE" },
        select: {
          id: true, numero: true, inicio: true, fin: true, montoInicial: true, diaVencimiento: true, ajusteIndice: true, ajusteCadaMeses: true, ajusteFijoPct: true, tramosAplicados: true,
          propiedad: { select: { titulo: true, direccion: true, localidad: true, barrio: true } },
          inquilino: { select: { name: true } },
        },
      }),
      prisma.inmoPago.aggregate({ where: { tenantId, anuladoEl: null, createdAt: { gte: inicioMes } }, _sum: { monto: true } }),
      prisma.inmoLiquidacion.count({ where: { tenantId, estado: "EMITIDA" } }),
    ]);
    porCobrar = cuotas
      .map((c) => ({
        ...aCuota(c, hoy, c.contrato.punitorioDiarioPct),
        contratoNumero: c.contrato.numero,
        contratoEstado: c.contrato.estado,
        propiedad: c.contrato.propiedad.direccion || tituloProlijo(c.contrato.propiedad.titulo, [c.contrato.propiedad.localidad, c.contrato.propiedad.barrio]),
        inquilino: c.contrato.inquilino.name,
        telefono: c.contrato.inquilino.phone,
        token: c.contrato.tokenInquilino,
      }))
      .filter((c) => c.saldo > 0.005);
    avisos = contratos
      .flatMap((c) =>
        avisosDeContrato(aContratoCalc(c), c.tramosAplicados, hoy).map((a) => ({
          ...a,
          contratoId: c.id,
          contratoNumero: c.numero,
          propiedad: c.propiedad.direccion || tituloProlijo(c.propiedad.titulo, [c.propiedad.localidad, c.propiedad.barrio]),
          inquilino: c.inquilino.name,
        })),
      )
      .sort((a, b) => a.faltan - b.faltan);
    cobradoMes = n(pagos._sum.monto);
    liquidacionesPendientes = liqs;
    contratosVigentes = contratos.length;
  }

  return {
    conPlata,
    esDuenio: roleHasCapability(user.role, "users:manage"),
    hoy,
    consultas: consultas.map((c) => aConsulta(c, ahora)),
    visitas: visitas.map((c) => aConsulta(c, ahora)),
    consultasEnCurso: abiertas,
    cartera,
    vencidas: porCobrar.filter((c) => c.vence < hoy),
    porVencer: porCobrar.filter((c) => c.vence >= hoy),
    avisos,
    cobradoMes,
    liquidacionesPendientes,
    contratosVigentes,
  };
}

// ── Panel: propiedades ──────────────────────────────────────────────────────

export interface FilaPropiedad extends TarjetaPropiedad {
  direccion: string;
  propietario: string | null;
  consultas: number;
  puntaje: number;
  bloqueos: number;
}

const SELECT_FILA = {
  ...SELECT_TARJETA,
  direccion: true, descripcion: true, lat: true, lng: true,
  propietario: { select: { name: true } },
  _count: { select: { fotos: true, consultas: true } },
} satisfies Prisma.InmoPropiedadSelect;

export async function listaPropiedades(filtro: { estado?: string; texto?: string }): Promise<FilaPropiedad[]> {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const texto = (filtro.texto ?? "").trim().slice(0, 80);
  const contiene = { contains: texto, mode: "insensitive" as const };
  const filas = await prisma.inmoPropiedad.findMany({
    where: {
      tenantId,
      ...(filtro.estado ? { estado: filtro.estado } : {}),
      ...(texto ? { OR: [{ titulo: contiene }, { codigo: contiene }, { direccion: contiene }, { localidad: contiene }, { barrio: contiene }] } : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 300,
    select: SELECT_FILA,
  });
  const hoy = hoyDia();
  const tapas = await tapasDe(tenantId, filas);
  return filas.map((p) => {
    const r = revisarFicha({
      titulo: p.titulo, descripcion: p.descripcion, localidad: p.localidad, direccion: p.direccion, enVenta: p.enVenta, enAlquiler: p.enAlquiler,
      precioVenta: nN(p.precioVenta), precioAlquiler: nN(p.precioAlquiler), tipo: p.tipo, ambientes: p.ambientes, supCubierta: p.supCubierta, supTotal: p.supTotal,
      fotos: p._count.fotos, lat: p.lat, lng: p.lng,
    });
    return { ...aTarjeta(p, hoy, tapas), direccion: p.direccion, propietario: p.propietario?.name ?? null, consultas: p._count.consultas, puntaje: r.puntaje, bloqueos: r.bloqueos.length };
  });
}

export async function propiedadAdmin(id: string) {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const p = await prisma.inmoPropiedad.findFirst({
    where: { id, tenantId },
    include: {
      fotos: { orderBy: [{ posicion: "asc" }, { createdAt: "asc" }], select: { ...SELECT_FOTO_LIVIANA, alt: true } },
      propietario: { select: { id: true, name: true, phone: true } },
      _count: { select: { consultas: true, contratos: true } },
    },
  });
  if (!p) return null;
  const srcs = await srcsDeFotos(tenantId, p.fotos);
  const revision: RevisionFicha = revisarFicha({
    titulo: p.titulo, descripcion: p.descripcion, localidad: p.localidad, direccion: p.direccion, enVenta: p.enVenta, enAlquiler: p.enAlquiler,
    precioVenta: nN(p.precioVenta), precioAlquiler: nN(p.precioAlquiler), tipo: p.tipo, ambientes: p.ambientes, supCubierta: p.supCubierta, supTotal: p.supTotal,
    fotos: p.fotos.length, lat: p.lat, lng: p.lng,
  });
  return {
    conPlata: veLaPlata(user),
    id: p.id, codigo: p.codigo, slug: p.slug, titulo: p.titulo, descripcion: p.descripcion, tipo: p.tipo, estado: p.estado as EstadoPropiedad, destacada: p.destacada,
    enVenta: p.enVenta, precioVenta: nN(p.precioVenta), monedaVenta: p.monedaVenta,
    enAlquiler: p.enAlquiler, precioAlquiler: nN(p.precioAlquiler), monedaAlquiler: p.monedaAlquiler,
    expensas: nN(p.expensas), aptoCredito: p.aptoCredito, aptoMascotas: p.aptoMascotas,
    direccion: p.direccion, mostrarDireccion: p.mostrarDireccion, barrio: p.barrio, localidad: p.localidad, partido: p.partido, provincia: p.provincia,
    lat: p.lat, lng: p.lng, ambientes: p.ambientes, dormitorios: p.dormitorios, banos: p.banos, cocheras: p.cocheras,
    supCubierta: p.supCubierta, supTotal: p.supTotal, antiguedad: p.antiguedad, comodidades: p.comodidades, videoUrl: p.videoUrl ?? "",
    notasInternas: p.notasInternas ?? "",
    propietario: p.propietario,
    fotos: p.fotos.map((f) => ({ id: f.id, src: srcs.get(f.id) ?? srcDeFoto(f), alt: f.alt })),
    consultas: p._count.consultas,
    contratos: p._count.contratos,
    revision,
    tituloSugerido: tituloProlijo(p.titulo, [p.localidad, p.barrio]),
  };
}
export type PropiedadAdmin = NonNullable<Awaited<ReturnType<typeof propiedadAdmin>>>;

/** Las personas del negocio, para elegir propietario o inquilino. */
export async function personas(): Promise<{ id: string; nombre: string; telefono: string }[]> {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const filas = await prisma.client.findMany({ where: { tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true }, take: 1000 });
  return filas.map((c) => ({ id: c.id, nombre: c.name, telefono: c.phone }));
}

/** El equipo que puede atender consultas. */
export async function equipo(): Promise<{ id: string; nombre: string }[]> {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const filas = await prisma.user.findMany({ where: { tenantId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return filas.map((u) => ({ id: u.id, nombre: u.name }));
}

// ── Panel: consultas ────────────────────────────────────────────────────────

export async function listaConsultas(filtro: { estado?: string }) {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const ahora = new Date();
  const filas = await prisma.inmoConsulta.findMany({
    where: { tenantId, ...consultasDeRol(user), ...(filtro.estado ? { estado: filtro.estado } : { estado: { in: [...CONSULTA_ABIERTA] as string[] } }) },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    include: INCLUDE_CONSULTA,
  });
  const cuenta = await prisma.inmoConsulta.groupBy({ by: ["estado"], where: { tenantId, ...consultasDeRol(user) }, _count: { _all: true } });
  return {
    usuario: { id: user.id, nombre: user.name },
    consultas: filas.map((c) => aConsulta(c, ahora)),
    porEstado: Object.fromEntries(cuenta.map((g) => [g.estado, g._count._all])) as Partial<Record<EstadoConsulta, number>>,
  };
}

// ── Panel: alquileres ───────────────────────────────────────────────────────

export interface FilaContrato {
  id: string;
  numero: number;
  estado: string;
  propiedad: string;
  inquilino: string;
  propietario: string;
  inicio: Dia;
  fin: Dia;
  alquilerVigente: number;
  indice: string;
  cadaMeses: number;
  debe: number;
  cuotasVencidas: number;
  avisos: AvisoContrato[];
}

export async function listaContratos(): Promise<FilaContrato[]> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const hoy = hoyDia();
  const filas = await prisma.inmoContrato.findMany({
    where: { tenantId },
    orderBy: [{ estado: "desc" }, { numero: "desc" }],
    include: {
      propiedad: { select: { titulo: true, direccion: true, localidad: true, barrio: true } },
      inquilino: { select: { name: true } },
      propietario: { select: { name: true } },
      cuotas: { where: { anulada: false }, orderBy: { numero: "asc" } },
    },
  });
  return filas.map((c) => {
    const cuotas = c.cuotas.map((q) => aCuota(q, hoy, c.punitorioDiarioPct));
    const vencidas = cuotas.filter((q) => q.saldo > 0.005 && q.vence < hoy);
    const vigente = cuotas.find((q) => q.periodo === hoy.slice(0, 7)) ?? cuotas.filter((q) => q.periodo <= hoy.slice(0, 7)).at(-1) ?? cuotas[0];
    return {
      id: c.id,
      numero: c.numero,
      estado: c.estado,
      propiedad: c.propiedad.direccion || tituloProlijo(c.propiedad.titulo, [c.propiedad.localidad, c.propiedad.barrio]),
      inquilino: c.inquilino.name,
      propietario: c.propietario.name,
      inicio: diaDe(c.inicio),
      fin: diaDe(c.fin),
      alquilerVigente: vigente?.alquiler ?? n(c.montoInicial),
      indice: c.ajusteIndice,
      cadaMeses: c.ajusteCadaMeses,
      debe: redondear(vencidas.reduce((s, q) => s + q.saldo, 0)),
      cuotasVencidas: vencidas.length,
      avisos: c.estado === "VIGENTE" ? avisosDeContrato(aContratoCalc(c), c.tramosAplicados, hoy) : [],
    };
  });
}

async function serieDe(tenantId: string, indice: string): Promise<PuntoIndice[]> {
  const filas = await prisma.inmoIndice.findMany({ where: { tenantId, indice }, orderBy: { fecha: "asc" }, select: { fecha: true, valor: true } });
  return filas.map((f) => ({ fecha: diaDe(f.fecha), valor: f.valor }));
}

export async function contratoAdmin(id: string) {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const hoy = hoyDia();
  const c = await prisma.inmoContrato.findFirst({
    where: { id, tenantId },
    include: {
      propiedad: { select: { id: true, titulo: true, direccion: true, localidad: true, barrio: true, codigo: true } },
      inquilino: { select: { id: true, name: true, phone: true } },
      propietario: { select: { id: true, name: true, phone: true } },
      cuotas: { orderBy: { numero: "asc" }, include: { pagos: { orderBy: { createdAt: "asc" } } } },
      ajustes: { orderBy: { tramo: "asc" } },
    },
  });
  if (!c) return null;
  const calc = aContratoCalc(c);
  const cuotas = c.cuotas.map((q) => ({
    ...aCuota(q, hoy, c.punitorioDiarioPct),
    pagos: q.pagos.map((p) => ({ id: p.id, medio: p.medio, monto: n(p.monto), nota: p.nota ?? "", cobradoPor: p.cobradoPor ?? "", fecha: diaDe(p.createdAt), anulado: !!p.anuladoEl, recibo: p.reciboNumero })),
  }));
  // El próximo ajuste por aplicar, ya calculado si el índice está cargado.
  const meses = mesesDelContrato(calc.inicio, calc.fin);
  const ultimoTramo = meses > 0 ? tramoDe(meses - 1, calc) : 0;
  const proximo = c.tramosAplicados + 1;
  let ajuste: { tramo: number; dia: Dia; vigente: number; resultado: ResultadoAjuste } | null = null;
  if (c.estado === "VIGENTE" && proximo <= ultimoTramo && c.ajusteIndice !== "FIJO" && c.ajusteIndice !== "SIN_AJUSTE") {
    const vigente = n(c.ajustes.at(-1)?.montoNuevo ?? c.montoInicial);
    const serie = usaSerie(calc.ajusteIndice) ? await serieDe(tenantId, c.ajusteIndice) : [];
    ajuste = { tramo: proximo, dia: inicioDeTramo(calc, proximo), vigente, resultado: calcularAjuste(calc, proximo, vigente, serie) };
  }
  return {
    id: c.id,
    numero: c.numero,
    estado: c.estado,
    calc,
    moneda: c.moneda,
    comisionPct: c.comisionPct,
    punitorioDiarioPct: c.punitorioDiarioPct,
    deposito: n(c.deposito),
    garantia: c.garantia ?? "",
    notas: c.notas ?? "",
    token: c.tokenInquilino,
    tramosAplicados: c.tramosAplicados,
    propiedad: { id: c.propiedad.id, codigo: c.propiedad.codigo, nombre: c.propiedad.direccion || tituloProlijo(c.propiedad.titulo, [c.propiedad.localidad, c.propiedad.barrio]) },
    inquilino: { id: c.inquilino.id, nombre: c.inquilino.name, telefono: c.inquilino.phone },
    propietario: { id: c.propietario.id, nombre: c.propietario.name, telefono: c.propietario.phone },
    cuotas,
    ajustes: c.ajustes.map((a) => ({ tramo: a.tramo, desde: diaDe(a.desde), indice: a.indice, coeficiente: a.coeficiente, montoAnterior: n(a.montoAnterior), montoNuevo: n(a.montoNuevo), detalle: a.detalle, aplicadoPor: a.aplicadoPor ?? "" })),
    ajuste,
    avisos: c.estado === "VIGENTE" ? avisosDeContrato(calc, c.tramosAplicados, hoy) : [],
    debe: redondear(cuotas.filter((q) => q.vence < hoy).reduce((s, q) => s + q.saldo, 0)),
  };
}
export type ContratoAdmin = NonNullable<Awaited<ReturnType<typeof contratoAdmin>>>;

/** Propiedades que se pueden poner en un contrato (las que no están ya con uno vigente). */
export async function propiedadesParaContrato(): Promise<{ id: string; nombre: string; propietarioId: string | null; precio: number | null }[]> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const filas = await prisma.inmoPropiedad.findMany({
    where: { tenantId, contratos: { none: { estado: "VIGENTE" } }, estado: { not: "VENDIDA" } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, codigo: true, titulo: true, direccion: true, localidad: true, barrio: true, propietarioId: true, precioAlquiler: true },
    take: 500,
  });
  return filas.map((p) => ({ id: p.id, nombre: `${p.codigo} · ${p.direccion || tituloProlijo(p.titulo, [p.localidad, p.barrio])}`, propietarioId: p.propietarioId, precio: nN(p.precioAlquiler) }));
}

// ── Panel: índices ──────────────────────────────────────────────────────────

export async function indicesCargados() {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  // Los últimos de cada índice y cuántos hay: el ICL es diario y taparía a los otros.
  return Promise.all(
    ["ICL", "IPC", "CASA_PROPIA"].map(async (indice) => ({
      indice,
      total: await prisma.inmoIndice.count({ where: { tenantId, indice } }),
      ultimos: (await prisma.inmoIndice.findMany({ where: { tenantId, indice }, orderBy: { fecha: "desc" }, take: 4 })).map((f) => ({ id: f.id, fecha: diaDe(f.fecha), valor: f.valor })),
    })),
  );
}

// ── Panel: liquidaciones ────────────────────────────────────────────────────

export interface ParaLiquidar {
  propietarioId: string;
  propietario: string;
  telefono: string;
  cobros: CobroPendiente[];
  /** Con la comisión de cada contrato y las reglas del negocio, sin gastos. */
  previa: Liquidacion;
}

export type CobroPendiente = CobroALiquidar & { cuotaId: string; comisionPct: number };

/** Una cuota tal como se la leyó para liquidar: lo que la liquidación compara antes de marcarla. */
export interface CuotaLeidaParaLiquidar {
  pagado: number;
  alquiler: number;
  punitorios: number;
  /** Total liquidado antes (columna `liquidado`). */
  liquidadoAntes: number;
  /** Lo liquidado antes por rubro, ya reparado si la cuota venía de antes de las columnas por rubro. */
  liquidadoPorRubro: PorRubro;
  /** Cambia con cualquier escritura sobre la cuota (extras, mora, cobros): la foto de lo leído. */
  updatedAt: Date;
}

/**
 * Lo cobrado de las cuotas que todavía no se le liquidó al propietario, renglón por renglón.
 * De cada cuota entra, RUBRO POR RUBRO, lo cobrado imputado hoy menos lo ya liquidado de ese
 * rubro (`pendienteDeLiquidar`): si después de liquidar en parte se le sumaron expensas o mora,
 * lo nuevo entra como expensas o mora y no como alquiler (que paga comisión). La foto de la
 * cuota leída viaja con cada renglón para que quien liquide compruebe que nadie la tocó.
 */
export async function cobrosSinLiquidar(tenantId: string, propietarioId?: string) {
  const cuotas = await prisma.inmoCuota.findMany({
    where: { tenantId, anulada: false, pagado: { gt: 0 }, ...(propietarioId ? { contrato: { propietarioId } } : {}) },
    orderBy: [{ periodo: "asc" }],
    include: {
      contrato: {
        select: { comisionPct: true, propietarioId: true, propietario: { select: { name: true, phone: true } }, propiedad: { select: { titulo: true, direccion: true, localidad: true, barrio: true } } },
      },
    },
  });
  const out: { propietarioId: string; propietario: string; telefono: string; leida: CuotaLeidaParaLiquidar; cobro: CobroPendiente }[] = [];
  for (const q of cuotas) {
    const pagado = n(q.pagado);
    const liquidado = n(q.liquidado);
    if (pagado - liquidado <= 0.005) continue;
    const cuota = { alquiler: n(q.alquiler), extras: leerExtras(q.extras), punitorios: n(q.punitorios) };
    const yaLiquidado = repartoLiquidado(cuota, liquidado, { alquiler: n(q.liquidadoAlquiler), extras: n(q.liquidadoExtras), punitorios: n(q.liquidadoPunitorios) });
    const pendiente = pendienteDeLiquidar(cuota, pagado, yaLiquidado);
    if (pendiente.alquiler + pendiente.extras + pendiente.punitorios <= 0.005) continue;
    const lugar = q.contrato.propiedad.direccion || tituloProlijo(q.contrato.propiedad.titulo, [q.contrato.propiedad.localidad, q.contrato.propiedad.barrio]);
    out.push({
      propietarioId: q.contrato.propietarioId,
      propietario: q.contrato.propietario.name,
      telefono: q.contrato.propietario.phone,
      leida: { pagado, alquiler: cuota.alquiler, punitorios: cuota.punitorios, liquidadoAntes: liquidado, liquidadoPorRubro: yaLiquidado, updatedAt: q.updatedAt },
      cobro: {
        cuotaId: q.id,
        concepto: `${lugar} · ${q.periodo}`,
        alquiler: pendiente.alquiler,
        extras: pendiente.extras,
        punitorios: pendiente.punitorios,
        comisionPct: q.contrato.comisionPct,
      },
    });
  }
  return out;
}

/** Lo que hay para liquidar hoy, agrupado por propietario. La comisión es la de cada contrato. */
export async function paraLiquidar(): Promise<ParaLiquidar[]> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const [config, pendientes] = await Promise.all([configInmo(tenantId), cobrosSinLiquidar(tenantId)]);
  const porDuenio = new Map<string, { propietario: string; telefono: string; cobros: CobroPendiente[] }>();
  for (const p of pendientes) {
    const g = porDuenio.get(p.propietarioId) ?? { propietario: p.propietario, telefono: p.telefono, cobros: [] };
    g.cobros.push(p.cobro);
    porDuenio.set(p.propietarioId, g);
  }
  return [...porDuenio.entries()].map(([propietarioId, g]) => ({
    propietarioId,
    propietario: g.propietario,
    telefono: g.telefono,
    cobros: g.cobros,
    previa: liquidarPorContrato(g.cobros, [], config),
  }));
}

export interface LiquidacionVista {
  id: string;
  numero: number;
  propietario: string;
  telefono: string;
  periodo: Periodo;
  estado: string;
  totales: Liquidacion;
  cobros: CobroALiquidar[];
  gastos: Extra[];
  token: string;
  emitida: Dia;
  pagadaEl: Dia | null;
  medio: string;
  nota: string;
}

interface FilaLiquidacion {
  id: string; numero: number; periodo: string; estado: string; alquileres: unknown; extras: unknown; punitorios: unknown; comision: unknown; ivaComision: unknown;
  gastos: unknown; neto: unknown; detalle: unknown; token: string; pagadaEl: Date | null; medio: string | null; nota: string | null; createdAt: Date;
  propietario: { name: string; phone: string };
}

function aLiquidacion(l: FilaLiquidacion): LiquidacionVista {
  const d = (l.detalle ?? {}) as { cobros?: unknown; gastos?: unknown };
  const cobros = Array.isArray(d.cobros)
    ? (d.cobros as CobroALiquidar[]).map((c) => ({ concepto: String(c.concepto ?? ""), alquiler: Number(c.alquiler) || 0, extras: Number(c.extras) || 0, punitorios: Number(c.punitorios) || 0 }))
    : [];
  const alquileres = n(l.alquileres);
  const extras = n(l.extras);
  const punitorios = n(l.punitorios);
  return {
    id: l.id,
    numero: l.numero,
    propietario: l.propietario.name,
    telefono: l.propietario.phone,
    periodo: l.periodo,
    estado: l.estado,
    totales: { alquileres, extras, punitorios, cobrado: redondear(alquileres + extras + punitorios), comision: n(l.comision), ivaComision: n(l.ivaComision), gastos: n(l.gastos), neto: n(l.neto) },
    cobros,
    gastos: leerExtras(d.gastos),
    token: l.token,
    emitida: diaDe(l.createdAt),
    pagadaEl: dia(l.pagadaEl),
    medio: l.medio ?? "",
    nota: l.nota ?? "",
  };
}

export async function listaLiquidaciones(): Promise<LiquidacionVista[]> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const filas = await prisma.inmoLiquidacion.findMany({ where: { tenantId }, orderBy: { numero: "desc" }, take: 200, include: { propietario: { select: { name: true, phone: true } } } });
  return filas.map(aLiquidacion);
}

// ── Links sin login: la llave es el token ───────────────────────────────────

const TOKEN = /^[A-Za-z0-9_-]{20,}$/;

/** El estado de cuenta que ve el inquilino desde su link. */
export async function cuentaDelInquilino(token: string) {
  if (!TOKEN.test(token)) return null;
  const tenantId = await getCurrentTenantId();
  const c = await prisma.inmoContrato.findFirst({
    where: { tenantId, tokenInquilino: token },
    include: {
      propiedad: { select: { titulo: true, direccion: true, localidad: true, barrio: true } },
      inquilino: { select: { name: true } },
      cuotas: { where: { anulada: false }, orderBy: { numero: "asc" }, include: { pagos: { where: { anuladoEl: null }, orderBy: { createdAt: "asc" } } } },
      ajustes: { orderBy: { tramo: "asc" } },
    },
  });
  if (!c) return null;
  const hoy = hoyDia();
  const [config, negocio] = await Promise.all([configInmo(tenantId), negocioInmo(tenantId)]);
  const calc = aContratoCalc(c);
  const cuotas = c.cuotas.map((q) => ({
    ...aCuota(q, hoy, c.punitorioDiarioPct),
    pagos: q.pagos.map((p) => ({ id: p.id, medio: p.medio, monto: n(p.monto), fecha: diaDe(p.createdAt), recibo: p.reciboNumero })),
  }));
  // Lo que le importa hoy: lo vencido, lo de este mes y la próxima. El resto del cronograma no.
  const mes = hoy.slice(0, 7);
  return {
    negocio,
    aliasCbu: config.aliasCbu,
    linkMercadoPago: config.linkMercadoPago,
    numero: c.numero,
    estado: c.estado,
    inquilino: c.inquilino.name,
    propiedad: c.propiedad.direccion || tituloProlijo(c.propiedad.titulo, [c.propiedad.localidad, c.propiedad.barrio]),
    inicio: calc.inicio,
    fin: calc.fin,
    indice: calc.ajusteIndice,
    cadaMeses: calc.ajusteCadaMeses,
    pendientes: cuotas.filter((q) => q.saldo > 0.005 && q.periodo <= mes),
    proxima: cuotas.find((q) => q.periodo > mes) ?? null,
    pagadas: cuotas.filter((q) => q.estado === "PAGADA").slice(-6).reverse(),
    ajustes: c.ajustes.map((a) => ({ desde: diaDe(a.desde), indice: a.indice, coeficiente: a.coeficiente, montoNuevo: n(a.montoNuevo) })),
    proximoAjuste: avisosDeContrato(calc, c.tramosAplicados, sumarDias(hoy, 0)).find((a) => a.tipo === "ajuste") ?? null,
  };
}

/** La liquidación que ve el propietario desde su link. */
export async function liquidacionPublica(token: string) {
  if (!TOKEN.test(token)) return null;
  const tenantId = await getCurrentTenantId();
  const l = await prisma.inmoLiquidacion.findFirst({ where: { tenantId, token, estado: { not: "ANULADA" } }, include: { propietario: { select: { name: true, phone: true } } } });
  if (!l) return null;
  return { negocio: await negocioInmo(tenantId), liquidacion: aLiquidacion(l) };
}

// ── Recibos ─────────────────────────────────────────────────────────────────

export interface ReciboDatos {
  numero: string;
  fecha: Dia;
  anulado: boolean;
  config: ReciboConfig;
  negocio: NegocioInmo;
  /** Quién emite (la configuración o el nombre del negocio). */
  emisor: string;
  matricula: string;
  inquilino: string;
  propiedad: string;
  periodo: Periodo;
  contratoNumero: number;
  medio: string;
  monto: number;
  nota: string;
  cobradoPor: string;
  /** La cuota como quedó: su detalle, lo cobrado hasta este recibo y el saldo después. */
  cuota: { alquiler: number; extras: Extra[]; punitorios: number; total: number; cobradoHasta: number; saldoDespues: number };
  /** Link público del recibo (para el QR, el WhatsApp y el botón de copiar). */
  link: string;
}

const INCLUDE_RECIBO = {
  cuota: {
    include: {
      pagos: { orderBy: { createdAt: "asc" as const }, select: { id: true, monto: true, anuladoEl: true } },
      contrato: {
        select: {
          numero: true,
          tokenInquilino: true,
          inquilino: { select: { name: true } },
          propiedad: { select: { titulo: true, direccion: true, localidad: true, barrio: true } },
        },
      },
    },
  },
} satisfies Prisma.InmoPagoInclude;

type FilaRecibo = Prisma.InmoPagoGetPayload<{ include: typeof INCLUDE_RECIBO }>;

async function armarRecibo(tenantId: string, p: FilaRecibo, origen: string): Promise<ReciboDatos> {
  const [config, negocio] = await Promise.all([configInmo(tenantId), negocioInmo(tenantId)]);
  const q = p.cuota;
  const extras = leerExtras(q.extras);
  const total = totalCuota({ alquiler: n(q.alquiler), extras, punitorios: n(q.punitorios) });
  // Lo cobrado hasta este recibo inclusive (sin los anulados), en orden de fecha.
  let cobradoHasta = 0;
  for (const x of q.pagos) {
    if (x.anuladoEl) continue;
    cobradoHasta = redondear(cobradoHasta + n(x.monto));
    if (x.id === p.id) break;
  }
  const propiedad = q.contrato.propiedad.direccion || tituloProlijo(q.contrato.propiedad.titulo, [q.contrato.propiedad.localidad, q.contrato.propiedad.barrio]);
  return {
    numero: numeroDeRecibo(config.recibo.prefijo, p.reciboNumero),
    fecha: diaDe(p.createdAt),
    anulado: !!p.anuladoEl,
    config: config.recibo,
    negocio,
    emisor: config.recibo.emisor.trim() || negocio.nombre,
    matricula: config.matricula,
    inquilino: q.contrato.inquilino.name,
    propiedad,
    periodo: q.periodo,
    contratoNumero: q.contrato.numero,
    medio: p.medio,
    monto: n(p.monto),
    nota: p.nota ?? "",
    cobradoPor: p.cobradoPor ?? "",
    cuota: { alquiler: n(q.alquiler), extras, punitorios: n(q.punitorios), total, cobradoHasta, saldoDespues: Math.max(0, redondear(total - cobradoHasta)) },
    link: `${origen}/alquiler/${q.contrato.tokenInquilino}/recibo/${p.id}`,
  };
}

/** El recibo de un cobro, para el panel. */
export async function reciboAdmin(pagoId: string, origen: string): Promise<ReciboDatos | null> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  if (!/^[a-z0-9]{10,40}$/.test(pagoId)) return null;
  const p = await prisma.inmoPago.findFirst({ where: { id: pagoId, tenantId }, include: INCLUDE_RECIBO });
  return p ? armarRecibo(tenantId, p, origen) : null;
}

/** El recibo desde el link del inquilino: la llave es el token del contrato, y el cobro tiene que ser de ese contrato. */
export async function reciboPublico(token: string, pagoId: string, origen: string): Promise<ReciboDatos | null> {
  if (!TOKEN.test(token) || !/^[a-z0-9]{10,40}$/.test(pagoId)) return null;
  const tenantId = await getCurrentTenantId();
  const p = await prisma.inmoPago.findFirst({ where: { id: pagoId, tenantId, anuladoEl: null, cuota: { contrato: { tokenInquilino: token } } }, include: INCLUDE_RECIBO });
  return p ? armarRecibo(tenantId, p, origen) : null;
}

/** Un recibo de muestra con la configuración actual, para la vista previa del configurador. */
export async function reciboDeMuestra(origen: string): Promise<ReciboDatos> {
  await requireCapability("users:manage");
  const tenantId = await getCurrentTenantId();
  const ultimo = await prisma.inmoPago.findFirst({ where: { tenantId, anuladoEl: null }, orderBy: { createdAt: "desc" }, include: INCLUDE_RECIBO });
  if (ultimo) return armarRecibo(tenantId, ultimo, origen);
  const [config, negocio] = await Promise.all([configInmo(tenantId), negocioInmo(tenantId)]);
  const extras = [{ concepto: "Expensas", monto: 35000 }];
  return {
    numero: numeroDeRecibo(config.recibo.prefijo, 1),
    fecha: hoyDia(),
    anulado: false,
    config: config.recibo,
    negocio,
    emisor: config.recibo.emisor.trim() || negocio.nombre,
    matricula: config.matricula,
    inquilino: "Inquilino de ejemplo",
    propiedad: "Calle de ejemplo 123, 2º A",
    periodo: hoyDia().slice(0, 7),
    contratoNumero: 1,
    medio: "TRANSFERENCIA",
    monto: 515000,
    nota: "",
    cobradoPor: "",
    cuota: { alquiler: 480000, extras, punitorios: 0, total: 515000, cobradoHasta: 515000, saldoDespues: 0 },
    link: `${origen}/alquiler/ejemplo/recibo/ejemplo`,
  };
}
