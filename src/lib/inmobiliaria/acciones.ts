"use server";

// ============================================================================
// INMOBILIARIA — escrituras. Cada acción vuelve a pedir el permiso y acota por negocio:
// esconder un botón no protege nada. Cargar fichas y atender consultas pide agenda:read
// (también el agente); la plata —contratos, cobros, ajustes, liquidaciones, índices—
// agenda:manage (dueño y administrativo); la configuración, users:manage (sólo el dueño).
// La única escritura pública es `enviarConsulta` (el formulario del sitio).
// La plata se escribe como texto con dos decimales (ADR-100 §4): la base nunca redondea.
// ============================================================================

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { auditAdmin, auditPublic } from "@/lib/audit-core";
import type { SessionUser } from "@/lib/session";
import { createRateLimiter } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { sitioInmo } from "./sitio.server";
import { horarioDeNegocioDelFormulario } from "@/lib/datetime";
import { importeONaN } from "@/lib/dinero/leer";
import { textoAlCentavo } from "@/lib/dinero/redondeo";
import {
  alquilerCobrado,
  calcularAjuste,
  CLAVES_PLANTILLA,
  diaCorto,
  diaDe,
  esDia,
  esEstadoConsulta,
  esEstadoPropiedad,
  esIndice,
  esMedio,
  esMoneda,
  esOrigen,
  esTipo,
  esTipoConsulta,
  ESTADOS_EN_LA_WEB,
  FUENTE_ICL,
  FUENTE_IPC,
  inicioDeTramo,
  instanteDe,
  leerRespuestaBcra,
  leerRespuestaDatosGobAr,
  liquidarPorContrato,
  mesesDelContrato,
  pesos,
  planDeCuotas,
  punitorioSugerido,
  quitarExtraDe,
  redondear,
  revisarFicha,
  saldoCuota,
  siguienteCodigo,
  slugDePropiedad,
  sumaExtras,
  sumarDias,
  tituloProlijo,
  tituloSugerido,
  tramoDe,
  usaSerie,
  validarConsulta,
  type ContratoCalc,
  type Dia,
  type IndiceAjuste,
  type PuntoIndice,
} from "./core";
import { cobrosSinLiquidar, configInmo, hoyDia, leerExtras, veLaPlata } from "./datos.server";

export type Resultado<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const RAIZ = "/admin/inmobiliaria";
const MAX_FOTOS = 20;
const MAX_FOTO = 400_000; // caracteres del data URL (~300 KB de imagen)

const txt = (v: FormDataEntryValue | null | undefined): string => String(v ?? "").trim();
const si = (v: FormDataEntryValue | null | undefined): boolean => v === "on" || v === "1" || v === "true";
const entero = (v: FormDataEntryValue | null | undefined): number | null => {
  const s = txt(v);
  return /^\d{1,9}$/.test(s) ? Number(s) : null;
};
/** Un número que no es plata (metros, porcentaje, coordenada): acepta coma o punto. */
const decimal = (v: FormDataEntryValue | null | undefined): number | null => {
  const s = txt(v).replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};
/** Plata de un formulario ("12.500" se lee 12500). Null si vino vacío o no es un importe. */
const importe = (v: FormDataEntryValue | null | undefined): number | null => {
  const x = importeONaN(v);
  return Number.isFinite(x) && x >= 0 && x < TOPE_IMPORTE ? x : null;
};
const plata = (x: number): string => textoAlCentavo(x);
const plataONada = (x: number | null): string | null => (x != null && x > 0 ? plata(x) : null);
const n = (v: unknown): number => (v == null ? 0 : Number(v));
const diaCampo = (v: FormDataEntryValue | null | undefined): Dia | null => {
  const s = txt(v);
  return esDia(s) ? s : null;
};
const pct = (v: FormDataEntryValue | null | undefined, tope: number): number => Math.max(0, Math.min(tope, decimal(v) ?? 0));
const llave = (): string => randomBytes(18).toString("base64url");
const repetido = (e: unknown): boolean => (e as { code?: string }).code === "P2002";
/** Para lo que lee un saldo y lo reescribe: que dos a la vez no partan del mismo número. */
const SERIAL = { isolationLevel: "Serializable" as const };
/** Un importe más grande que esto no es un precio ni un alquiler: es un error de tipeo. */
const TOPE_IMPORTE = 1e11;
/** Consultas del sitio: hasta 6 cada 10 minutos por conexión. */
const frenoDeConsultas = createRateLimiter({ max: 6, windowMs: 10 * 60 * 1000 });
/** Objetos planos de textos y números, tal como los guarda una columna JSON. */
const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

function refrescar(...rutas: string[]) {
  revalidatePath(RAIZ);
  for (const r of rutas) revalidatePath(r);
}

/** Que el cliente (propietario, inquilino) sea de este negocio. */
async function personaDelNegocio(tenantId: string, id: string): Promise<string | null> {
  if (!id) return null;
  const c = await prisma.client.findFirst({ where: { id, tenantId }, select: { id: true } });
  return c?.id ?? null;
}

// ── Propiedades ─────────────────────────────────────────────────────────────

