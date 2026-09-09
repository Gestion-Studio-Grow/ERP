// ============================================================================
// PRESUPUESTOS DE VIAJE — glue SERVER (gate, proveedor por tenant, loaders Prisma).
// ============================================================================
//
// NO es "use server": acá viven los loaders de la página y la resolución del
// proveedor. Las MUTACIONES (Server Actions) están en `src/lib/viajes-actions.ts`,
// que importa de acá (Turbopack registra cualquier re-export de un archivo
// "use server" como action; por eso los tipos/loaders viven en este módulo).
//
// GATE COMPUESTO (lo aplican página y actions vía `exigirViajes(cap)`):
//   1. flag `VIAJES_ENABLED` prendido (rollout reversible),
//   2. la capability pedida (`quotes:read` para ver, `quotes:manage` para operar…), y
//   3. módulo `presupuestos-viaje` ASIGNADO al tenant (`Tenant.modules`, ADR-055): una
//      estética no tiene el armador aunque su OWNER tenga la capability. El buscador
//      exige además `buscador-ofertas-viaje` asignado (`exigirBuscador`).
//
// AISLAMIENTO (ADR-018): tenantId EXPLÍCITO en el predicado de toda query y
// `tenantTransaction` en toda escritura. DINERO (ADR-057): Decimal(14,2) en DB,
// number en memoria — la conversión `.toNumber()` se confina a este borde.
//
// NOTA Gate 2: la migración `20260909120000_add_viajes_presupuestos` NO está
// aplicada a Neon — los loaders detectan P2021/P2022 y la página muestra su
// estado honesto ("falta aplicar la migración") en vez de romper.

import { cache } from "react";
import { basePrisma } from "@/lib/prisma-base";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import type { Capability } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import type { SessionUser } from "@/lib/session";
import { MODULO_BUSCADOR_OFERTAS_VIAJE, MODULO_PRESUPUESTOS_VIAJE } from "@/modules/descriptors/viajes";
import {
  MemoriaCacheOfertas,
  MemoriaControlDeCuota,
  ProveedorConCache,
  registroPorDefecto,
  CLAVE_STUB,
  type CacheOfertas,
  type ControlDeCuota,
  type ProveedorOfertas,
} from "@/plugins/ofertas-viaje";
import { viajesCuotaDiaria, viajesEnabled, viajesProveedorClave } from "./flags";
import {
  estadoVigencia,
  resumirOpcion,
  type AsignacionNueva,
  type EstadoVigencia,
  type OfertaParaCalculo,
  type ResumenOpcion,
} from "./core";

// ── Gate compuesto ─────────────────────────────────────────────────────────────

export type GateViajes =
  | { ok: true; tenantId: string; user: SessionUser; modules: string[] }
  | { ok: false; error: string; motivo: "flag" | "modulo" };

/**
 * Exige flag + capability + módulo `presupuestos-viaje` asignado. `requireCapability`
 * redirige si no hay sesión / rol sin la capability; los otros dos motivos vuelven como
 * `ok:false` para que la página muestre 404 (flag) o el aviso (módulo) sin romper.
 */
export async function exigirViajes(cap: Capability): Promise<GateViajes> {
  if (!viajesEnabled()) {
    return { ok: false, error: "El módulo de presupuestos de viaje no está habilitado.", motivo: "flag" };
  }
  const user = await requireCapability(cap);
  const tenantId = await getCurrentTenantId();
  // Chequeo DURO sobre la asignación (Tenant.modules), independiente del flag del
  // registry: sin el módulo asignado, el armador no existe para ese tenant.
  const tenant = await basePrisma.tenant.findUnique({ where: { id: tenantId }, select: { modules: true } });
  const modules = tenant?.modules ?? [];
  if (!modules.includes(MODULO_PRESUPUESTOS_VIAJE)) {
    return { ok: false, error: "Presupuestos de viaje no está habilitado para este negocio.", motivo: "modulo" };
  }
  return { ok: true, tenantId, user, modules };
}

/** ¿El tenant tiene el plugin del buscador asignado? (Sin él: captura manual solamente.) */
export function tieneBuscador(modules: readonly string[]): boolean {
  return modules.includes(MODULO_BUSCADOR_OFERTAS_VIAJE);
}

// ── Proveedor por tenant (con caché + cuota) ──────────────────────────────────

