"use server";

// Server Actions del módulo VIAJES — armador de presupuestos de viaje.
// Cablean el core puro (`src/lib/viajes/core.ts`) al conector de ofertas
// (`src/plugins/ofertas-viaje`) y a Prisma/RLS. Mismo molde que
// `cartera-actions.ts` / `bancos-actions.ts`. Spec: docs/producto/spec-armador-presupuestos-viaje.md.
//
// GATE COMPUESTO en TODAS las actions (`exigirViajes(cap)`, ver viajes/glue.ts):
//   flag VIAJES_ENABLED + capability `quotes:*` + módulo `presupuestos-viaje` asignado.
//   El buscador exige además el plugin `buscador-ofertas-viaje` asignado.
//
// SEGURIDAD DE LA CAPTURA: la action que captura desde el buscador NO acepta el precio
// desde el cliente. Recibe la clave de la búsqueda + la referencia de la oferta y RE-LEE
// la oferta del caché del servidor (lo que el servidor vio, no lo que el navegador manda).
// Si el caché venció, pide volver a buscar. Así un precio capturado siempre es un precio
// que el sistema vio. La captura MANUAL sí acepta el precio (es el operador declarándolo)
// y por eso exige certeza + fuente explícitas.
//
// AISLAMIENTO (ADR-018): tenantId explícito + tenantTransaction. DINERO (ADR-057):
// number en memoria (`round2`), Decimal(14,2) en DB.
//
// NOTA Gate 2: la migración `20260909120000_add_viajes_presupuestos` NO está
// aplicada a Neon — las escrituras devuelven `migracionPendiente` hasta ese OK.

import { revalidatePath } from "next/cache";
import { tenantTransaction } from "@/lib/rls";
import { auditAdmin } from "@/lib/audit";
import {
  claveBusqueda,
  CuotaAgotadaError,
  ProveedorOfertasError,
  UNIDADES_PRECIO,
  BASES_OCUPACION,
  type BaseOcupacion,
  type BusquedaHoteles,
  type BusquedaVuelos,
  type OfertaHotel,
  type OfertaVuelo,
  type PrecioOferta,
  type ResultadoBusqueda,
  type UnidadPrecio,
} from "@/plugins/ofertas-viaje";
import {
  asignacionDefault,
  capturarOferta,
  capturarOfertaManual,
  describirHotel,
  describirVuelo,
  OfertaInvalidaError,
  vigenciaPresupuesto,
  type Certeza,
  type OfertaCapturadaNueva,
  type TipoOferta,
} from "@/lib/viajes/core";
import {
  cacheOfertasGlobal,
  esMigracionPendiente,
  exigirViajes,
  proveedorParaTenant,
  tieneBuscador,
} from "@/lib/viajes/glue";

const VIAJES_PATH = "/admin/viajes";

// ── Tipos de estado (los consume la UI con useActionState) ────────────────────

export type ViajesActionState =
  | { ok: true; mensaje?: string }
  | { ok: false; error: string; migracionPendiente?: boolean }
  | null;

/** Oferta tal como la ve la UI de resultados (sin campos internos). */
export type OfertaVistaUI = {
  referenciaProveedor: string;
  descripcion: string;
  precio: number;
  moneda: string;
  unidad: string;
  baseOcupacion: string | null;
  capturadoEn: string;
  vigenteHasta: string | null;
  extra: string;
};

export type BusquedaActionState =
  | {
      ok: true;
      tipo: "VUELO" | "HOTEL";
      proveedor: string;
      /** Clave de la búsqueda en el caché del server: la usa "Capturar". */
      busquedaClave: string;
      capturadoEn: string;
      desdeCache: boolean;
      avisos: string[];
      ofertas: OfertaVistaUI[];
    }
  | { ok: false; error: string }
  | null;

// ── Helpers de parseo de formulario (estrictos, mensajes en criollo) ──────────

