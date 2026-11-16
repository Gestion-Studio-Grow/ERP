"use server";

// ============================================================================
// ACCIONES DEL TORNEO — leer y cambiar el torneo guardado en la base (GSG-PLAT-016).
// ============================================================================
//
// Guardia, en este orden y en CADA acción: `requireAppAccion("torneo")` (sesión del ERP + módulo `torneo` del
// negocio), después el permiso del torneo del usuario (src/lib/torneo-wpe/permisos.ts: el jugador sólo ve; el
// agente carga resultados y W.O.; el organizador y el dueño gestionan). El negocio sale de la sesión
// (`getCurrentTenantId`), nunca del navegador. El navegador manda un COMANDO y la versión que vio; el estado lo
// arma el servidor con el motor del sitio (src/lib/torneo-wpe/estado-repo.ts).
//
// — Elaborado por GSG

import { requireAppAccion, AppNoDisponibleError } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import type { SessionUser } from "@/lib/session";
import { leerComando, permisoQuePide } from "@/lib/torneo-wpe/comandos";
import { crearRepoDelTorneo, MENSAJE_CAMBIO_MIENTRAS_MIRABAS, type PedidoDeMutacion } from "@/lib/torneo-wpe/estado-repo";
import { motorDelTorneo } from "@/lib/torneo-wpe/motor.server";
import { nivelEnElTorneo, puedeEnElTorneo, type PermisoTorneo } from "@/lib/torneo-wpe/permisos";
import { vistaDelTorneo, type VistaDelTorneo } from "@/lib/torneo-wpe/vista";

const repo = crearRepoDelTorneo(() => motorDelTorneo());

export type RespuestaLeerTorneo =
  | { ok: true; version: number; nivel: PermisoTorneo; vista: VistaDelTorneo | null; actualizada: string | null }
  | { ok: false; error: string };

export type RespuestaVersion = { ok: true; version: number } | { ok: false; error: string };

export type RespuestaMutar =
  | { ok: true; version: number; advertencias: string[] }
  | { ok: false; motivo: "conflicto"; version: number; error: string }
  | { ok: false; motivo: "permiso" | "error"; error: string };

const SIN_PERMISO: Record<Exclude<PermisoTorneo, "ver">, string> = {
  resultados: "Tu usuario puede mirar el torneo, pero no cargar resultados. Pedíselo al organizador.",
  gestionar: "Borrar un resultado, reprogramar o generar el torneo lo hace el organizador.",
};

async function quien(): Promise<{ user: SessionUser; tenantId: string } | { error: string }> {
  try {
    const user = await requireAppAccion("torneo");
    return { user, tenantId: await getCurrentTenantId() };
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { error: e.message };
    throw e;
  }
}

/** El torneo vigente del negocio, proyectado a una categoría (null si todavía no se generó). */
export async function leerTorneo(categoria?: string | null): Promise<RespuestaLeerTorneo> {
  const q = await quien();
  if ("error" in q) return { ok: false, error: q.error };
  const vigente = await repo.leerVigente(q.tenantId);
  return {
    ok: true,
    version: vigente?.version ?? 0,
    nivel: nivelEnElTorneo(q.user),
    vista: vigente ? vistaDelTorneo(vigente.torneo, typeof categoria === "string" ? categoria : null) : null,
    actualizada: vigente ? vigente.actualizada.toISOString() : null,
  };
}

/** Sólo la versión vigente (el latido de la pantalla: lee `id` + `action`, nunca la foto). */
export async function leerVersionDelTorneo(): Promise<RespuestaVersion> {
  const q = await quien();
  if ("error" in q) return { ok: false, error: q.error };
  return { ok: true, version: await repo.leerVersion(q.tenantId) };
}

async function mutar(q: { user: SessionUser; tenantId: string }, pedido: PedidoDeMutacion, version: unknown): Promise<RespuestaMutar> {
  const v = Number(version);
  if (!Number.isInteger(v) || v < 0) return { ok: false, motivo: "error", error: "Falta la versión de lo que se leyó." };
  const r = await repo.mutar(q.tenantId, { pedido, versionEsperada: v, actor: `user:${q.user.id}` });
  if (r.ok) return { ok: true, version: r.version, advertencias: r.advertencias };
  if (r.motivo === "CAMBIO_MIENTRAS_MIRABAS") return { ok: false, motivo: "conflicto", version: r.version, error: MENSAJE_CAMBIO_MIENTRAS_MIRABAS };
  return { ok: false, motivo: "error", error: r.errores.join(" ") };
}

/** Cargar un resultado, marcar un W.O., borrar un resultado o reprogramar un partido. */
export async function cambiarTorneo(entrada: { comando: unknown; version: unknown }): Promise<RespuestaMutar> {
  const q = await quien();
  if ("error" in q) return { ok: false, motivo: "permiso", error: q.error };
  const l = leerComando(entrada?.comando);
  if (!l.ok) return { ok: false, motivo: "error", error: l.error };
  const pide = permisoQuePide(l.comando.tipo);
  if (!puedeEnElTorneo(q.user, pide)) return { ok: false, motivo: "permiso", error: SIN_PERMISO[pide as Exclude<PermisoTorneo, "ver">] };
  return mutar(q, l.comando, entrada?.version);
}

/** Genera el torneo de demostración del sitio (el que vio el cliente) si el negocio todavía no tiene torneo. */
export async function generarTorneo(version: unknown): Promise<RespuestaMutar> {
  const q = await quien();
  if ("error" in q) return { ok: false, motivo: "permiso", error: q.error };
  if (!puedeEnElTorneo(q.user, "gestionar")) return { ok: false, motivo: "permiso", error: SIN_PERMISO.gestionar };
  return mutar(q, { tipo: "generar" }, version);
}