// Caché y cuota EN MEMORIA, por proceso (ver nota de despliegue en
// src/plugins/ofertas-viaje/cache.ts). La versión persistida (tablas
// CacheBusquedaViaje / ConsumoProveedorViaje) reemplaza estas dos instancias sin
// tocar el resto: mismo puerto.
const cacheGlobal: CacheOfertas = new MemoriaCacheOfertas();
let cuotaGlobal: ControlDeCuota | null = null;

function cuota(): ControlDeCuota {
  if (!cuotaGlobal) cuotaGlobal = new MemoriaControlDeCuota(viajesCuotaDiaria());
  return cuotaGlobal;
}

export interface ProveedorResuelto {
  proveedor: ProveedorOfertas;
  /** Aviso si se cayó al stub por falta de credenciales del proveedor configurado. */
  aviso: string | null;
  /** Descripción del canal para `fuente` de la oferta capturada ("Amadeus (test)"). */
  fuente: string;
}

/**
 * Proveedor a usar para el tenant: el de `VIAJES_PROVEEDOR` si puede operar (tiene
 * credenciales); si no, el stub con aviso explícito (nunca se inventa un precio en
 * silencio). Envuelto en caché + cuota.
 */
export function proveedorParaTenant(tenantId: string, env: Record<string, string | undefined> = process.env): ProveedorResuelto {
  const registro = registroPorDefecto(env);
  const clave = viajesProveedorClave(env);
  let aviso: string | null = null;
  let interno = registro.tiene(clave) ? registro.proveedorPara(clave, tenantId) : null;
  if (!interno) {
    aviso =
      clave === CLAVE_STUB
        ? null
        : `El proveedor "${clave}" no tiene credenciales cargadas: se muestran datos simulados.`;
    interno = registro.proveedorPara(CLAVE_STUB, tenantId)!;
  }
  const fuente =
    interno.clave === "amadeus"
      ? `Buscador Amadeus (${env.AMADEUS_ENV?.trim().toLowerCase() === "production" ? "producción" : "test"})`
      : "Buscador simulado (datos de ejemplo)";
  return {
    proveedor: new ProveedorConCache(interno, tenantId, { cache: cacheGlobal, cuota: cuota() }),
    aviso,
    fuente,
  };
}

/** El caché compartido (para que la action de capturar re-lea la oferta del server, no del cliente). */
export function cacheOfertasGlobal(): CacheOfertas {
  return cacheGlobal;
}

// ── Loaders ───────────────────────────────────────────────────────────────────

export interface OfertaVista {
  id: string;
  tipo: string;
  titulo: string;
  proveedor: string;
  precio: number;
  moneda: string;
  unidad: string;
  baseOcupacion: string | null;
  ocupacion: number | null;
  noches: number | null;
  certeza: string;
  fuente: string;
  capturadoEn: Date;
  vigenteHasta: Date;
  vigenciaAsumida: boolean;
  vigencia: EstadoVigencia;
  condiciones: string | null;
}

export interface AsignacionVista {
  id: string;
  oferta: OfertaVista;
  pasajerosCubiertos: number;
  baseAplicada: string | null;
  cantidad: number;
}

export interface OpcionVista {
  id: string;
  nombre: string;
  orden: number;
  asignaciones: AsignacionVista[];
  resumen: ResumenOpcion;
}

export interface NivelVista {
  id: string;
  nombre: string;
  orden: number;
  opciones: OpcionVista[];
}

export interface PresupuestoVista {
  id: string;
  titulo: string;
  version: number;
  estado: string;
  vigenteHasta: Date | null;
  solicitud: {
    id: string;
    contactoNombre: string;
    cantidadPasajeros: number;
    monedaReferencia: string;
    tramos: Array<{ id: string; destino: string; desde: Date; hasta: Date }>;
  };
  niveles: NivelVista[];
  createdAt: Date;
}

export type PanelViajes =
  | { ok: true; presupuestos: PresupuestoVista[]; ofertas: OfertaVista[] }
  | { ok: false; migracionPendiente: true; error: string };

export function esMigracionPendiente(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
}

type OfertaDb = {
  id: string;
  tipo: string;
  titulo: string;
  proveedor: string;
  precio: { toNumber(): number };
  moneda: string;
  unidad: string;
  baseOcupacion: string | null;
  ocupacion: number | null;
  noches: number | null;
  certeza: string;
  fuente: string;
  capturadoEn: Date;
  vigenteHasta: Date;
  vigenciaAsumida: boolean;
  condiciones: string | null;
};