export async function guardarPropiedad(formData: FormData): Promise<Resultado<{ id: string }>> {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));

  const tipo = txt(formData.get("tipo")).toUpperCase();
  if (!esTipo(tipo)) return { ok: false, error: "Elegí qué tipo de propiedad es." };
  const enVenta = si(formData.get("enVenta"));
  const enAlquiler = si(formData.get("enAlquiler"));
  const monedaVenta = txt(formData.get("monedaVenta"));
  const monedaAlquiler = txt(formData.get("monedaAlquiler"));
  const precioVenta = importe(formData.get("precioVenta"));
  const precioAlquiler = importe(formData.get("precioAlquiler"));
  const localidad = txt(formData.get("localidad")).slice(0, 60);
  const barrio = txt(formData.get("barrio")).slice(0, 60);
  const ambientes = entero(formData.get("ambientes"));
  const lat = decimal(formData.get("lat"));
  const lng = decimal(formData.get("lng"));
  const video = txt(formData.get("videoUrl")).slice(0, 300);
  const titulo = txt(formData.get("titulo")).slice(0, 140) || tituloSugerido({ tipo, ambientes, enVenta, enAlquiler, localidad, barrio });

  const datos = {
    titulo,
    descripcion: txt(formData.get("descripcion")).slice(0, 6000),
    tipo,
    enVenta,
    precioVenta: plataONada(precioVenta),
    monedaVenta: esMoneda(monedaVenta) ? monedaVenta : "USD",
    enAlquiler,
    precioAlquiler: plataONada(precioAlquiler),
    monedaAlquiler: esMoneda(monedaAlquiler) ? monedaAlquiler : "ARS",
    expensas: plataONada(importe(formData.get("expensas"))),
    aptoCredito: si(formData.get("aptoCredito")),
    aptoMascotas: si(formData.get("aptoMascotas")),
    direccion: txt(formData.get("direccion")).slice(0, 120),
    mostrarDireccion: si(formData.get("mostrarDireccion")),
    barrio,
    localidad,
    partido: txt(formData.get("partido")).slice(0, 60),
    provincia: txt(formData.get("provincia")).slice(0, 60) || "Buenos Aires",
    lat: lat != null && Math.abs(lat) <= 90 ? lat : null,
    lng: lng != null && Math.abs(lng) <= 180 ? lng : null,
    ambientes,
    dormitorios: entero(formData.get("dormitorios")),
    banos: entero(formData.get("banos")),
    cocheras: entero(formData.get("cocheras")),
    supCubierta: decimal(formData.get("supCubierta")),
    supTotal: decimal(formData.get("supTotal")),
    antiguedad: entero(formData.get("antiguedad")),
    comodidades: txt(formData.get("comodidades")).split(/[,\n]/).map((s) => s.trim().slice(0, 40)).filter(Boolean).slice(0, 30),
    videoUrl: /^https:\/\//.test(video) ? video : null,
    propietarioId: await personaDelNegocio(tenantId, txt(formData.get("propietarioId"))),
    notasInternas: txt(formData.get("notasInternas")).slice(0, 2000) || null,
  };

  if (id) {
    const actual = await prisma.inmoPropiedad.findFirst({ where: { id, tenantId }, select: { estado: true, enVenta: true, precioVenta: true, precioAlquiler: true } });
    if (!actual) return { ok: false, error: "Esa propiedad no existe." };
    // "Bajó de precio": sólo si ya está a la vista y bajó el precio de su operación principal.
    const antes = n(actual.enVenta ? actual.precioVenta : actual.precioAlquiler);
    const ahora = (enVenta ? precioVenta : precioAlquiler) ?? 0;
    let cartel = {};
    if (actual.enVenta === enVenta && antes > 0 && ahora > 0 && (ESTADOS_EN_LA_WEB as readonly string[]).includes(actual.estado)) {
      if (ahora < antes) cartel = { precioAnterior: plata(antes), bajoDePrecioEl: new Date() };
      else if (ahora > antes) cartel = { precioAnterior: null, bajoDePrecioEl: null };
    }
    await prisma.inmoPropiedad.updateMany({ where: { id, tenantId }, data: { ...datos, ...cartel } });
    await auditAdmin({ action: "inmobiliaria.propiedad.editar", entity: "InmoPropiedad", entityId: id, changes: antes !== ahora ? { precio: { de: antes, a: ahora } } : undefined });
    refrescar(`${RAIZ}/propiedades`, `${RAIZ}/propiedades/${id}`, "/propiedades", "/inmobiliaria");
    return { ok: true, id };
  }

  const { prefijoCodigo } = await configInmo(tenantId);
  for (let intento = 0; intento < 3; intento++) {
    try {
      const codigos = await prisma.inmoPropiedad.findMany({ where: { tenantId, codigo: { startsWith: `${prefijoCodigo}-` } }, select: { codigo: true } });
      const mayor = codigos.reduce((m, c) => Math.max(m, Number(c.codigo.match(/(\d+)$/)?.[1] ?? 0)), 0);
      const codigo = siguienteCodigo(String(mayor + intento), prefijoCodigo);
      const creada = await prisma.inmoPropiedad.create({
        data: { tenantId, codigo, slug: slugDePropiedad(tituloProlijo(titulo, [localidad, barrio]), codigo), ...datos, captadaPorUserId: user.id },
        select: { id: true },
      });
      await auditAdmin({ action: "inmobiliaria.propiedad.alta", entity: "InmoPropiedad", entityId: creada.id, changes: { codigo } });
      refrescar(`${RAIZ}/propiedades`);
      return { ok: true, id: creada.id };
    } catch (e) {
      // Dos altas a la vez pueden pedir el mismo código: el índice único lo frena y se reintenta.
      if (!repetido(e) || intento === 2) {
        console.error("[inmobiliaria] alta de propiedad", e);
        return { ok: false, error: "No se pudo guardar la propiedad. Probá de nuevo." };
      }
    }
  }
  return { ok: false, error: "No se pudo guardar la propiedad. Probá de nuevo." };
}

export async function cambiarEstadoPropiedad(formData: FormData): Promise<Resultado> {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const estado = txt(formData.get("estado"));
  if (!esEstadoPropiedad(estado)) return { ok: false, error: "Ese estado no existe." };
  const p = await prisma.inmoPropiedad.findFirst({ where: { id, tenantId }, include: { _count: { select: { fotos: true } } } });
  if (!p) return { ok: false, error: "Esa propiedad no existe." };
  if (estado === "PUBLICADA") {
    const r = revisarFicha({
      titulo: p.titulo, descripcion: p.descripcion, localidad: p.localidad, direccion: p.direccion, enVenta: p.enVenta, enAlquiler: p.enAlquiler,
      precioVenta: p.precioVenta == null ? null : n(p.precioVenta), precioAlquiler: p.precioAlquiler == null ? null : n(p.precioAlquiler),
      tipo: p.tipo, ambientes: p.ambientes, supCubierta: p.supCubierta, supTotal: p.supTotal, fotos: p._count.fotos, lat: p.lat, lng: p.lng,
    });
    if (r.bloqueos.length > 0) return { ok: false, error: `Todavía no se puede publicar. ${r.bloqueos.join(" ")}` };
  }
  await prisma.inmoPropiedad.updateMany({
    where: { id, tenantId },
    data: { estado, ...(estado === "PUBLICADA" && !p.publicadaEl ? { publicadaEl: new Date() } : {}) },
  });
  await auditAdmin({ action: "inmobiliaria.propiedad.estado", entity: "InmoPropiedad", entityId: id, changes: { de: p.estado, a: estado } });
  refrescar(`${RAIZ}/propiedades`, `${RAIZ}/propiedades/${id}`, "/propiedades", "/inmobiliaria", `/propiedades/${p.slug}`);
  return { ok: true };
}

export async function alternarDestacada(formData: FormData) {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const p = await prisma.inmoPropiedad.findFirst({ where: { id, tenantId }, select: { destacada: true } });
  if (!p) return;
  await prisma.inmoPropiedad.updateMany({ where: { id, tenantId }, data: { destacada: !p.destacada } });
  refrescar(`${RAIZ}/propiedades`, `${RAIZ}/propiedades/${id}`, "/inmobiliaria");
}

