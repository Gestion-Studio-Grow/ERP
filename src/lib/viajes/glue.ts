// ============================================================================
// PRESUPUESTOS DE VIAJE — glue SERVER (proveedor por tenant + loaders Prisma).
// ============================================================================
//
// NO es "use server": acá viven los loaders de la página y la resolución del
// proveedor. Las MUTACIONES (Server Actions) están en `src/lib/viajes-actions.ts`,
// que importa de acá (Turbopack registra cualquier re-export de un archivo
// "use server" como action; por eso los tipos/loaders viven en este módulo).
//
// GATE COMPUESTO (lo aplican página y actions vía `exigirViajes`):
//   1. flag `VIAJES_ENABLED` prendido (rollout reversible),
//   2. capability `viajes:manage` (RBAC, ADR-017 — solo OWNER), y
//   3. módulo `viajes` ASIGNADO al tenant (`Tenant.modules`, ADR-055): una estética
//      no tiene el armador aunque su OWNER tenga la capability.
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
import { getCurrentTenantId } from "@/lib/tenant";
import type { SessionUser } from "@/lib/session";
import { MODULO_VIAJES } from "@/modules/descriptors/viajes";
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
import { estadoVigencia, type EstadoVigencia } from "./core";

// ── Gate compuesto ─────────────────────────────────────────────────────────────

export type GateViajes =
  | { ok: true; tenantId: string; user: SessionUser }
  | { ok: false; error: string; motivo: "flag" | "modulo" };

/**
 * Exige flag + capability + módulo asignado. `requireCapability` redirige si no hay
 * sesión / rol sin la capability; los otros dos motivos vuelven como `ok:false` para
 * que la página muestre 404 (flag) o el aviso (módulo) sin romper.
 */
export async function exigirViajes(): Promise<GateViajes> {
  if (!viajesEnabled()) {
    return { ok: false, error: "El módulo de presupuestos de viaje no está habilitado.", motivo: "flag" };
  }
  const user = await requireCapability("viajes:manage");
  const tenantId = await getCurrentTenantId();
  // Chequeo DURO sobre la asignación (Tenant.modules), independiente del flag del
  // registry: sin el módulo `viajes` asignado, el armador no existe para ese tenant.
  const tenant = await basePrisma.tenant.findUnique({ where: { id: tenantId }, select: { modules: true } });
  if (!tenant?.modules?.includes(MODULO_VIAJES)) {
    return { ok: false, error: "Presupuestos de viaje no está habilitado para este negocio.", motivo: "modulo" };
  }
  return { ok: true, tenantId, user };
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
  return {
    proveedor: new ProveedorConCache(interno, tenantId, { cache: cacheGlobal, cuota: cuota() }),
    aviso,
  };
}

/** El caché compartido (para que la action de guardar re-lea la oferta del server, no del cliente). */
export function cacheOfertasGlobal(): CacheOfertas {
  return cacheGlobal;
}

// ── Loaders ───────────────────────────────────────────────────────────────────

export interface OpcionVista {
  id: string;
  tipo: "VUELO" | "HOTEL";
  proveedor: string;
  descripcion: string;
  precio: number;
  moneda: string;
  baseOcupacion: string;
  cantidadBase: number;
  precioTotal: number;
  capturadoEn: Date;
  vigenteHasta: Date | null;
  vigencia: EstadoVigencia;
}

export interface PresupuestoVista {
  id: string;
  titulo: string;
  destino: string;
  fechaSalida: Date | null;
  fechaRegreso: Date | null;
  adultos: number;
  ninos: number;
  habitaciones: number;
  estado: string;
  clienteNombre: string | null;
  opciones: OpcionVista[];
  createdAt: Date;
}

export type PanelViajes =
  | { ok: true; presupuestos: PresupuestoVista[] }
  | { ok: false; migracionPendiente: true; error: string };

export function esMigracionPendiente(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
}

/** Presupuestos del tenant actual con sus opciones (predicado tenantId explícito). */
export const cargarPanelViajes = cache(async (tenantId: string): Promise<PanelViajes> => {
  const ahora = new Date();
  try {
    const filas = await prisma.presupuestoViaje.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        client: { select: { name: true } },
        opciones: { where: { tenantId }, orderBy: [{ orden: "asc" }, { createdAt: "asc" }] },
      },
    });
    return {
      ok: true,
      presupuestos: filas.map((p) => ({
        id: p.id,
        titulo: p.titulo,
        destino: p.destino,
        fechaSalida: p.fechaSalida,
        fechaRegreso: p.fechaRegreso,
        adultos: p.adultos,
        ninos: p.ninos,
        habitaciones: p.habitaciones,
        estado: p.estado,
        clienteNombre: p.client?.name ?? null,
        createdAt: p.createdAt,
        opciones: p.opciones.map((o) => ({
          id: o.id,
          tipo: o.tipo,
          proveedor: o.proveedor,
          descripcion: o.descripcion,
          precio: o.precio.toNumber(),
          moneda: o.moneda,
          baseOcupacion: o.baseOcupacion,
          cantidadBase: o.cantidadBase,
          precioTotal: o.precioTotal.toNumber(),
          capturadoEn: o.capturadoEn,
          vigenteHasta: o.vigenteHasta,
          vigencia: estadoVigencia({ vigenteHasta: o.vigenteHasta }, ahora),
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