function ofertaVista(o: OfertaDb, ahora: Date): OfertaVista {
  return {
    id: o.id,
    tipo: o.tipo,
    titulo: o.titulo,
    proveedor: o.proveedor,
    precio: o.precio.toNumber(),
    moneda: o.moneda,
    unidad: o.unidad,
    baseOcupacion: o.baseOcupacion,
    ocupacion: o.ocupacion,
    noches: o.noches,
    certeza: o.certeza,
    fuente: o.fuente,
    capturadoEn: o.capturadoEn,
    vigenteHasta: o.vigenteHasta,
    vigenciaAsumida: o.vigenciaAsumida,
    vigencia: estadoVigencia(o.vigenteHasta, ahora),
    condiciones: o.condiciones,
  };
}

function paraCalculo(o: OfertaVista): OfertaParaCalculo {
  return {
    tipo: o.tipo as OfertaParaCalculo["tipo"],
    precio: o.precio,
    moneda: o.moneda,
    unidad: o.unidad as OfertaParaCalculo["unidad"],
    baseOcupacion: (o.baseOcupacion as OfertaParaCalculo["baseOcupacion"]) ?? null,
    ocupacion: o.ocupacion,
    noches: o.noches,
    vigenteHasta: o.vigenteHasta,
    certeza: o.certeza as OfertaParaCalculo["certeza"],
  };
}

/** Bandeja del tenant actual: presupuestos (con niveles/opciones/asignaciones) + biblioteca. */
export const cargarPanelViajes = cache(async (tenantId: string): Promise<PanelViajes> => {
  const ahora = new Date();
  try {
    const [presupuestos, ofertas] = await Promise.all([
      prisma.presupuestoViaje.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          solicitud: { include: { tramos: { where: { tenantId }, orderBy: { orden: "asc" } } } },
          niveles: {
            where: { tenantId },
            orderBy: { orden: "asc" },
            include: {
              opciones: {
                where: { tenantId },
                orderBy: { orden: "asc" },
                include: {
                  asignaciones: { where: { tenantId }, orderBy: { orden: "asc" }, include: { oferta: true } },
                },
              },
            },
          },
        },
      }),
      prisma.ofertaCapturadaViaje.findMany({
        where: { tenantId, activa: true },
        orderBy: { capturadoEn: "desc" },
        take: 30,
      }),
    ]);
    return {
      ok: true,
      ofertas: ofertas.map((o) => ofertaVista(o, ahora)),
      presupuestos: presupuestos.map((p) => ({
        id: p.id,
        titulo: p.titulo,
        version: p.version,
        estado: p.estado,
        vigenteHasta: p.vigenteHasta,
        createdAt: p.createdAt,
        solicitud: {
          id: p.solicitud.id,
          contactoNombre: p.solicitud.contactoNombre,
          cantidadPasajeros: p.solicitud.cantidadPasajeros,
          monedaReferencia: p.solicitud.monedaReferencia,
          tramos: p.solicitud.tramos.map((t) => ({ id: t.id, destino: t.destino, desde: t.desde, hasta: t.hasta })),
        },
        niveles: p.niveles.map((n) => ({
          id: n.id,
          nombre: n.nombre,
          orden: n.orden,
          opciones: n.opciones.map((op) => {
            const asignaciones: AsignacionVista[] = op.asignaciones.map((a) => ({
              id: a.id,
              oferta: ofertaVista(a.oferta, ahora),
              pasajerosCubiertos: a.pasajerosCubiertos,
              baseAplicada: a.baseAplicada,
              cantidad: a.cantidad,
            }));
            const paraResumen = op.asignaciones.map((a, i) => ({
              asignacion: {
                pasajerosCubiertos: a.pasajerosCubiertos,
                baseAplicada: (a.baseAplicada as AsignacionNueva["baseAplicada"]) ?? null,
                ocupacionAplicada: a.ocupacionAplicada,
                suplementoSingle: a.suplementoSingle ? a.suplementoSingle.toNumber() : null,
                cantidad: a.cantidad,
              },
              oferta: paraCalculo(asignaciones[i].oferta),
            }));
            return { id: op.id, nombre: op.nombre, orden: op.orden, asignaciones, resumen: resumirOpcion(paraResumen, ahora) };
          }),
        })),
      })),
    };
  } catch (e) {
    if (esMigracionPendiente(e)) {
      return {
        ok: false,
        migracionPendiente: true,
        error: "Falta aplicar la migración 20260909120000_add_viajes_presupuestos (paso del dueño). Cuando se aplique, el armador se enciende solo.",
      };
    }
    throw e;
  }
});
