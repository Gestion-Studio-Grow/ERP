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
// Se descomprime con tope (`TOPE_TEXTO`, 10 MB, estado-subida.ts): un gzip chico que se infla a gigas no tumba el
// servidor.
//
// Guardia: `requireAppAccion("club")` (rol con agenda:manage, módulo `club` asignado al negocio). Restaurar y
// revisar un respaldo son de un dueño. El negocio sale de la sesión (`getCurrentTenantId`), nunca del navegador.
//
// LO QUE ESTE SERVIDOR NO SABE (deuda, PARIDAD-REACT.md §«Lo que el servidor no controla»). En el «modo foto»
// `guardarFotoDelClub` recibe el estado ENTERO de cualquier usuario con `agenda:manage`: no distingue un guardado
// de un restaurar ni sabe qué cambió. La regla G8 (lo delicado —usuarios y PIN, precios, restaurar, limpiar— es
// del dueño) la hace cumplir la PANTALLA (el motor y el almacén piden el PIN de un dueño); desde el 21/10, para
// usuarios y PIN, también esta acción: si no guarda un OWNER del ERP se conservan los de la foto vigente
// (`conservarLoDelicado`, src/lib/club/delicado.ts). Desde la vuelta 5 de CERT-B4 (F5), también lo de «Reglas y
// precios» y «Avisos» que mueve plata o permisos (firma de caja, precios, seña, fondo, alias…: `CONFIG_DELICADA`).
// Lo demás (movimientos, turnos) sigue en la pantalla. La
// pantalla restaura con `almacen.restaurar` → `guardarYa()`, o sea por `guardarFotoDelClub`: `revisar…` y
// `restaurarRespaldoDelClub` no las usa hoy ninguna pantalla (sí los tests). Se cierra con los comandos / el back
// separado (G10).
//
// SEG-020: el PIN guardado de un dueño del club no sale del servidor, para ninguna sesión. `leerFotoDelClub` lo baja
// como la marca `"srv:"` (con su `pinLargo`) y `guardarFotoDelClub` lo repone de la foto vigente SIEMPRE, también
// para un OWNER (src/lib/club/pin-servidor.ts); si guarda alguien que no es OWNER, después sigue `conservarLoDelicado`.
// Restaurar un respaldo con la marca también la repone de la vigente. La firma de un dueño se verifica en
// firma-del-duenio-actions.ts.
//
// — Elaborado por GSG

import { gzipSync } from "node:zlib";
import { requireAppAccion, AppNoDisponibleError } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import type { SessionUser } from "@/lib/session";
import { guardar, leerMetaVigente, leerVigente, restaurar, MENSAJE_CAMBIO_MIENTRAS_MIRABAS } from "@/lib/club/estado-repo";
import { leerSobre, resumenDelRespaldo, type ResumenDelRespaldo } from "@/lib/club/foto";
import { huellaDePin, ocultarPinesDeDuenio, reponerPinesDeDuenio } from "@/lib/club/pin-servidor";
import { borrarPinesFuertes, fuertesParaBorrar, leerPinesFuertes } from "@/lib/club/tope-pin-servidor";
import { leerRespaldo } from "./configuracion-core";
import { textoSubido } from "./estado-subida";

const SOLO_DUENIO = "Restaurar un respaldo lo hace un dueño.";

export type RespuestaLeerFoto =
  | { ok: true; foto: null | { gzip: string; version: number; guardado: number | null; actualizada: string } }
  | { ok: false; error: string };

/** El latido de los puestos: sólo la versión vigente (0 = nunca se guardó), sin la foto. */
export type RespuestaLeerVersion = { ok: true; version: number } | { ok: false; error: string };

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

/**
 * Si el respaldo es de OTRO club o es la DEMO, por qué no se restaura (null si se puede). El MISMO control que la
 * pantalla (`leerRespaldo(texto, actual)`, configuracion-core.ts), contra la foto vigente de ESTE negocio: el sobre
 * v1 no dice de qué negocio es (FORMATO-RESPALDO.md), así que se compara el nombre del club y los PIN de ejemplo.
 * Sin foto vigente no hay con qué comparar y se deja pasar, como la pantalla.
 */
async function motivoDeRespaldoAjeno(tenantId: string, texto: string): Promise<string | null> {
  const vigente = await leerVigente(tenantId);
  const actual = vigente ? leerSobre(vigente.texto) : null;
  const l = leerRespaldo(texto, actual?.ok ? actual.estado : null);
  return l.ok ? null : l.mensaje;
}

/** La foto vigente del club (null si todavía no se guardó ninguna). */
export async function leerFotoDelClub(): Promise<RespuestaLeerFoto> {
  const q = await quien();
  if ("error" in q) return { ok: false, error: q.error };
  const foto = await leerVigente(q.tenantId);
  if (!foto) return { ok: true, foto: null };
  const texto = ocultarPinesDeDuenio(foto.texto);
  if (texto === null) return { ok: false, error: "No se pudo leer lo guardado del club: probá de nuevo en un rato." };
  return {
    ok: true,
    foto: { gzip: gzipSync(texto).toString("base64"), version: foto.version, guardado: foto.guardado, actualizada: foto.actualizada.toISOString() },
  };
}

/**
 * La versión vigente del club, SIN la foto (dos puestos, Tanda 1B). Cada puesto la pregunta cada 15 s con la pestaña
 * visible: si avanzó, baja la foto y re-aplica lo suyo encima. Lee `id` + `action` (unos bytes por fila), nunca
 * `changes`: cuida el plan gratuito de Neon. Misma guardia que leer la foto; el negocio sale de la sesión.
 */