/** `datos`: un JPEG achicado en el navegador (data URL), una dirección https o un archivo de /public. */
export async function agregarFotoPropiedad(propiedadId: string, datos: string): Promise<Resultado> {
  await requireCapability("agenda:read");
  if (typeof propiedadId !== "string") return { ok: false, error: "Esa propiedad no existe." };
  const tenantId = await getCurrentTenantId();
  const esData = typeof datos === "string" && datos.startsWith("data:image/jpeg;base64,") && datos.length <= MAX_FOTO;
  const esLink = typeof datos === "string" && datos.length <= 500 && (/^https:\/\/[^\s"'<>]+$/.test(datos) || /^\/[A-Za-z0-9._\-/]+\.(jpe?g|png|webp|svg)$/.test(datos));
  if (!esData && !esLink) return { ok: false, error: "La foto es muy pesada o no es una imagen." };
  const p = await prisma.inmoPropiedad.findFirst({ where: { id: propiedadId, tenantId }, select: { id: true, slug: true, _count: { select: { fotos: true } } } });
  if (!p) return { ok: false, error: "Esa propiedad no existe." };
  if (p._count.fotos >= MAX_FOTOS) return { ok: false, error: `Hasta ${MAX_FOTOS} fotos por propiedad.` };
  const ultima = await prisma.inmoFoto.findFirst({ where: { tenantId, propiedadId }, orderBy: { posicion: "desc" }, select: { posicion: true } });
  // `esData` marca las fotos pesadas: los listados leen la marca y el id, nunca el data URL.
  await prisma.inmoFoto.create({ data: { tenantId, propiedadId, url: datos, esData, posicion: (ultima?.posicion ?? -1) + 1 } });
  refrescar(`${RAIZ}/propiedades/${propiedadId}`, `/propiedades/${p.slug}`);
  return { ok: true };
}

export async function quitarFotoPropiedad(formData: FormData) {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const foto = await prisma.inmoFoto.findFirst({ where: { id, tenantId }, select: { propiedadId: true } });
  if (!foto) return;
  await prisma.inmoFoto.deleteMany({ where: { id, tenantId } });
  refrescar(`${RAIZ}/propiedades/${foto.propiedadId}`);
}

/** La primera foto es la tapa de la ficha: ésta pasa adelante de todas. */
export async function hacerPortada(formData: FormData) {
  await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const foto = await prisma.inmoFoto.findFirst({ where: { id, tenantId }, select: { propiedadId: true } });
  if (!foto) return;
  const primera = await prisma.inmoFoto.findFirst({ where: { tenantId, propiedadId: foto.propiedadId }, orderBy: { posicion: "asc" }, select: { posicion: true } });
  await prisma.inmoFoto.updateMany({ where: { id, tenantId }, data: { posicion: (primera?.posicion ?? 0) - 1 } });
  refrescar(`${RAIZ}/propiedades/${foto.propiedadId}`, "/propiedades", "/inmobiliaria");
}

// ── Consultas ───────────────────────────────────────────────────────────────

export interface ConsultaDelSitio {
  propiedadId?: string;
  tipo?: string;
  nombre: string;
  telefono: string;
  email?: string;
  mensaje?: string;
  /** Campo trampa: una persona no lo ve y lo deja vacío. */
  web?: string;
}

/** PÚBLICA: el formulario del sitio. Sin sesión; el negocio sale del dominio. */
export async function enviarConsulta(c: ConsultaDelSitio): Promise<Resultado> {
  // Un robot que llena el campo trampa recibe un "gracias" y no deja nada.
  // Llega de afuera: cada campo tiene que ser texto (un objeto podría colarse como filtro).
  const texto = (x: unknown): string => (typeof x === "string" ? x : "");
  if (!c || typeof c !== "object") return { ok: false, error: "No se pudo enviar. Probá de nuevo." };
  if (texto(c.web).trim()) return { ok: true };
  const v = validarConsulta({ nombre: texto(c.nombre), telefono: texto(c.telefono), email: texto(c.email), mensaje: texto(c.mensaje) });
  if (!v.ok) return v;
  // Sólo existe para inmobiliarias: en cualquier otro negocio del motor no escribe nada.
  const sitio = await sitioInmo();
  if (!sitio) return { ok: false, error: "No se pudo enviar. Probá de nuevo." };
  const tenantId = sitio.tenantId;
  const hace = (min: number) => new Date(Date.now() - min * 60_000);
  const muchas = { ok: false as const, error: "Recibimos varias consultas seguidas. Probá de nuevo en unos minutos o escribinos por WhatsApp." };

  // Freno por conexión (el que insiste queda afuera sin frenar a los demás) y un tope general alto.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "sin-ip";
  const clave = `inmo-consulta:${tenantId}:${ip}`;
  if (frenoDeConsultas.blocked(clave)) return muchas;
  frenoDeConsultas.fail(clave);
  if ((await prisma.inmoConsulta.count({ where: { tenantId, origen: "WEB", createdAt: { gte: hace(60) } } })) >= 300) return muchas;
  const propiedadId = texto(c.propiedadId);
  const propiedad = propiedadId
    ? await prisma.inmoPropiedad.findFirst({ where: { id: propiedadId, tenantId, estado: { in: [...ESTADOS_EN_LA_WEB] as string[] } }, select: { id: true } })
    : null;
  const tipo = esTipoConsulta(c.tipo) ? c.tipo : "CONSULTA";
  // El mismo teléfono (o mail) por la misma propiedad en los últimos 10 minutos: ya está anotado.
  const contacto = v.dato.telefono ? { telefono: v.dato.telefono } : { email: v.dato.email };
  const repetida = await prisma.inmoConsulta.findFirst({ where: { tenantId, ...contacto, propiedadId: propiedad?.id ?? null, tipo, createdAt: { gte: hace(10) } }, select: { id: true } });
  if (repetida) return { ok: true };

  const creada = await prisma.inmoConsulta.create({
    data: { tenantId, propiedadId: propiedad?.id ?? null, tipo, origen: "WEB", ...v.dato },
    select: { id: true },
  });
  await auditPublic({ action: "inmobiliaria.consulta", entity: "InmoConsulta", entityId: creada.id, clientPhone: v.dato.telefono || undefined });
  refrescar(`${RAIZ}/consultas`);
  return { ok: true };
}

/** Consulta que entró por la oficina, por WhatsApp o por un portal: la carga alguien del equipo. */
export async function cargarConsulta(formData: FormData): Promise<Resultado> {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const v = validarConsulta({ nombre: txt(formData.get("nombre")), telefono: txt(formData.get("telefono")), email: txt(formData.get("email")), mensaje: txt(formData.get("mensaje")) });
  if (!v.ok) return v;
  const propiedadId = txt(formData.get("propiedadId"));
  const propiedad = propiedadId ? await prisma.inmoPropiedad.findFirst({ where: { id: propiedadId, tenantId }, select: { id: true } }) : null;
  const tipo = txt(formData.get("tipo"));
  const origen = txt(formData.get("origen"));
  const ahora = new Date();
  await prisma.inmoConsulta.create({
    data: {
      tenantId, propiedadId: propiedad?.id ?? null, ...v.dato,
      tipo: esTipoConsulta(tipo) ? tipo : "CONSULTA",
      origen: esOrigen(origen) ? origen : "MOSTRADOR",
      // La cargó una persona que ya habló con el interesado: nace respondida y a su nombre.
      estado: "CONTACTADA", respondidaEl: ahora, asignadaUserId: user.id, asignadaNombre: user.name,
    },
  });
  refrescar(`${RAIZ}/consultas`);
  return { ok: true };
}

/** La consulta, si esta persona puede tocarla (el agente: las suyas y las sin asignar). */
async function consultaDe(tenantId: string, id: string, user: SessionUser) {
  const c = await prisma.inmoConsulta.findFirst({ where: { id, tenantId }, select: { id: true, estado: true, asignadaUserId: true, respondidaEl: true } });
  if (!c) return null;
  if (!veLaPlata(user) && c.asignadaUserId && c.asignadaUserId !== user.id) return null;
  return c;
}

/** Deja asentado que se respondió (al tocar "Responder por WhatsApp"): frena el reloj y la toma. */
export async function marcarRespondida(id: string): Promise<void> {
  const user = await requireCapability("agenda:read");
  if (typeof id !== "string") return;
  const tenantId = await getCurrentTenantId();
  const c = await consultaDe(tenantId, id, user);
  if (!c) return;
  await prisma.inmoConsulta.updateMany({
    where: { id: c.id, tenantId },
    data: {
      respondidaEl: c.respondidaEl ?? new Date(),
      ...(c.estado === "NUEVA" ? { estado: "CONTACTADA" } : {}),
      ...(c.asignadaUserId ? {} : { asignadaUserId: user.id, asignadaNombre: user.name }),
    },
  });
  refrescar(`${RAIZ}/consultas`);
}

export async function moverConsulta(formData: FormData) {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const estado = txt(formData.get("estado"));
  if (!esEstadoConsulta(estado)) return;
  const c = await consultaDe(tenantId, id, user);
  if (!c) return;
  const cierra = estado === "GANADA" || estado === "PERDIDA";
  await prisma.inmoConsulta.updateMany({
    where: { id, tenantId },
    data: {
      estado,
      ...(estado !== "NUEVA" && !c.respondidaEl ? { respondidaEl: new Date() } : {}),
      cerradaEl: cierra ? new Date() : null,
      ...(c.asignadaUserId ? {} : { asignadaUserId: user.id, asignadaNombre: user.name }),
    },
  });
  await auditAdmin({ action: "inmobiliaria.consulta.estado", entity: "InmoConsulta", entityId: id, changes: { de: c.estado, a: estado } });
  refrescar(`${RAIZ}/consultas`);
}

export async function guardarConsulta(formData: FormData) {
  const user = await requireCapability("agenda:read");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const c = await consultaDe(tenantId, id, user);
  if (!c) return;
  // Fecha y hora de la visita, leída en el reloj del negocio (la misma lectura que los turnos).
  const visitaEl = horarioDeNegocioDelFormulario(txt(formData.get("visitaEl")));
  let asignada = {};
  if (veLaPlata(user) && formData.has("asignadaUserId")) {
    const uid = txt(formData.get("asignadaUserId"));
    const persona = uid ? await prisma.user.findFirst({ where: { id: uid, tenantId, active: true }, select: { id: true, name: true } }) : null;
    asignada = { asignadaUserId: persona?.id ?? null, asignadaNombre: persona?.name ?? null };
  }
  await prisma.inmoConsulta.updateMany({
    where: { id, tenantId },
    data: {
      notas: txt(formData.get("notas")).slice(0, 2000) || null,
      visitaEl,
      ...(visitaEl && (c.estado === "NUEVA" || c.estado === "CONTACTADA") ? { estado: "VISITA", respondidaEl: c.respondidaEl ?? new Date() } : {}),
      ...asignada,
    },
  });
  refrescar(`${RAIZ}/consultas`);
}

// ── Contratos de alquiler ───────────────────────────────────────────────────

/** Busca a la persona por teléfono o la da de alta. Dentro de la transacción del contrato. */
async function personaOAlta(tx: Parameters<Parameters<typeof tenantTransaction>[0]>[0], tenantId: string, elegida: string, nombre: string, telefono: string): Promise<string | null> {
  if (elegida) {
    const c = await tx.client.findFirst({ where: { id: elegida, tenantId }, select: { id: true } });
    return c?.id ?? null;
  }
  const tel = telefono.replace(/[^\d+]/g, "");
  if (nombre.length < 2 || tel.replace(/\D/g, "").length < 8) return null;
  const existente = await tx.client.findFirst({ where: { tenantId, phone: tel }, select: { id: true } });
  return existente?.id ?? (await tx.client.create({ data: { tenantId, name: nombre.slice(0, 80), phone: tel }, select: { id: true } })).id;
}

export async function crearContrato(formData: FormData): Promise<Resultado<{ id: string }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const inicio = diaCampo(formData.get("inicio"));
  const fin = diaCampo(formData.get("fin"));
  const montoInicial = importe(formData.get("montoInicial"));
  const indice = txt(formData.get("ajusteIndice"));
  if (!inicio || !fin) return { ok: false, error: "Faltan las fechas de inicio y de fin del contrato." };
  if (fin <= inicio) return { ok: false, error: "La fecha de fin tiene que ser posterior a la de inicio." };
  if (!montoInicial || montoInicial <= 0) return { ok: false, error: "Falta el alquiler inicial." };
  if (!esIndice(indice)) return { ok: false, error: "Elegí cómo se actualiza el alquiler." };
  const cada = entero(formData.get("ajusteCadaMeses")) ?? 0;
  if (indice !== "SIN_AJUSTE" && (cada < 1 || cada > 24)) return { ok: false, error: "Indicá cada cuántos meses se actualiza (de 1 a 24)." };
  const fijo = indice === "FIJO" ? decimal(formData.get("ajusteFijoPct")) : null;
  if (indice === "FIJO" && (fijo == null || fijo <= 0 || fijo > 500)) return { ok: false, error: "Falta el porcentaje de cada actualización." };

  const calc: ContratoCalc = {
    inicio, fin, montoInicial,
    diaVencimiento: Math.max(1, Math.min(28, entero(formData.get("diaVencimiento")) ?? 10)),
    ajusteIndice: indice, ajusteCadaMeses: indice === "SIN_AJUSTE" ? 0 : cada, ajusteFijoPct: fijo,
  };
  const meses = mesesDelContrato(inicio, fin);
  if (meses < 1 || meses > 120) return { ok: false, error: "El contrato tiene que durar entre 1 mes y 10 años." };
  const plan = planDeCuotas(calc);
  const config = await configInmo(tenantId);
  const propiedadId = txt(formData.get("propiedadId"));

  for (let intento = 0; intento < 3; intento++) {
    try {
      const creado = await tenantTransaction(async (tx): Promise<{ error: string } | { id: string; numero: number }> => {
        const propiedad = await tx.inmoPropiedad.findFirst({
          where: { id: propiedadId, tenantId },
          select: { id: true, estado: true, propietarioId: true, contratos: { where: { estado: "VIGENTE" }, select: { id: true } } },
        });
        if (!propiedad) return { error: "Elegí la propiedad que se alquila." };
        if (propiedad.contratos.length > 0) return { error: "Esa propiedad ya tiene un contrato vigente." };
        const inquilinoId = await personaOAlta(tx, tenantId, txt(formData.get("inquilinoId")), txt(formData.get("inquilinoNombre")), txt(formData.get("inquilinoTelefono")));
        if (!inquilinoId) return { error: "Falta el inquilino: elegilo de la lista o cargá nombre y teléfono." };
        const propietarioId =
          (await personaOAlta(tx, tenantId, txt(formData.get("propietarioId")), txt(formData.get("propietarioNombre")), txt(formData.get("propietarioTelefono")))) ?? propiedad.propietarioId;
        if (!propietarioId) return { error: "Falta el propietario: elegilo de la lista o cargá nombre y teléfono." };
        if (propietarioId === inquilinoId) return { error: "El propietario y el inquilino no pueden ser la misma persona." };

        const ultimo = await tx.inmoContrato.findFirst({ where: { tenantId }, orderBy: { numero: "desc" }, select: { numero: true } });
        const contrato = await tx.inmoContrato.create({
          data: {
            tenantId,
            numero: (ultimo?.numero ?? 0) + 1,
            propiedadId: propiedad.id,
            inquilinoId,
            propietarioId,
            inicio: instanteDe(inicio),
            fin: instanteDe(fin),
            montoInicial: plata(montoInicial),
            diaVencimiento: calc.diaVencimiento,
            ajusteIndice: indice,
            ajusteCadaMeses: calc.ajusteCadaMeses,
            ajusteFijoPct: fijo,
            comisionPct: formData.has("comisionPct") ? pct(formData.get("comisionPct"), 50) : config.comisionAdminPct,
            punitorioDiarioPct: formData.has("punitorioDiarioPct") ? pct(formData.get("punitorioDiarioPct"), 5) : config.punitorioDiarioPct,
            deposito: plata(importe(formData.get("deposito")) ?? 0),
            garantia: txt(formData.get("garantia")).slice(0, 500) || null,
            notas: txt(formData.get("notas")).slice(0, 2000) || null,
            tokenInquilino: llave(),
          },
          select: { id: true, numero: true },
        });
        await tx.inmoCuota.createMany({
          data: plan.map((c) => ({
            tenantId, contratoId: contrato.id, numero: c.numero, periodo: c.periodo, vence: instanteDe(c.vence), tramo: c.tramo,
            alquiler: plata(c.alquiler), ajustePendiente: c.ajustePendiente,
          })),
        });
        // La ficha sale de la calle y queda atada a su dueño.
        await tx.inmoPropiedad.updateMany({
          where: { id: propiedad.id, tenantId },
          data: { estado: "ALQUILADA", ...(propiedad.propietarioId ? {} : { propietarioId }) },
        });
        return contrato;
      });
      if ("error" in creado) return { ok: false, error: creado.error };
      await auditAdmin({ action: "inmobiliaria.contrato.alta", entity: "InmoContrato", entityId: creado.id, changes: { numero: creado.numero, cuotas: plan.length, alquiler: montoInicial, indice } });
      refrescar(`${RAIZ}/alquileres`, `${RAIZ}/propiedades`, "/propiedades");
      return { ok: true, id: creado.id };
    } catch (e) {
      // Dos contratos a la vez pueden pedir el mismo número: el índice único lo frena y se reintenta.
      if (!repetido(e) || intento === 2) {
        console.error("[inmobiliaria] alta de contrato", e);
        return { ok: false, error: "No se pudo guardar el contrato. Probá de nuevo." };
      }
    }
  }
  return { ok: false, error: "No se pudo guardar el contrato. Probá de nuevo." };
}

/**
 * Aplica la actualización del próximo tramo. Si se carga un monto a mano, vale ése (el contrato
 * manda); si no, se calcula con el índice cargado. Queda el rastro en InmoAjuste.
 */
export async function aplicarAjuste(formData: FormData): Promise<Resultado<{ nuevo: number }>> {
  const user = await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const contratoId = txt(formData.get("contratoId"));
  const aMano = importe(formData.get("monto"));
  const c = await prisma.inmoContrato.findFirst({ where: { id: contratoId, tenantId, estado: "VIGENTE" }, include: { ajustes: { orderBy: { tramo: "desc" }, take: 1 } } });
  if (!c) return { ok: false, error: "Ese contrato no existe o ya no está vigente." };
  const calc: ContratoCalc = {
    inicio: diaDe(c.inicio), fin: diaDe(c.fin), montoInicial: n(c.montoInicial), diaVencimiento: c.diaVencimiento,
    ajusteIndice: c.ajusteIndice as IndiceAjuste, ajusteCadaMeses: c.ajusteCadaMeses, ajusteFijoPct: c.ajusteFijoPct,
  };
  const tramo = c.tramosAplicados + 1;
  const meses = mesesDelContrato(calc.inicio, calc.fin);
  if (calc.ajusteIndice === "SIN_AJUSTE" || calc.ajusteIndice === "FIJO" || meses < 1 || tramo > tramoDe(meses - 1, calc)) return { ok: false, error: "Este contrato no tiene actualizaciones para aplicar a mano." };
  const vigente = n(c.ajustes[0]?.montoNuevo ?? c.montoInicial);
  let nuevo: number;
  let coeficiente: number;
  let detalle: string;
  if (aMano && aMano > 0) {
    nuevo = redondear(aMano);
    coeficiente = nuevo / vigente;
    detalle = "Monto cargado a mano";
  } else {
    let serie: PuntoIndice[] = [];
    if (usaSerie(calc.ajusteIndice)) {
      const filas = await prisma.inmoIndice.findMany({ where: { tenantId, indice: c.ajusteIndice }, select: { fecha: true, valor: true } });
      serie = filas.map((f) => ({ fecha: diaDe(f.fecha), valor: f.valor }));
    }
    // Con el índice sólo se aplica cuando llegó la fecha: antes, el valor de ese día no existe.
    if (hoyDia() < inicioDeTramo(calc, tramo)) return { ok: false, error: `Todavía no llegó la fecha de la actualización (${diaCorto(inicioDeTramo(calc, tramo))}). Si ya se acordó el monto, cargalo a mano.` };
    const r = calcularAjuste(calc, tramo, vigente, serie);
    if (!r.ok) return { ok: false, error: `${r.falta} También podés cargar el monto nuevo a mano.` };
    ({ nuevo, coeficiente, detalle } = r);
  }

  // Actualización aplicada tarde sobre cuotas ya cobradas (ver `alquilerCobrado` en core.ts): la
  // diferencia queda en la misma cuota, que pasa a "pago parcial" y se reclama como saldo. Lo que
  // no puede pasar es que el monto nuevo sea MENOR al alquiler que ya se cobró por una cuota del
  // tramo (sin contar expensas ni mora, que se imputan antes): eso es un número mal tipeado.
  const cobradas = await prisma.inmoCuota.findMany({ where: { tenantId, contratoId: c.id, tramo: { gte: tramo }, anulada: false, pagado: { gt: 0 } }, select: { alquiler: true, extras: true, punitorios: true, pagado: true } });
  if (cobradas.some((q) => alquilerCobrado({ alquiler: n(q.alquiler), extras: leerExtras(q.extras), punitorios: n(q.punitorios) }, n(q.pagado)) > nuevo + 0.005)) {
    return { ok: false, error: "Ya hay cuotas de ese tramo cobradas por más que ese monto. Revisá el número." };
  }
  try {
    await tenantTransaction(async (tx) => {
      // La condición sobre tramosAplicados evita aplicar dos veces el mismo tramo.
      const marcado = await tx.inmoContrato.updateMany({ where: { id: c.id, tenantId, tramosAplicados: tramo - 1 }, data: { tramosAplicados: tramo } });
      if (marcado.count !== 1) throw new Error("ya-aplicado");
      await tx.inmoAjuste.create({
        data: {
          tenantId, contratoId: c.id, tramo, desde: instanteDe(inicioDeTramo(calc, tramo)), indice: c.ajusteIndice,
          coeficiente, montoAnterior: plata(vigente), montoNuevo: plata(nuevo), detalle, aplicadoPor: user.name,
        },
      });
      // Este tramo queda firme; los que siguen toman el monto nuevo como último conocido.
      await tx.inmoCuota.updateMany({ where: { tenantId, contratoId: c.id, tramo, anulada: false }, data: { alquiler: plata(nuevo), ajustePendiente: false } });
      await tx.inmoCuota.updateMany({ where: { tenantId, contratoId: c.id, tramo: { gt: tramo }, anulada: false }, data: { alquiler: plata(nuevo) } });
    });
  } catch (e) {
    if ((e as Error).message === "ya-aplicado") return { ok: false, error: "Esa actualización ya estaba aplicada." };
    console.error("[inmobiliaria] ajuste", e);
    return { ok: false, error: "No se pudo aplicar la actualización. Probá de nuevo." };
  }
  await auditAdmin({ action: "inmobiliaria.contrato.ajuste", entity: "InmoContrato", entityId: c.id, changes: { tramo, de: vigente, a: nuevo, detalle } });
  refrescar(`${RAIZ}/alquileres`, `${RAIZ}/alquileres/${c.id}`);
  return { ok: true, nuevo };
}

/** Cierra el contrato: las cuotas futuras sin cobrar se anulan y la ficha vuelve a "pausada". */
export async function cerrarContrato(formData: FormData): Promise<Resultado> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const estado = txt(formData.get("estado")) === "RESCINDIDO" ? "RESCINDIDO" : "FINALIZADO";
  const c = await prisma.inmoContrato.findFirst({ where: { id, tenantId, estado: "VIGENTE" }, select: { id: true, propiedadId: true } });
  if (!c) return { ok: false, error: "Ese contrato no existe o ya estaba cerrado." };
  const finDeMes = instanteDe(`${hoyDia().slice(0, 7)}-28`);
  await tenantTransaction(async (tx) => {
    await tx.inmoContrato.updateMany({ where: { id, tenantId }, data: { estado } });
    await tx.inmoCuota.updateMany({ where: { tenantId, contratoId: id, vence: { gt: finDeMes }, pagado: 0 }, data: { anulada: true } });
    await tx.inmoPropiedad.updateMany({ where: { id: c.propiedadId, tenantId, estado: "ALQUILADA" }, data: { estado: "PAUSADA" } });
  });
  await auditAdmin({ action: "inmobiliaria.contrato.cierre", entity: "InmoContrato", entityId: id, changes: { estado } });
  refrescar(`${RAIZ}/alquileres`, `${RAIZ}/alquileres/${id}`, `${RAIZ}/propiedades`);
  return { ok: true };
}