const RE_IATA = /^[A-Z]{3}$/;
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_MONEDA = /^[A-Z]{3}$/;

function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

function entero(fd: FormData, k: string, def: number, min = 0, max = 20, etiqueta = k): number {
  const raw = str(fd, k);
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${etiqueta}: tiene que ser un entero entre ${min} y ${max}.`);
  return n;
}

function decimal(fd: FormData, k: string, etiqueta: string): number {
  const raw = str(fd, k).replace(",", ".");
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n < 0) throw new Error(`${etiqueta}: importe inválido.`);
  return n;
}

function iata(fd: FormData, k: string, etiqueta: string): string {
  const v = str(fd, k).toUpperCase();
  if (!RE_IATA.test(v)) throw new Error(`${etiqueta}: usá el código de 3 letras (ej.: AEP, MAD).`);
  return v;
}

function fecha(fd: FormData, k: string, etiqueta: string, opcional = false): string | undefined {
  const v = str(fd, k);
  if (!v && opcional) return undefined;
  if (!RE_FECHA.test(v) || !Number.isFinite(Date.parse(`${v}T00:00:00Z`))) throw new Error(`${etiqueta}: fecha inválida.`);
  return v;
}

function certeza(fd: FormData): Certeza {
  const v = str(fd, "certeza");
  if (v !== "VERIFICADA" && v !== "ESTIMADA") throw new Error("Elegí la certeza: verificada (la viste hoy) o estimada.");
  return v;
}

function toActionError(err: unknown): { ok: false; error: string; migracionPendiente?: boolean } {
  if (esMigracionPendiente(err)) {
    return { ok: false, error: "Falta aplicar la migración del módulo (paso del dueño).", migracionPendiente: true };
  }
  if (err instanceof CuotaAgotadaError || err instanceof OfertaInvalidaError) return { ok: false, error: err.message };
  if (err instanceof ProveedorOfertasError) return { ok: false, error: "El proveedor no respondió. Probá de nuevo en un rato." };
  const msg = err instanceof Error && err.message ? err.message : "No se pudo completar la operación.";
  return { ok: false, error: msg };
}

const NIVELES_DEFAULT = ["Económico", "Intermedio", "Alto"] as const;

// ── Nuevo pedido (solicitud + presupuesto v1 + niveles default + 1 opción por nivel) ──

export async function crearPedidoAction(_prev: ViajesActionState, formData: FormData): Promise<ViajesActionState> {
  const gate = await exigirViajes("quotes:manage");
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    const contactoNombre = str(formData, "contactoNombre");
    const contactoWhatsapp = str(formData, "contactoWhatsapp") || null;
    const contactoEmail = str(formData, "contactoEmail") || null;
    if (!contactoNombre || contactoNombre.length > 120) throw new Error("Poné el nombre del contacto.");
    const cantidadPasajeros = entero(formData, "cantidadPasajeros", 2, 1, 50, "Pasajeros");
    const destino = str(formData, "destino");
    if (!destino || destino.length > 120) throw new Error("Poné el destino del tramo.");
    const desde = fecha(formData, "desde", "Desde")!;
    const hasta = fecha(formData, "hasta", "Hasta")!;
    if (hasta < desde) throw new Error("La vuelta no puede ser antes de la ida.");
    const monedaReferencia = str(formData, "monedaReferencia").toUpperCase() || "USD";
    if (!RE_MONEDA.test(monedaReferencia)) throw new Error("Moneda de referencia inválida.");
    const motivo = str(formData, "motivo") || null;
    const requisitos = str(formData, "requisitos") || null;
    const titulo = str(formData, "titulo") || `${destino} — ${contactoNombre}`;

    const creado = await tenantTransaction(
      async (tx) => {
        const solicitud = await tx.solicitudViaje.create({
          data: {
            tenantId: gate.tenantId,
            contactoNombre,
            contactoWhatsapp,
            contactoEmail,
            cantidadPasajeros,
            motivo,
            requisitos,
            monedaReferencia,
            operadorId: gate.user.id,
            tramos: {
              create: [{ tenantId: gate.tenantId, orden: 1, destino, desde: new Date(`${desde}T00:00:00Z`), hasta: new Date(`${hasta}T00:00:00Z`) }],
            },
          },
          select: { id: true },
        });
        const presupuesto = await tx.presupuestoViaje.create({
          data: {
            tenantId: gate.tenantId,
            solicitudId: solicitud.id,
            version: 1,
            titulo: titulo.slice(0, 120),
            creadoPor: `user:${gate.user.id}`,
            niveles: {
              create: NIVELES_DEFAULT.map((nombre, i) => ({
                tenantId: gate.tenantId,
                nombre,
                orden: i + 1,
                opciones: { create: [{ tenantId: gate.tenantId, nombre: "Opción A", orden: 1 }] },
              })),
            },
          },
          select: { id: true },
        });
        return { solicitudId: solicitud.id, presupuestoId: presupuesto.id };
      },
      { tenantId: gate.tenantId },
    );
    await auditAdmin({ action: "create", entity: "SolicitudViaje", entityId: creado.solicitudId, changes: { contactoNombre, cantidadPasajeros, destino, desde, hasta } });
    revalidatePath(VIAJES_PATH);
    return { ok: true, mensaje: "Pedido creado con su presupuesto v1 (3 niveles, una opción por nivel)." };
  } catch (e) {
    return toActionError(e);
  }
}

// ── Buscar ofertas (plugin buscador) ──────────────────────────────────────────

function vistaVuelo(o: OfertaVuelo): OfertaVistaUI {
  const seg = o.tramos.flatMap((t) => t.segmentos);
  const extra = [
    `${seg.length} ${seg.length === 1 ? "segmento" : "segmentos"}`,
    o.equipajeIncluido == null ? null : o.equipajeIncluido ? "equipaje incluido" : "sin equipaje despachado",
    o.asientosDisponibles != null ? `${o.asientosDisponibles} asientos` : null,
  ].filter(Boolean).join(" · ");
  return base(o, describirVuelo(o), extra);
}

function vistaHotel(o: OfertaHotel): OfertaVistaUI {
  const extra = [o.habitacion.descripcion, o.politicaCancelacion].filter(Boolean).join(" · ");
  return base(o, describirHotel(o), extra);
}

function base(o: OfertaVuelo | OfertaHotel, descripcion: string, extra: string): OfertaVistaUI {
  return {
    referenciaProveedor: o.referenciaProveedor,
    descripcion,
    precio: o.precio.monto,
    moneda: o.precio.moneda,
    unidad: o.precio.unidad,
    baseOcupacion: o.precio.baseOcupacion ?? null,
    capturadoEn: o.precio.capturadoEn,
    vigenteHasta: o.precio.vigenteHasta ?? null,
    extra,
  };
}

export async function buscarOfertasAction(_prev: BusquedaActionState, formData: FormData): Promise<BusquedaActionState> {
  const gate = await exigirViajes("quotes:manage");
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!tieneBuscador(gate.modules)) {
    return { ok: false, error: "El buscador de vuelos y hoteles no está habilitado para este negocio. Podés capturar la oferta a mano." };
  }
  try {
    const tipo = str(formData, "tipo") === "HOTEL" ? "HOTEL" : "VUELO";
    const { proveedor, aviso } = proveedorParaTenant(gate.tenantId);
    const maxResultados = entero(formData, "maxResultados", 5, 1, 10, "Resultados");

    if (tipo === "VUELO") {
      const b: BusquedaVuelos = {
        origen: iata(formData, "origen", "Origen"),
        destino: iata(formData, "destino", "Destino"),
        fechaIda: fecha(formData, "fechaIda", "Ida")!,
        fechaVuelta: fecha(formData, "fechaVuelta", "Vuelta", true),
        adultos: entero(formData, "adultos", 1, 1, 9, "Adultos"),
        ninos: entero(formData, "ninos", 0, 0, 9, "Menores") || undefined,
        moneda: str(formData, "moneda") || undefined,
        maxResultados,
      };
      if (b.fechaVuelta && b.fechaVuelta < b.fechaIda) throw new Error("La vuelta no puede ser antes de la ida.");
      const r = await proveedor.buscarVuelos(b);
      return respuesta("VUELO", r, claveBusqueda("VUELO", b), r.ofertas.map(vistaVuelo), aviso);
    }

    // El formulario comparte campos entre vuelos y hoteles (origen=ciudad, ida=check-in,
    // vuelta=check-out); se aceptan ambos nombres para que la API de la action sea clara.
    const b: BusquedaHoteles = {
      ciudad: iata(formData, str(formData, "ciudad") ? "ciudad" : "origen", "Ciudad"),
      checkIn: fecha(formData, str(formData, "checkIn") ? "checkIn" : "fechaIda", "Check-in")!,
      checkOut: fecha(formData, str(formData, "checkOut") ? "checkOut" : "fechaVuelta", "Check-out")!,
      adultos: entero(formData, "adultos", 2, 1, 9, "Adultos"),
      habitaciones: entero(formData, "habitaciones", 1, 1, 9, "Habitaciones"),
      moneda: str(formData, "moneda") || undefined,
      maxResultados,
    };
    if (b.checkOut <= b.checkIn) throw new Error("El check-out tiene que ser después del check-in.");
    const r = await proveedor.buscarHoteles(b);
    return respuesta("HOTEL", r, claveBusqueda("HOTEL", b), r.ofertas.map(vistaHotel), aviso);
  } catch (e) {
    return toActionError(e);
  }
}

function respuesta<T>(
  tipo: "VUELO" | "HOTEL",
  r: ResultadoBusqueda<T>,
  busquedaClave: string,
  ofertas: OfertaVistaUI[],
  aviso: string | null,
): BusquedaActionState {
  return {
    ok: true,
    tipo,
    proveedor: r.proveedor,
    busquedaClave,
    capturadoEn: r.capturadoEn,
    desdeCache: r.desdeCache,
    avisos: [...(aviso ? [aviso] : []), ...r.avisos],
    ofertas,
  };
}

// ── Persistir una oferta capturada (+ asignación opcional a una opción) ───────

async function persistirCaptura(
  tenantId: string,
  userId: string,
  nueva: OfertaCapturadaNueva,
  opcionId: string | null,
  tramoId: string | null,
): Promise<{ ofertaId: string; asignada: boolean }> {
  return tenantTransaction(
    async (tx) => {
      if (tramoId) {
        const tramo = await tx.tramoSolicitudViaje.findFirst({ where: { id: tramoId, tenantId }, select: { id: true } });
        if (!tramo) throw new Error("No encontramos ese tramo del pedido.");
      }
      const oferta = await tx.ofertaCapturadaViaje.create({
        data: {
          tenantId,
          tipo: nueva.tipo,
          titulo: nueva.titulo.slice(0, 200),
          proveedor: nueva.proveedor,
          referenciaProveedor: nueva.referenciaProveedor,
          tramoId,
          precio: nueva.precio,
          moneda: nueva.moneda,
          unidad: nueva.unidad,
          baseOcupacion: nueva.baseOcupacion,
          ocupacion: nueva.ocupacion,
          noches: nueva.noches,
          incluyeImpuestos: nueva.incluyeImpuestos,
          capturadoEn: nueva.capturadoEn,
          vigenteHasta: nueva.vigenteHasta,
          vigenciaAsumida: nueva.vigenciaAsumida,
          certeza: nueva.certeza,
          fuente: nueva.fuente,
          capturadoPor: `user:${userId}`,
          condiciones: nueva.condiciones,
          detalle: JSON.parse(JSON.stringify(nueva.detalle)),
        },
        select: { id: true },
      });
      if (!opcionId) return { ofertaId: oferta.id, asignada: false };

      // Pertenencia: la opción tiene que ser de ESTE tenant. Traemos el presupuesto y el
      // pedido para la asignación por default (pasajeros) y el recálculo de vigencia.
      const opcion = await tx.opcionPresupuestoViaje.findFirst({
        where: { id: opcionId, tenantId },
        select: {
          id: true,
          _count: { select: { asignaciones: true } },
          nivel: { select: { presupuesto: { select: { id: true, estado: true, solicitud: { select: { cantidadPasajeros: true } } } } } },
        },
      });
      if (!opcion) throw new Error("No encontramos esa opción del presupuesto.");
      const presupuesto = opcion.nivel.presupuesto;
      if (["ENVIADO", "ACEPTADO", "RECHAZADO", "ARCHIVADO"].includes(presupuesto.estado)) {
        throw new Error("Ese presupuesto ya fue enviado: para cambiarlo hay que generar una versión nueva.");
      }
      const a = asignacionDefault(nueva, presupuesto.solicitud.cantidadPasajeros);
      await tx.asignacionOfertaViaje.create({
        data: {
          tenantId,
          opcionId: opcion.id,
          ofertaId: oferta.id,
          pasajerosCubiertos: a.pasajerosCubiertos,
          baseAplicada: a.baseAplicada,
          ocupacionAplicada: a.ocupacionAplicada,
          suplementoSingle: a.suplementoSingle,
          cantidad: a.cantidad,
          orden: opcion._count.asignaciones + 1,
          asignadoPor: `user:${userId}`,
        },
      });
      // Vigencia del presupuesto = mínimo de sus ofertas asignadas; primera asignación → EN_ARMADO.
      const vigencias = await tx.asignacionOfertaViaje.findMany({
        where: { tenantId, opcion: { nivel: { presupuestoId: presupuesto.id } } },
        select: { oferta: { select: { vigenteHasta: true } } },
      });
      await tx.presupuestoViaje.update({
        where: { id: presupuesto.id },
        data: {
          vigenteHasta: vigenciaPresupuesto(vigencias.map((v) => v.oferta.vigenteHasta)),
          ...(presupuesto.estado === "BORRADOR" ? { estado: "EN_ARMADO" } : {}),
        },
      });
      return { ofertaId: oferta.id, asignada: true };
    },
    { tenantId },
  );
}

// ── Capturar desde el buscador (RE-LEE la oferta del caché del server) ────────

export async function capturarDesdeBusquedaAction(_prev: ViajesActionState, formData: FormData): Promise<ViajesActionState> {
  const gate = await exigirViajes("quotes:manage");
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!tieneBuscador(gate.modules)) return { ok: false, error: "El buscador no está habilitado para este negocio." };
  try {
    const tipoBusqueda = str(formData, "tipo") === "HOTEL" ? "HOTEL" : "VUELO";
    const tipo: TipoOferta = tipoBusqueda === "HOTEL" ? "ALOJAMIENTO" : "VUELO";
    const busquedaClave = str(formData, "busquedaClave");
    const referencia = str(formData, "referenciaProveedor");
    const proveedorClave = str(formData, "proveedor");
    const opcionId = str(formData, "opcionId") || null;
    const tramoId = str(formData, "tramoId") || null;
    if (!busquedaClave || !referencia || !proveedorClave) throw new Error("Faltan datos de la oferta. Volvé a buscar.");

    const ahora = new Date();
    const cacheado = await cacheOfertasGlobal().obtener<OfertaVuelo | OfertaHotel>(gate.tenantId, proveedorClave, busquedaClave, ahora.getTime());
    const oferta = cacheado?.ofertas.find((o) => o.referenciaProveedor === referencia);
    if (!oferta) throw new Error("La búsqueda venció. Volvé a buscar para capturar esta oferta con un precio fresco.");

    const { fuente } = proveedorParaTenant(gate.tenantId);
    // Vino de la API en vivo en esta sesión → VERIFICADA (la "vimos hoy"), salvo que el
    // operador la marque estimada (ambiente de prueba, por ejemplo).
    const c: Certeza = str(formData, "certeza") === "ESTIMADA" ? "ESTIMADA" : "VERIFICADA";
    const nueva = capturarOferta(tipo, oferta, { ahora, certeza: c, fuente });
    const r = await persistirCaptura(gate.tenantId, gate.user.id, nueva, opcionId, tramoId);
    await auditAdmin({ action: "create", entity: "OfertaCapturadaViaje", entityId: r.ofertaId, changes: { tipo, proveedor: proveedorClave, referencia, opcionId } });
    revalidatePath(VIAJES_PATH);
    return { ok: true, mensaje: r.asignada ? "Oferta capturada y asignada a la opción." : "Oferta capturada en la biblioteca." };
  } catch (e) {
    return toActionError(e);
  }
}

// ── Captura MANUAL (portal del mayorista, mail, llamada) ──────────────────────

export async function capturarManualAction(_prev: ViajesActionState, formData: FormData): Promise<ViajesActionState> {
  const gate = await exigirViajes("quotes:manage");
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    const tipoRaw = str(formData, "tipo");
    const tipo: TipoOferta = tipoRaw === "ALOJAMIENTO" || tipoRaw === "OTRO" ? tipoRaw : "VUELO";
    const unidadRaw = str(formData, "unidad") as UnidadPrecio;
    if (!UNIDADES_PRECIO.includes(unidadRaw)) throw new Error("Elegí la unidad del precio.");
    const baseRaw = str(formData, "baseOcupacion") as BaseOcupacion;
    const baseOcupacion = BASES_OCUPACION.includes(baseRaw) ? baseRaw : undefined;
    const ocupacion = baseOcupacion === "OTRA" ? entero(formData, "ocupacion", 0, 1, 20, "Personas por habitación") : undefined;
    const noches = str(formData, "noches") ? entero(formData, "noches", 1, 1, 90, "Noches") : undefined;
    const moneda = str(formData, "moneda").toUpperCase();
    const vigenteHasta = fecha(formData, "vigenteHasta", "Vigente hasta", true);
    const ahora = new Date();
    const incluye = str(formData, "incluyeImpuestos");
    const precio: PrecioOferta = {
      monto: decimal(formData, "precio", "Precio"),
      moneda,
      unidad: unidadRaw,
      ...(baseOcupacion ? { baseOcupacion } : {}),
      ...(ocupacion ? { ocupacion } : {}),
      ...(noches ? { noches } : {}),
      capturadoEn: ahora.toISOString(),
      ...(vigenteHasta ? { vigenteHasta: `${vigenteHasta}T23:59:59.000Z` } : {}),
      ...(incluye === "SI" || incluye === "NO" || incluye === "PARCIAL" ? { incluyeImpuestos: incluye } : {}),
    };
    const nueva = capturarOfertaManual(
      {
        tipo,
        titulo: str(formData, "titulo"),
        proveedor: str(formData, "proveedor"),
        precio,
        condiciones: str(formData, "condiciones") || null,
      },
      { ahora, certeza: certeza(formData), fuente: str(formData, "fuente") },
    );
    const opcionId = str(formData, "opcionId") || null;
    const tramoId = str(formData, "tramoId") || null;
    const r = await persistirCaptura(gate.tenantId, gate.user.id, nueva, opcionId, tramoId);
    await auditAdmin({ action: "create", entity: "OfertaCapturadaViaje", entityId: r.ofertaId, changes: { tipo, proveedor: nueva.proveedor, manual: true, opcionId } });
    revalidatePath(VIAJES_PATH);
    return { ok: true, mensaje: r.asignada ? "Oferta cargada y asignada a la opción." : "Oferta cargada en la biblioteca." };
  } catch (e) {
    return toActionError(e);
  }
}
