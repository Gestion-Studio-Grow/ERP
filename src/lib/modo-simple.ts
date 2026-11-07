// MODO SIMPLE del backoffice (Tanda 1, sólo CH): un recorte de pantallas por persona, nunca un
// permiso. Decisión: Factory-GSG/00-ESTADO/MODO-SIMPLE-DECISION.md §3–§4. PURO (sin Prisma ni
// cookies): lo usan la sesión, el layout, la agenda y `decidirCambioDePermiso`.
//
// DÓNDE SE GUARDA: una fila `ui:modo-simple` (allowed=true) en `UserPermissionOverride`. Sigue a la
// persona, viaja en `session.overrides` (src/lib/session.ts) y no pide migración. `permisoEfectivo`
// la IGNORA: sólo mira `CAPACIDADES_POR_USUARIO` (capabilities.ts), así que esta fila no puede dar
// ni sacar un permiso (test en modo-simple.test.ts). Sin la tabla (Gate 2), `overrides` llega `[]`:
// modo completo.
// DEUDA: mezcla una preferencia con la matriz de permisos. Con una segunda preferencia, pasar a una
// columna `User.preferencias Json?` (migración aditiva, Gate 2).
//
// «VER TODO»: sale al modo completo SÓLO en esta sesión del navegador (cookie de sesión), sin tocar
// lo guardado. Así nadie queda trabado en simple: salir es un toque y el próximo ingreso vuelve a
// simple. «Ver menos» (perfil propio) y la casilla de Usuarios cambian lo guardado.

import type { PermisoOverride } from "@/lib/capabilities";

export const PREFERENCIA_MODO_SIMPLE = "ui:modo-simple" as const;

/** Las únicas preferencias de interfaz que acepta la tabla de excepciones. Cerrada a propósito. */
export const PREFERENCIAS_UI = [PREFERENCIA_MODO_SIMPLE] as const;
export type PreferenciaUi = (typeof PREFERENCIAS_UI)[number];

/** Prefijo reservado a preferencias de interfaz: nunca nombra una capability. */
export const PREFIJO_UI = "ui:";

export function esPreferenciaUi(clave: string): clave is PreferenciaUi {
  return (PREFERENCIAS_UI as readonly string[]).includes(clave);
}

type ConOverrides = { overrides?: ReadonlyArray<PermisoOverride> | null } | null | undefined;

/** ¿La persona tiene guardado el modo simple? Sin sesión o sin fila: no. */
export function prefiereModoSimple(user: ConOverrides): boolean {
  return (user?.overrides ?? []).some((o) => o.capability === PREFERENCIA_MODO_SIMPLE && o.allowed === true);
}

/**
 * ¿Esta pantalla se dibuja en modo simple? Lo guardado, salvo que en esta sesión haya tocado
 * «Ver todo» (`verTodo`).
 */
export function esModoSimple(user: ConOverrides, opciones: { verTodo?: boolean } = {}): boolean {
  return prefiereModoSimple(user) && opciones.verTodo !== true;
}

// ── «Ver todo» / «Corregir en modo completo» ───────────────────────────────────

/** Cookie de SESIÓN (sin vencimiento): «Ver todo» vale hasta cerrar el navegador. */
export const COOKIE_VER_TODO = "gsg-ver-todo";
/** La ruta que prende o apaga «Ver todo» y vuelve a donde estaba (src/app/admin/modo-completo/route.ts). */
export const RUTA_MODO_COMPLETO = "/admin/modo-completo";

/**
 * A dónde se vuelve después de cambiar de modo. Sólo rutas del panel (`/admin…`), nunca otro sitio:
 * sin `//`, sin barra invertida y sin caracteres de control (redirección abierta). Si no, el Inicio.
 */
export function destinoSeguro(volver: unknown): string {
  if (typeof volver !== "string" || volver.length > 512) return "/admin";
  if (!(volver === "/admin" || volver.startsWith("/admin/") || volver.startsWith("/admin?"))) return "/admin";
  // eslint-disable-next-line no-control-regex
  if (volver.includes("//") || volver.includes("\\") || /[\u0000-\u001f\u007f]/.test(volver)) return "/admin";
  return volver;
}

/** Link que sale al modo completo (en esta sesión) y abre `volver`. */
export function hrefModoCompleto(volver: string): string {
  return `${RUTA_MODO_COMPLETO}?volver=${encodeURIComponent(destinoSeguro(volver))}`;
}

/** Link que vuelve al modo simple guardado (borra «Ver todo») y abre `volver`. */
export function hrefVolverASimple(volver: string): string {
  return `${RUTA_MODO_COMPLETO}?simple=1&volver=${encodeURIComponent(destinoSeguro(volver))}`;
}

// ── La agenda en modo simple ───────────────────────────────────────────────────

/**
 * Lo raro de la plata queda en modo completo (decisión §1.4): anular un cobro, dar de baja un saldo,
 * deshacer un cierre y cerrar en lote. En simple se esconden esos botones y aparece «Corregir en
 * modo completo». ESCONDER NO ES PROHIBIR: el servidor sigue exigiendo lo de siempre, y lo que
 * quien mira no puede hacer, en completo tampoco se le ofrece. Nunca agrega nada.
 */
export function recortarPermisosDeAgenda<P extends { perdonar: boolean; anular: unknown }>(
  permisos: P,
  simple: boolean,
): P & { modoSimple?: true } {
  if (!simple) return permisos;
  return { ...permisos, perdonar: false, anular: null, modoSimple: true };
}