// ── Cuotas y cobros ─────────────────────────────────────────────────────────

export async function registrarCobro(formData: FormData): Promise<Resultado<{ saldo: number }>> {
  const user = await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const cuotaId = txt(formData.get("cuotaId"));
  const monto = importe(formData.get("monto"));
  const medio = txt(formData.get("medio"));
  const conMora = si(formData.get("conMora"));
  if (!monto || monto <= 0) return { ok: false, error: "Falta el monto del cobro." };
  if (!esMedio(medio)) return { ok: false, error: "Elegí el medio de pago." };
  const hoy = hoyDia();
  try {
    // Serializable: dos cobros a la vez sobre la misma cuota no pueden leer el mismo saldo.
    const r = await tenantTransaction(async (tx): Promise<{ error: string } | { contratoId: string; saldo: number }> => {
      const q = await tx.inmoCuota.findFirst({ where: { id: cuotaId, tenantId, anulada: false }, include: { contrato: { select: { id: true, punitorioDiarioPct: true } } } });
      if (!q) return { error: "Esa cuota no existe." };
      const base = { alquiler: n(q.alquiler), extras: leerExtras(q.extras), punitorios: n(q.punitorios), pagado: n(q.pagado), vence: diaDe(q.vence), moraPerdonada: q.moraPerdonada };
      // La mora sugerida se asienta en la cuota recién cuando se decide cobrarla. Si se perdonó,
      // `punitorioSugerido` da 0 y no se asienta nada.
      if (conMora && base.punitorios === 0) base.punitorios = punitorioSugerido(base, hoy, q.contrato.punitorioDiarioPct).monto;
      const saldo = saldoCuota(base);
      if (saldo <= 0.005) return { error: "Esa cuota ya está paga." };
      if (monto > saldo + 0.005) return { error: `Es más de lo que debe. El saldo es ${pesos(saldo)}.` };
      await tx.inmoPago.create({ data: { tenantId, cuotaId, medio, monto: plata(monto), nota: txt(formData.get("nota")).slice(0, 300) || null, cobradoPor: user.name } });
      const pagado = redondear(base.pagado + monto);
      await tx.inmoCuota.updateMany({ where: { id: cuotaId, tenantId }, data: { pagado: plata(pagado), punitorios: plata(base.punitorios) } });
      return { contratoId: q.contrato.id, saldo: redondear(saldo - monto) };
    }, SERIAL);
    if ("error" in r) return { ok: false, error: r.error };
    await auditAdmin({ action: "inmobiliaria.cobro", entity: "InmoCuota", entityId: cuotaId, changes: { monto, medio } });
    refrescar(`${RAIZ}/alquileres`, `${RAIZ}/alquileres/${r.contratoId}`, `${RAIZ}/liquidaciones`);
    return { ok: true, saldo: r.saldo };
  } catch (e) {
    console.error("[inmobiliaria] cobro", e);
    return { ok: false, error: "No se pudo registrar el cobro. Probá de nuevo." };
  }
}