export async function leerVersionDelClub(): Promise<RespuestaLeerVersion> {
  const q = await quien();
  if ("error" in q) return { ok: false, error: q.error };
  const meta = await leerMetaVigente(q.tenantId);
  return { ok: true, version: meta?.version ?? 0 };
}

/** Guarda la foto. `datos`: `foto` (el sobre en gzip) y `version` (la que se leyó). */
export async function guardarFotoDelClub(datos: FormData): Promise<RespuestaGuardarFoto> {
  const q = await quien();
  if ("error" in q) return { ok: false, motivo: "error", error: q.error };
  const version = Number(datos.get("version"));
  if (!Number.isInteger(version) || version < 0) return { ok: false, motivo: "error", error: "Falta la versión de lo que se leyó." };
  const subido = await textoSubido(datos, "foto");
  if ("error" in subido) return { ok: false, motivo: "error", error: subido.error };
  // G8: si no guarda un dueño del ERP, los usuarios, los PIN y la configuración que mueve plata o permisos (firma de
  // caja, precios, seña, fondo, alias) quedan como en la foto vigente (ningún PIN cambia por acá: «Cambiar mi PIN» va por pin-del-club-actions.ts). Un guardado
  // de la tablet de recepción no puede pisar PIN ni bajar la firma de caja a 2 (src/lib/club/delicado.ts).
  // SEG-020: los PIN de dueño llegan con la marca y se reponen de la vigente (o su h2 pendiente), para cualquier sesión.
  let texto = subido.texto;
  const vigente = await leerVigente(q.tenantId);
  const fuertes = vigente ? await leerPinesFuertes(q.tenantId) : new Map<string, { de: string; h2: string }>();
  if (vigente) {
    const c = reponerPinesDeDuenio(vigente.texto, texto, { esOwner: q.user.role === "OWNER", fuertes });
    texto = c.texto;
    // Es un evento de seguridad: llegaron usuarios, PIN o reglas que esta sesión no puede cambiar (queda en los logs).
    if (c.corregido) console.warn("[club] G8/SEG-020: guardado con usuarios/PIN/reglas que no se aceptan; se conservaron los de la base", { tenantId: q.tenantId, userId: q.user.id, rol: q.user.role });
  }
  const r = await guardar(q.tenantId, texto, version, `user:${q.user.id}`);
  if (r.ok) {
    await limpiarFuertes(q.tenantId, fuertes, texto);
    return { ok: true, version: r.version };
  }
  if (r.motivo === "CAMBIO_MIENTRAS_MIRABAS") return { ok: false, motivo: "conflicto", version: r.version, error: MENSAJE_CAMBIO_MIENTRAS_MIRABAS };
  return { ok: false, motivo: "error", error: r.detalle };
}

/** Borra los h2 pendientes que ya quedaron aplicados (o viejos) en lo que se guardó. No frena el guardado. */
async function limpiarFuertes(tenantId: string, fuertes: ReadonlyMap<string, { de: string; h2: string }>, guardado: string): Promise<void> {
  if (!fuertes.size) return;
  try {
    const us = (JSON.parse(guardado) as { estado?: { usuarios?: { id?: unknown; pin?: unknown }[] } }).estado?.usuarios ?? [];
    const pinDe = (id: string) => {
      const p = us.find((u) => u?.id === id)?.pin;
      return typeof p === "string" ? p : undefined;
    };
    await borrarPinesFuertes(tenantId, fuertesParaBorrar(fuertes, pinDe, huellaDePin));
  } catch (e) {
    console.warn("[club] SEG-020: no se pudieron limpiar los PIN fuertes aplicados", { tenantId, error: e instanceof Error ? e.message : "?" });
  }
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
  const ajeno = await motivoDeRespaldoAjeno(q.tenantId, subido.texto);
  if (ajeno) return { ok: false, error: ajeno };
  return { ok: true, resumen: resumenDelRespaldo(l.estado) };
}

/** Pone un respaldo (sobre v1) como estado vigente del club. Sólo un dueño. */
export async function restaurarRespaldoDelClub(datos: FormData): Promise<RespuestaRespaldo> {
  const q = await quien();
  if ("error" in q) return { ok: false, error: q.error };
  // El rol se mira primero (también lo mira el repositorio): a la recepción no se le dice nada del respaldo.
  if (q.user.role !== "OWNER") return { ok: false, error: SOLO_DUENIO };
  const subido = await textoSubido(datos, "respaldo");
  if ("error" in subido) return { ok: false, error: subido.error };
  if (leerSobre(subido.texto).ok) {
    const ajeno = await motivoDeRespaldoAjeno(q.tenantId, subido.texto);
    if (ajeno) return { ok: false, error: ajeno };
  }
  // SEG-020: un respaldo bajado de la pantalla trae los PIN de dueño con la marca: se reponen de la vigente.
  let texto = subido.texto;
  const vigente = await leerVigente(q.tenantId);
  if (vigente) texto = reponerPinesDeDuenio(vigente.texto, texto, { esOwner: true, fuertes: await leerPinesFuertes(q.tenantId) }).texto;
  const r = await restaurar(q.tenantId, texto, { actor: `user:${q.user.id}`, rol: q.user.role });
  if (!r.ok) return { ok: false, error: r.detalle };
  return { ok: true, version: r.version, resumen: r.resumen };
}
