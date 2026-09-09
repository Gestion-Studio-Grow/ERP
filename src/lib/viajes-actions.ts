"use server";

// Server Actions del módulo VIAJES — armador de presupuestos de viaje.
// Cablean el core puro (`src/lib/viajes/core.ts`) al conector de ofertas
// (`src/plugins/ofertas-viaje`) y a Prisma/RLS. Mismo molde que
// `cartera-actions.ts` / `bancos-actions.ts`.
//
// GATE COMPUESTO en TODAS las actions (`exigirViajes`, ver viajes/glue.ts):
//   flag VIAJES_ENABLED + capability `viajes:manage` + módulo `viajes` asignado.
//
// SEGURIDAD DEL SNAPSHOT: la action de guardar NO acepta el precio desde el cliente.
// Recibe la clave de la búsqueda + la referencia de la oferta y RE-LEE la oferta del
// caché del servidor (lo que el servidor vio, no lo que el navegador manda). Si el
// caché venció, pide volver a buscar. Así un precio guardado siempre es un precio
// capturado por el sistema.
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
  type BusquedaHoteles,
  type BusquedaVuelos,
  type OfertaHotel,
  type OfertaVuelo,
  type ResultadoBusqueda,
} from "@/plugins/ofertas-viaje";
import {
  avisosDeBase,
  congelarOferta,
  describirHotel,
  describirVuelo,
  SnapshotInvalidoError,
  type GrupoViaje,
  type TipoOferta,
} from "@/lib/viajes/core";
import {
  cacheOfertasGlobal,
  esMigracionPendiente,
  exigirViajes,
  proveedorParaTenant,
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
  baseOcupacion: string;
  capturadoEn: string;
  vigenteHasta: string | null;
  extra: string;
};

export type BusquedaActionState =
  | {
      ok: true;
      tipo: TipoOferta;
      proveedor: string;
      /** Clave de la búsqueda en el caché del server: la usa "Guardar como opción". */
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

function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}

function entero(fd: FormData, k: string, def: number, min = 0, max = 20): number {
  const raw = str(fd, k);
  if (!raw) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`"${k}" debe ser un entero entre ${min} y ${max}.`);
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

function toActionError(err: unknown): { ok: false; error: string; migracionPendiente?: boolean } {
  if (esMigracionPendiente(err)) {
    return { ok: false, error: "Falta aplicar la migración del módulo (paso del dueño).", migracionPendiente: true };
  }
  if (err instanceof CuotaAgotadaError || err instanceof SnapshotInvalidoError) return { ok: false, error: err.message };
  if (err instanceof ProveedorOfertasError) return { ok: false, error: "El proveedor no respondió. Probá de nuevo en un rato." };
  const msg = err instanceof Error && err.message ? err.message : "No se pudo completar la operación.";
  return { ok: false, error: msg };
}

// ── Crear presupuesto ─────────────────────────────────────────────────────────

export async function crearPresupuestoAction(_prev: ViajesActionState, formData: FormData): Promise<ViajesActionState> {
  const gate = await exigirViajes();
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    const titulo = str(formData, "titulo");
    const destino = str(formData, "destino");
    if (!titulo || titulo.length > 120) throw new Error("Poné un título (hasta 120 caracteres).");
    if (!destino || destino.length > 120) throw new Error("Poné el destino.");
    const adultos = entero(formData, "adultos", 1, 1, 20);
    const ninos = entero(formData, "ninos", 0, 0, 20);
    const habitaciones = entero(formData, "habitaciones", 1, 1, 10);
    const fechaSalida = fecha(formData, "fechaSalida", "Salida", true);
    const fechaRegreso = fecha(formData, "fechaRegreso", "Regreso", true);
    if (fechaSalida && fechaRegreso && fechaRegreso < fechaSalida) throw new Error("El regreso no puede ser antes de la salida.");
    const notas = str(formData, "notas") || null;

    const creado = await tenantTransaction(
      async (tx) =>
        tx.presupuestoViaje.create({
          data: {
            tenantId: gate.tenantId,
            titulo,
            destino,
            adultos,
            ninos,
            habitaciones,
            fechaSalida: fechaSalida ? new Date(`${fechaSalida}T00:00:00Z`) : null,
            fechaRegreso: fechaRegreso ? new Date(`${fechaRegreso}T00:00:00Z`) : null,
            notas,
            creadoPor: `user:${gate.user.id}`,
          },
          select: { id: true },
        }),
      { tenantId: gate.tenantId },
    );
    await auditAdmin({ action: "create", entity: "PresupuestoViaje", entityId: creado.id, changes: { titulo, destino, adultos, ninos, habitaciones } });
    revalidatePath(VIAJES_PATH);
    return { ok: true, mensaje: "Presupuesto creado." };
  } catch (e) {
    return toActionError(e);
  }
}

// ── Buscar ofertas ────────────────────────────────────────────────────────────

function vistaVuelo(o: OfertaVuelo): OfertaVistaUI {
  const seg = o.tramos.flatMap((t) => t.segmentos);
  const extra = [
    `${seg.length} ${seg.length === 1 ? "segmento" : "segmentos"}`,
    o.equipajeIncluido == null ? null : o.equipajeIncluido ? "equipaje incluido" : "sin equipaje despachado",
    o.asientosDisponibles != null ? `${o.asientosDisponibles} asientos` : null,
  ].filter(Boolean).join(" · ");
  return base(o, describir("VUELO", o), extra);
}