export async function anularCobro(formData: FormData): Promise<Resultado> {
  const user = await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  try {
    const r = await tenantTransaction(async (tx): Promise<{ error: string } | { contratoId: string; monto: number }> => {
      const p = await tx.inmoPago.findFirst({ where: { id, tenantId, anuladoEl: null }, include: { cuota: { select: { id: true, contratoId: true, pagado: true, liquidado: true } } } });
      if (!p) return { error: "Ese cobro no existe o ya estaba anulado." };
      const pagado = redondear(n(p.cuota.pagado) - n(p.monto));
      if (pagado < n(p.cuota.liquidado) - 0.005) return { error: "Ese cobro ya se le liquidó al propietario. Anulá primero la liquidación." };
      await tx.inmoPago.updateMany({ where: { id, tenantId }, data: { anuladoEl: new Date(), anuladoPor: user.name } });
      await tx.inmoCuota.updateMany({ where: { id: p.cuota.id, tenantId }, data: { pagado: plata(Math.max(0, pagado)) } });
      return { contratoId: p.cuota.contratoId, monto: n(p.monto) };
    }, SERIAL);
    if ("error" in r) return { ok: false, error: r.error };
    await auditAdmin({ action: "inmobiliaria.cobro.anular", entity: "InmoPago", entityId: id, changes: { monto: r.monto } });
    refrescar(`${RAIZ}/alquileres`, `${RAIZ}/alquileres/${r.contratoId}`, `${RAIZ}/liquidaciones`);
    return { ok: true };
  } catch (e) {
    console.error("[inmobiliaria] anular cobro", e);
    return { ok: false, error: "No se pudo anular el cobro. Probá de nuevo." };
  }
}

