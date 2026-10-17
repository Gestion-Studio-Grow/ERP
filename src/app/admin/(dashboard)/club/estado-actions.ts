"use server";

// ============================================================================
// ACCIONES DEL ESTADO DEL CLUB — leer y guardar la foto en la base, revisar y restaurar un respaldo (BP-3).
// ============================================================================
//
// La foto viaja COMPRIMIDA (gzip) en los dos sentidos: un mes de club lleno son ~3 MB de texto y ~150 KB en gzip.
// Sin comprimir no entraría en el límite de 1 MB del cuerpo de una server action (next.config no lo sube, y no
// conviene: es de toda la app) ni, con dos meses, en los 4,5 MB de respuesta de una función de Vercel.
//   · subir: `FormData` con el gzip como archivo (`foto` o `respaldo`) — binario, sin base64;
//   · bajar: el gzip en base64 (lo que serializa una respuesta de server action sin sorpresas).
// Se descomprime con tope (`TOPE_TEXTO`): un gzip chico que se infla a gigas no tumba el servidor.
//
// Guardia: `requireAppAccion("club")` (rol con agenda:manage, módulo `club` asignado al negocio). Restaurar y
// revisar un respaldo son de un dueño. El negocio sale de la sesión (`getCurrentTenantId`), nunca del navegador.
//
// — Elaborado por GSG

import { gunzipSync, gzipSync } from "node:zlib";
import { requireAppAccion, AppNoDisponibleError } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import type { SessionUser } from "@/lib/session";
import { guardar, leerVigente, restaurar, MENSAJE_CAMBIO_MIENTRAS_MIRABAS } from "@/lib/club/estado-repo";
import { leerSobre, resumenDelRespaldo, type ResumenDelRespaldo } from "@/lib/club/foto";

/** Lo más que se acepta comprimido (deja aire bajo el 1 MB del cuerpo de la acción). */
const TOPE_COMPRIMIDO = 900 * 1024;
/** Lo más que se acepta descomprimido (dos meses de club lleno son ~6 MB). */
const TOPE_TEXTO = 48 * 1024 * 1024;

export type RespuestaLeerFoto =
  | { ok: true; foto: null | { gzip: string; version: number; guardado: number | null; actualizada: string } }
  | { ok: false; error: string };

export type RespuestaGuardarFoto =
  | { ok: true; version: number }
  | { ok: false; motivo: "conflicto"; version: number; error: string }
  | { ok: false; motivo: "error"; error: string };

export type RespuestaRespaldo = { ok: true; version?: number; resumen: ResumenDelRespaldo } | { ok: false; error: string };

async function quien(): Promise<{ user: SessionUser; tenantId: string } | { error: string }> {
  try {
    const user = await requireAppAccion("club");
    return { user, tenantId: await getCurrentTenantId() };
  } catch (e) {
    if (e instanceof AppNoDisponibleError) return { error: e.message };
    throw e;
  }
}

/** El texto de un gzip subido en `campo`, o por qué no. */
async function textoSubido(datos: FormData, campo: string): Promise<{ texto: string } | { error: string }> {
  const archivo = datos.get(campo);
  if (!(archivo instanceof Blob)) return { error: "No llegó la foto del club." };
  if (archivo.size > TOPE_COMPRIMIDO) return { error: "La foto del club es demasiado grande para guardarla de una vez." };
  try {
    const texto = gunzipSync(Buffer.from(await archivo.arrayBuffer()), { maxOutputLength: TOPE_TEXTO }).toString("utf8");
    return { texto };
  } catch {
    return { error: "La foto del club llegó dañada: no se pudo leer." };
  }
}

/** La foto vigente del club (null si todavía no se guardó ninguna). */
export async function leerFotoDelClub(): Promise<RespuestaLeerFoto> {
  const q = await quien();
  if ("error" in q) return { ok: false, error: q.error };
  const foto = await leerVigente(q.tenantId);
  if (!foto) return { ok: true, foto: null };
  return {
    ok: true,
    foto: { gzip: gzipSync(foto.texto).toString("base64"), version: foto.version, guardado: foto.guardado, actualizada: foto.actualizada.toISOString() },
  };
}

/** Guarda la foto. `datos`: `foto` (el sobre en gzip) y `version` (la que se leyó). */
export async function guardarFotoDelClub(datos: FormData): Promise<RespuestaGuardarFoto> {
  const q = await quien();
  if ("error" in q) return { ok: false, motivo: "error", error: q.error };
  const version = Number(datos.get("version"));
  if (!Number.isInteger(version) || version < 0) return { ok: false, motivo: "error", error: "Falta la versión de lo que se leyó." };
  const subido = await textoSubido(datos, "foto");
  if ("error" in subido) return { ok: false, motivo: "error", error: subido.error };
  const r = await guardar(q.tenantId, subido.texto, version, `user:${q.user.id}`);
  if (r.ok) return { ok: true, version: r.version };
  if (r.motivo === "CAMBIO_MIENTRAS_MIRABAS") return { ok: false, motivo: "conflicto", version: r.version, error: MENSAJE_CAMBIO_MIENTRAS_MIRABAS };
  return { ok: false, motivo: "error", error: r.detalle };
}

/** Lo que trae un respaldo, SIN guardarlo (para mirarlo antes de restaurar). Sólo un dueño. */
export async function revisarRespaldoDelClub(datos: FormData): Promise<RespuestaRespaldo> {
  const q = await quien();
  if ("error" in q) return { ok: false, error: q.error };
  if (q.user.role !== "OWNER") return { ok: false, error: "Revisar y restaurar un respaldo lo hace un dueño." };
  const subido = await textoSubido(datos, "respaldo");
  if ("error" in subido) return { ok: false, error: subido.error };
  const l = leerSobre(subido.texto);
  if (!l.ok) return { ok: false, error: l.motivo };
  return { ok: true, resumen: resumenDelRespaldo(l.estado) };
}

/** Pone un respaldo (sobre v1) como estado vigente del club. Sólo un dueño. */
export async function restaurarRespaldoDelClub(datos: FormData): Promise<RespuestaRespaldo> {
  const q = await quien();
  if ("error" in q) return { ok: false, error: q.error };
  const subido = await textoSubido(datos, "respaldo");
  if ("error" in subido) return { ok: false, error: subido.error };
  const r = await restaurar(q.tenantId, subido.texto, { actor: `user:${q.user.id}`, rol: q.user.role });
  if (!r.ok) return { ok: false, error: r.detalle };
  return { ok: true, version: r.version, resumen: r.resumen };
}