function vistaHotel(o: OfertaHotel): OfertaVistaUI {
  const extra = [o.habitacion.descripcion, o.politicaCancelacion].filter(Boolean).join(" · ");
  return base(o, describir("HOTEL", o), extra);
}

function base(o: OfertaVuelo | OfertaHotel, descripcion: string, extra: string): OfertaVistaUI {
  return {
    referenciaProveedor: o.referenciaProveedor,
    descripcion,
    precio: o.precio.monto,
    moneda: o.precio.moneda,
    baseOcupacion: o.precio.baseOcupacion,
    capturadoEn: o.precio.capturadoEn,
    vigenteHasta: o.precio.vigenteHasta ?? null,
    extra,
  };
}

// Descripción en una línea, reusando el core (import normal: lo que Turbopack
// registra como action son los RE-EXPORTS de un archivo "use server", no los imports).
function describir(tipo: TipoOferta, o: OfertaVuelo | OfertaHotel): string {
  return tipo === "VUELO" ? describirVuelo(o as OfertaVuelo) : describirHotel(o as OfertaHotel);
}

export async function buscarOfertasAction(_prev: BusquedaActionState, formData: FormData): Promise<BusquedaActionState> {
  const gate = await exigirViajes();
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    const tipo = str(formData, "tipo") === "HOTEL" ? "HOTEL" : "VUELO";
    const { proveedor, aviso } = proveedorParaTenant(gate.tenantId);
    const maxResultados = entero(formData, "maxResultados", 5, 1, 10);

    if (tipo === "VUELO") {
      const b: BusquedaVuelos = {
        origen: iata(formData, "origen", "Origen"),
        destino: iata(formData, "destino", "Destino"),
        fechaIda: fecha(formData, "fechaIda", "Ida")!,
        fechaVuelta: fecha(formData, "fechaVuelta", "Vuelta", true),
        adultos: entero(formData, "adultos", 1, 1, 9),
        ninos: entero(formData, "ninos", 0, 0, 9) || undefined,
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
      adultos: entero(formData, "adultos", 2, 1, 9),
      habitaciones: entero(formData, "habitaciones", 1, 1, 9),
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
  tipo: TipoOferta,
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

// ── Guardar una oferta como opción (SNAPSHOT) ─────────────────────────────────

export async function guardarOpcionAction(_prev: ViajesActionState, formData: FormData): Promise<ViajesActionState> {
  const gate = await exigirViajes();
  if (!gate.ok) return { ok: false, error: gate.error };
  try {
    const presupuestoId = str(formData, "presupuestoId");
    const tipo: TipoOferta = str(formData, "tipo") === "HOTEL" ? "HOTEL" : "VUELO";
    const busquedaClave = str(formData, "busquedaClave");
    const referencia = str(formData, "referenciaProveedor");
    const proveedorClave = str(formData, "proveedor");
    if (!presupuestoId || !busquedaClave || !referencia || !proveedorClave) throw new Error("Faltan datos de la oferta. Volvé a buscar.");

    // RE-LEER la oferta del caché del server: nunca se confía en el precio del cliente.
    const ahora = new Date();
    const cacheado = await cacheOfertasGlobal().obtener<OfertaVuelo | OfertaHotel>(gate.tenantId, proveedorClave, busquedaClave, ahora.getTime());
    const oferta = cacheado?.ofertas.find((o) => o.referenciaProveedor === referencia);
    if (!oferta) throw new Error("La búsqueda venció. Volvé a buscar para guardar esta opción con un precio fresco.");

    const guardado = await tenantTransaction(
      async (tx) => {
        // Pertenencia: el presupuesto tiene que ser de ESTE tenant.
        const p = await tx.presupuestoViaje.findFirst({
          where: { id: presupuestoId, tenantId: gate.tenantId },
          select: { id: true, adultos: true, ninos: true, habitaciones: true, _count: { select: { opciones: true } } },
        });
        if (!p) throw new Error("No encontramos ese presupuesto.");
        const grupo: GrupoViaje = { adultos: p.adultos, ninos: p.ninos, habitaciones: p.habitaciones };
        const s = congelarOferta(tipo, oferta, { grupo, ahora });
        const fila = await tx.opcionPresupuestoViaje.create({
          data: {
            tenantId: gate.tenantId,
            presupuestoId: p.id,
            tipo: s.tipo,
            proveedor: s.proveedor,
            referenciaProveedor: s.referenciaProveedor,
            descripcion: s.descripcion,
            detalle: JSON.parse(JSON.stringify(s.detalle)),
            precio: s.precio,
            moneda: s.moneda,
            baseOcupacion: s.baseOcupacion,
            cantidadBase: s.cantidadBase,
            precioTotal: s.precioTotal,
            capturadoEn: s.capturadoEn,
            vigenteHasta: s.vigenteHasta,
            orden: p._count.opciones,
          },
          select: { id: true },
        });
        return { id: fila.id, avisos: avisosDeBase(s.baseOcupacion, grupo), total: s.precioTotal, moneda: s.moneda };
      },
      { tenantId: gate.tenantId },
    );
    await auditAdmin({ action: "create", entity: "OpcionPresupuestoViaje", entityId: guardado.id, changes: { presupuestoId, tipo, proveedor: proveedorClave, referencia } });
    revalidatePath(VIAJES_PATH);
    const mensaje = [`Opción guardada (${guardado.moneda} ${guardado.total.toFixed(2)} en total).`, ...guardado.avisos].join(" ");
    return { ok: true, mensaje };
  } catch (e) {
    return toActionError(e);
  }
}