// Extras y mora se leen y se reescriben enteros (los extras son un JSON): dos personas cargando a
// la vez sobre la misma cuota se pisarían. Van en transacción serializable, como los cobros.

/** Suma un concepto a la cuota (expensas, luz, ABL a cargo del inquilino). */
export async function agregarExtra(formData: FormData): Promise<Resultado> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const cuotaId = txt(formData.get("cuotaId"));
  const concepto = txt(formData.get("concepto")).slice(0, 60);
  const monto = importe(formData.get("monto"));
  if (!concepto || !monto || monto <= 0) return { ok: false, error: "Cargá el concepto y el monto." };
  try {
    const r = await tenantTransaction(async (tx): Promise<{ error: string } | { contratoId: string }> => {
      const q = await tx.inmoCuota.findFirst({ where: { id: cuotaId, tenantId, anulada: false }, select: { extras: true, contratoId: true } });
      if (!q) return { error: "Esa cuota no existe." };
      const extras = leerExtras(q.extras);
      if (extras.length >= 12) return { error: "Hasta 12 conceptos por cuota." };
      await tx.inmoCuota.updateMany({ where: { id: cuotaId, tenantId }, data: { extras: json([...extras, { concepto, monto: redondear(monto) }]) } });
      return { contratoId: q.contratoId };
    }, SERIAL);
    if ("error" in r) return { ok: false, error: r.error };
    refrescar(`${RAIZ}/alquileres`, `${RAIZ}/alquileres/${r.contratoId}`);
    return { ok: true };
  } catch (e) {
    console.error("[inmobiliaria] agregar concepto", e);
    return { ok: false, error: "No se pudo sumar el concepto. Probá de nuevo." };
  }
}

/**
 * Saca un concepto de la cuota. Se identifica por concepto y monto (lo que la pantalla mostró),
 * no por la posición en la lista: si otra persona cambió la lista mientras tanto, sale el que se
 * pidió o no sale ninguno. El `indice` solo se acepta por compatibilidad con pantallas viejas.
 */
export async function quitarExtra(formData: FormData): Promise<Resultado> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const cuotaId = txt(formData.get("cuotaId"));
  const concepto = txt(formData.get("concepto")).slice(0, 60);
  const monto = importe(formData.get("monto"));
  const indice = entero(formData.get("indice"));
  if (!(concepto && monto != null) && indice == null) return { ok: false, error: "No se entendió qué concepto quitar." };
  try {
    const r = await tenantTransaction(async (tx): Promise<{ error: string } | { contratoId: string }> => {
      const q = await tx.inmoCuota.findFirst({ where: { id: cuotaId, tenantId, anulada: false }, select: { extras: true, contratoId: true, alquiler: true, punitorios: true, pagado: true } });
      if (!q) return { error: "Esa cuota no existe." };
      const actuales = leerExtras(q.extras);
      const buscado = concepto && monto != null ? { concepto, monto } : indice != null ? actuales[indice] : undefined;
      const { extras, quedo } = buscado ? quitarExtraDe(actuales, buscado) : { extras: actuales, quedo: false };
      if (!quedo) return { error: "Ese concepto ya no está en la cuota. Actualizá la pantalla." };
      // No se puede dejar la cuota valiendo menos de lo que ya se cobró.
      if (redondear(n(q.alquiler) + n(q.punitorios) + sumaExtras(extras)) < n(q.pagado) - 0.005) return { error: "Ese concepto ya está cobrado: anulá primero el cobro." };
      await tx.inmoCuota.updateMany({ where: { id: cuotaId, tenantId }, data: { extras: json(extras) } });
      return { contratoId: q.contratoId };
    }, SERIAL);
    if ("error" in r) return { ok: false, error: r.error };
    refrescar(`${RAIZ}/alquileres`, `${RAIZ}/alquileres/${r.contratoId}`);
    return { ok: true };
  } catch (e) {
    console.error("[inmobiliaria] quitar concepto", e);
    return { ok: false, error: "No se pudo quitar el concepto. Probá de nuevo." };
  }
}

