"use server";

// ============================================================================
// ENVÍOS · ACCIONES — guardar la configuración, pausar y reabrir la tienda.
// ============================================================================
//
// Sólo quien administra los datos del negocio (el dueño: app «Datos del negocio», capacidad
// `location:manage`). El negocio sale de la sesión, nunca de lo que manda la pantalla; la
// escritura va en `tenantTransaction` serializable (RLS + control de versión de config.ts).
//
// Cada acción DEVUELVE el error (no lo tira): Next redacta en producción el mensaje de lo que se
// lanza, y el dueño necesita leer qué pasó y qué hacer.

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireAppAccion, AppNoDisponibleError } from "@/lib/require-app";
import { roleHasCapability } from "@/lib/capabilities";
import { motivoMostrable } from "@/lib/rechazo-de-dominio";
import { esConflictoDeEscritura } from "@/lib/conflicto-de-escritura";
import { logger } from "@/lib/logger";
import { guardarConfigEnviosEnTx, leerConfigEnvios, CAMBIO_MIENTRAS_MIRABAS_ENVIOS } from "./config";
import { validarConfigEnvios } from "./modelo";
import { ACCION_PAUSAR_TIENDA, ACCION_REABRIR_TIENDA } from "./marcas";

/** Lo que leen la configuración: la pantalla, la tienda y Vender (al instante, sin deploy). */
const RUTAS = ["/admin/localizacion/envios", "/admin/localizacion", "/admin/vender", "/tienda"];

export type EstadoEnvios = { ok: true; version: string; mensaje: string } | { ok: false; error: string };

async function dueno(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  try {
    const user = await requireAppAccion("datos-del-negocio");
    if (!roleHasCapability(user.role, "location:manage")) return { ok: false, error: "Los envíos los configura el dueño del negocio." };
    return { ok: true, userId: user.id };
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { ok: false, error: e.message };
    throw e;
  }
}

function motivo(e: unknown, scope: string): string {
  const m = motivoMostrable(e);
  if (m !== null) return m;
  if (esConflictoDeEscritura(e)) return CAMBIO_MIENTRAS_MIRABAS_ENVIOS;
  logger.error(scope, "falló por algo que no es un rechazo de dominio", e);
  return "No pudimos guardar los envíos. Probá de nuevo en un rato; si sigue, avisale a Gestión Studio Grow.";
}

function revalidar() {
  for (const ruta of RUTAS) revalidatePath(ruta);
}

/** Guarda la configuración entera de envíos (la pantalla Envíos). */
export async function guardarConfigEnvios(entrada: unknown): Promise<EstadoEnvios> {
  const quien = await dueno();
  if (!quien.ok) return quien;
  const o = (entrada ?? {}) as { config?: unknown; version?: unknown };
  const v = validarConfigEnvios(o.config);
  if (!v.ok) return { ok: false, error: v.error };
  const versionLeida = typeof o.version === "string" && o.version ? o.version : null;
  const tenantId = await getCurrentTenantId();
  try {
    const version = await tenantTransaction(
      (tx) => guardarConfigEnviosEnTx(tx, tenantId, { config: v.config, actor: `user:${quien.userId}`, versionLeida }),
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    revalidar();
    return { ok: true, version, mensaje: "Listo: la tienda y el mostrador ya usan estos envíos." };
  } catch (e) {
    return { ok: false, error: motivo(e, "envios.guardar") };
  }
}

/**
 * Pausa (con mensaje) o reabre la tienda SIN tocar el resto de la configuración: lee la vigente
 * dentro de la misma transacción y sólo cambia la pausa. También exige la versión leída.
 */
export async function pausarTienda(entrada: unknown): Promise<EstadoEnvios & { pausada?: { mensaje: string } | null }> {
  const quien = await dueno();
  if (!quien.ok) return quien;
  const o = (entrada ?? {}) as { pausar?: unknown; mensaje?: unknown; version?: unknown };
  const pausar = o.pausar === true;
  const mensaje = typeof o.mensaje === "string" ? o.mensaje : "";
  const versionLeida = typeof o.version === "string" && o.version ? o.version : null;
  const tenantId = await getCurrentTenantId();
  try {
    const r = await tenantTransaction(
      async (tx) => {
        const { version: _leida, ...config } = await leerConfigEnvios(tx, tenantId);
        void _leida; // la versión que vale es la que vio la pantalla (versionLeida)
        const nueva = { ...config, tiendaPausada: pausar ? { mensaje: mensaje.replace(/\s+/g, " ").trim() } : null };
        const version = await guardarConfigEnviosEnTx(tx, tenantId, {
          config: nueva,
          actor: `user:${quien.userId}`,
          versionLeida,
          accion: pausar ? ACCION_PAUSAR_TIENDA : ACCION_REABRIR_TIENDA,
        });
        return { version, pausada: nueva.tiendaPausada };
      },
      { tenantId, isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    revalidar();
    return {
      ok: true,
      version: r.version,
      pausada: r.pausada,
      mensaje: pausar ? "La tienda quedó pausada: nadie puede confirmar pedidos por la web." : "La tienda volvió a tomar pedidos.",
    };
  } catch (e) {
    return { ok: false, error: motivo(e, "envios.pausar") };
  }
}