/**
 * Fija la mora de una cuota, o la perdona con 0. Perdonarla deja la marca `moraPerdonada`: no es
 * lo mismo que "nunca se cargó" y el panel no la vuelve a sugerir. Cargar un monto la saca.
 */
export async function cargarMora(formData: FormData): Promise<Resultado> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const cuotaId = txt(formData.get("cuotaId"));
  const monto = importe(formData.get("monto"));
  if (monto == null) return { ok: false, error: "Cargá el monto de la mora (0 para perdonarla)." };
  const perdonada = redondear(monto) === 0;
  try {
    const r = await tenantTransaction(async (tx): Promise<{ error: string } | { contratoId: string }> => {
      const q = await tx.inmoCuota.findFirst({ where: { id: cuotaId, tenantId, anulada: false }, select: { extras: true, contratoId: true, alquiler: true, pagado: true } });
      if (!q) return { error: "Esa cuota no existe." };
      if (redondear(n(q.alquiler) + monto + sumaExtras(leerExtras(q.extras))) < n(q.pagado) - 0.005) return { error: "Esa mora ya está cobrada: anulá primero el cobro." };
      await tx.inmoCuota.updateMany({ where: { id: cuotaId, tenantId }, data: { punitorios: plata(redondear(monto)), moraPerdonada: perdonada } });
      return { contratoId: q.contratoId };
    }, SERIAL);
    if ("error" in r) return { ok: false, error: r.error };
    await auditAdmin({ action: "inmobiliaria.cuota.mora", entity: "InmoCuota", entityId: cuotaId, changes: { monto, perdonada } });
    refrescar(`${RAIZ}/alquileres`, `${RAIZ}/alquileres/${r.contratoId}`);
    return { ok: true };
  } catch (e) {
    console.error("[inmobiliaria] mora", e);
    return { ok: false, error: "No se pudo cargar la mora. Probá de nuevo." };
  }
}

// ── Liquidaciones al propietario ────────────────────────────────────────────

/**
 * Emite la liquidación de un propietario con TODO lo cobrado que todavía no se le liquidó.
 * Los gastos a su cargo llegan como pares gastoConcepto / gastoMonto.
 */
export async function emitirLiquidacion(formData: FormData): Promise<Resultado<{ id: string }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const propietarioId = txt(formData.get("propietarioId"));
  if (!(await personaDelNegocio(tenantId, propietarioId))) return { ok: false, error: "Ese propietario no existe." };
  const conceptos = formData.getAll("gastoConcepto").map((v) => txt(v).slice(0, 80));
  const montos = formData.getAll("gastoMonto").map((v) => importe(v));
  const gastos = conceptos.map((concepto, i) => ({ concepto, monto: redondear(montos[i] ?? 0) })).filter((g) => g.concepto && g.monto > 0).slice(0, 20);

  const [config, pendientes] = await Promise.all([configInmo(tenantId), cobrosSinLiquidar(tenantId, propietarioId)]);
  if (pendientes.length === 0) return { ok: false, error: "No hay cobros sin liquidar para este propietario." };
  const cobros = pendientes.map((p) => p.cobro);
  const totales = liquidarPorContrato(cobros, gastos, config);
  // La pantalla manda lo cobrado que mostró: si entró otro cobro mientras tanto, se vuelve a mirar.
  const visto = importe(formData.get("cobradoVisto"));
  if (visto != null && Math.abs(visto - totales.cobrado) > 0.005) return { ok: false, error: "Entraron o se anularon cobros desde que abriste esta pantalla. Ya se actualizó: revisá los números y emitila de nuevo." };

  for (let intento = 0; intento < 3; intento++) {
    try {
      const creada = await tenantTransaction(async (tx) => {
        // Cada cuota se marca sólo si sigue EXACTAMENTE como se la leyó (cobrado, alquiler, mora,
        // lo ya liquidado y la última escritura, que cubre también los extras): si alguien cobró,
        // anuló, sumó un concepto o liquidó mientras tanto, se corta todo y no se liquida nada
        // dos veces ni con un reparto viejo.
        for (const p of pendientes) {
          const l = p.leida;
          const m = await tx.inmoCuota.updateMany({
            where: {
              id: p.cobro.cuotaId, tenantId,
              pagado: plata(l.pagado), alquiler: plata(l.alquiler), punitorios: plata(l.punitorios), liquidado: plata(l.liquidadoAntes), updatedAt: l.updatedAt,
            },
            data: {
              liquidado: plata(l.pagado),
              liquidadoAlquiler: plata(redondear(l.liquidadoPorRubro.alquiler + p.cobro.alquiler)),
              liquidadoExtras: plata(redondear(l.liquidadoPorRubro.extras + p.cobro.extras)),
              liquidadoPunitorios: plata(redondear(l.liquidadoPorRubro.punitorios + p.cobro.punitorios)),
            },
          });
          if (m.count !== 1) throw new Error("cambio-mientras-tanto");
        }
        const ultima = await tx.inmoLiquidacion.findFirst({ where: { tenantId }, orderBy: { numero: "desc" }, select: { numero: true } });
        return tx.inmoLiquidacion.create({
          data: {
            tenantId, numero: (ultima?.numero ?? 0) + 1, propietarioId, periodo: hoyDia().slice(0, 7),
            alquileres: plata(totales.alquileres), extras: plata(totales.extras), punitorios: plata(totales.punitorios),
            comision: plata(totales.comision), ivaComision: plata(totales.ivaComision), gastos: plata(totales.gastos), neto: plata(totales.neto),
            detalle: json({ cobros, gastos, reglas: { ivaComisionPct: config.ivaComisionPct, punitoriosAlPropietario: config.punitoriosAlPropietario } }),
            token: llave(),
          },
          select: { id: true, numero: true },
        });
      });
      await auditAdmin({ action: "inmobiliaria.liquidacion.emitir", entity: "InmoLiquidacion", entityId: creada.id, changes: { numero: creada.numero, neto: totales.neto, cobros: cobros.length } });
      refrescar(`${RAIZ}/liquidaciones`, `${RAIZ}/alquileres`);
      return { ok: true, id: creada.id };
    } catch (e) {
      if ((e as Error).message === "cambio-mientras-tanto") return { ok: false, error: "Los cobros cambiaron mientras armabas la liquidación. Volvé a abrirla y revisá los números." };
      if (!repetido(e) || intento === 2) {
        console.error("[inmobiliaria] liquidación", e);
        return { ok: false, error: "No se pudo emitir la liquidación. Probá de nuevo." };
      }
    }
  }
  return { ok: false, error: "No se pudo emitir la liquidación. Probá de nuevo." };
}

export async function pagarLiquidacion(formData: FormData): Promise<Resultado> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const medio = txt(formData.get("medio"));
  if (!esMedio(medio)) return { ok: false, error: "Elegí cómo se le pagó." };
  const m = await prisma.inmoLiquidacion.updateMany({ where: { id, tenantId, estado: "EMITIDA" }, data: { estado: "PAGADA", pagadaEl: new Date(), medio, nota: txt(formData.get("nota")).slice(0, 300) || null } });
  if (m.count !== 1) return { ok: false, error: "Esa liquidación no existe o ya estaba pagada." };
  await auditAdmin({ action: "inmobiliaria.liquidacion.pagar", entity: "InmoLiquidacion", entityId: id, changes: { medio } });
  refrescar(`${RAIZ}/liquidaciones`);
  return { ok: true };
}

/** Anula una liquidación que todavía no se pagó: sus cobros vuelven a quedar "sin liquidar". */
export async function anularLiquidacion(formData: FormData): Promise<Resultado> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const id = txt(formData.get("id"));
  const l = await prisma.inmoLiquidacion.findFirst({ where: { id, tenantId, estado: "EMITIDA" }, select: { id: true, detalle: true } });
  if (!l) return { ok: false, error: "Sólo se puede anular una liquidación que todavía no se pagó." };
  const cobros = ((l.detalle as { cobros?: { cuotaId?: string; alquiler?: number; extras?: number; punitorios?: number }[] } | null)?.cobros ?? []).filter((c) => typeof c.cuotaId === "string");
  try {
    await tenantTransaction(async (tx) => {
      const m = await tx.inmoLiquidacion.updateMany({ where: { id, tenantId, estado: "EMITIDA" }, data: { estado: "ANULADA" } });
      if (m.count !== 1) throw new Error("ya-no-emitida");
      for (const c of cobros) {
        const q = await tx.inmoCuota.findFirst({ where: { id: c.cuotaId, tenantId }, select: { liquidado: true, liquidadoAlquiler: true, liquidadoExtras: true, liquidadoPunitorios: true } });
        if (!q) continue;
        // Se devuelve rubro por rubro lo que esa liquidación se había llevado, y el total.
        const [alq, ext, pun] = [Number(c.alquiler) || 0, Number(c.extras) || 0, Number(c.punitorios) || 0];
        const menos = (actual: unknown, devuelto: number): string => plata(Math.max(0, redondear(n(actual) - devuelto)));
        await tx.inmoCuota.updateMany({
          where: { id: c.cuotaId, tenantId },
          data: {
            liquidado: menos(q.liquidado, redondear(alq + ext + pun)),
            liquidadoAlquiler: menos(q.liquidadoAlquiler, alq),
            liquidadoExtras: menos(q.liquidadoExtras, ext),
            liquidadoPunitorios: menos(q.liquidadoPunitorios, pun),
          },
        });
      }
    }, SERIAL);
  } catch (e) {
    console.error("[inmobiliaria] anular liquidación", e);
    return { ok: false, error: "No se pudo anular la liquidación. Probá de nuevo." };
  }
  await auditAdmin({ action: "inmobiliaria.liquidacion.anular", entity: "InmoLiquidacion", entityId: id });
  refrescar(`${RAIZ}/liquidaciones`);
  return { ok: true };
}

// ── Índices ─────────────────────────────────────────────────────────────────

async function guardarPuntos(tenantId: string, indice: string, puntos: readonly PuntoIndice[]): Promise<number> {
  let cargados = 0;
  for (const p of puntos) {
    const fecha = instanteDe(p.fecha);
    await prisma.inmoIndice.upsert({ where: { tenantId_indice_fecha: { tenantId, indice, fecha } }, create: { tenantId, indice, fecha, valor: p.valor }, update: { valor: p.valor } });
    cargados++;
  }
  return cargados;
}

/** Carga a mano un valor publicado. Para el IPC, la fecha es el mes (se guarda con día 1). */
export async function cargarIndice(formData: FormData): Promise<Resultado> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const indice = txt(formData.get("indice"));
  if (!esIndice(indice) || !usaSerie(indice)) return { ok: false, error: "Elegí el índice." };
  const cruda = txt(formData.get("fecha"));
  const fecha = /^\d{4}-\d{2}$/.test(cruda) ? `${cruda}-01` : cruda;
  const valor = decimal(formData.get("valor"));
  if (!esDia(fecha)) return { ok: false, error: "Falta la fecha del valor." };
  if (!valor || valor <= 0) return { ok: false, error: "Falta el valor del índice." };
  await guardarPuntos(tenantId, indice, [{ fecha: indice === "IPC" ? `${fecha.slice(0, 7)}-01` : fecha, valor }]);
  refrescar(`${RAIZ}/config`, `${RAIZ}/alquileres`);
  return { ok: true };
}

async function pedir(url: string): Promise<unknown> {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000), headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/**
 * Baja los valores oficiales: el ICL del Banco Central (últimos 13 meses, día por día) y el
 * IPC del INDEC por datos.gob.ar (últimos 36 meses). Si una fuente no contesta, la otra se
 * carga igual y se avisa cuál falló.
 */
export async function traerIndicesOficiales(): Promise<Resultado<{ icl: number; ipc: number; aviso: string }>> {
  await requireCapability("agenda:manage");
  const tenantId = await getCurrentTenantId();
  const hoy = hoyDia();
  const fallas: string[] = [];
  let icl = 0;
  let ipc = 0;
  try {
    // La API devuelve hasta 1000 valores por pedido: 13 meses de un índice diario entran en uno.
    const json = await pedir(`${FUENTE_ICL}?desde=${sumarDias(hoy, -400)}&hasta=${sumarDias(hoy, 45)}&limit=1000`);
    icl = await guardarPuntos(tenantId, "ICL", leerRespuestaBcra(json));
    if (icl === 0) fallas.push("el Banco Central no devolvió valores del ICL");
  } catch {
    fallas.push("no se pudo consultar el ICL en el Banco Central");
  }
  try {
    const json = await pedir(`${FUENTE_IPC}&last=36`);
    ipc = await guardarPuntos(tenantId, "IPC", leerRespuestaDatosGobAr(json));
    if (ipc === 0) fallas.push("datos.gob.ar no devolvió valores del IPC");
  } catch {
    fallas.push("no se pudo consultar el IPC en datos.gob.ar");
  }
  if (icl === 0 && ipc === 0) return { ok: false, error: `No se pudo bajar ningún índice: ${fallas.join("; ")}. Podés cargarlos a mano.` };
  await auditAdmin({ action: "inmobiliaria.indices.bajar", entity: "InmoIndice", changes: { icl, ipc } });
  refrescar(`${RAIZ}/config`, `${RAIZ}/alquileres`);
  return { ok: true, icl, ipc, aviso: fallas.length ? `Atención: ${fallas.join("; ")}.` : "" };
}

// ── Configuración ───────────────────────────────────────────────────────────

export async function guardarConfigInmo(formData: FormData) {
  // Comisiones, mora y datos de cobro: sólo el dueño.
  await requireCapability("users:manage");
  const tenantId = await getCurrentTenantId();
  const plantillas: Record<string, string> = {};
  for (const k of CLAVES_PLANTILLA) {
    const v = txt(formData.get(`plantilla_${k}`));
    if (v) plantillas[k] = v.slice(0, 900);
  }
  const prefijo = txt(formData.get("prefijoCodigo")).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "PRO";
  const data = {
    prefijoCodigo: prefijo,
    comisionAdminPct: pct(formData.get("comisionAdminPct"), 50),
    ivaComisionPct: pct(formData.get("ivaComisionPct"), 30),
    punitorioDiarioPct: pct(formData.get("punitorioDiarioPct"), 5),
    punitoriosAlPropietario: si(formData.get("punitoriosAlPropietario")),
    aliasCbu: txt(formData.get("aliasCbu")).slice(0, 60) || null,
    linkMercadoPago: /^https:\/\//.test(txt(formData.get("linkMercadoPago"))) ? txt(formData.get("linkMercadoPago")).slice(0, 300) : null,
    matricula: txt(formData.get("matricula")).slice(0, 80) || null,
    plantillas,
  };
  await prisma.inmoConfig.upsert({ where: { tenantId }, create: { tenantId, ...data }, update: data });
  await auditAdmin({ action: "inmobiliaria.config", entity: "InmoConfig", changes: { comisionAdminPct: data.comisionAdminPct, punitorioDiarioPct: data.punitorioDiarioPct } });
  refrescar(`${RAIZ}/config`, "/inmobiliaria");
}
