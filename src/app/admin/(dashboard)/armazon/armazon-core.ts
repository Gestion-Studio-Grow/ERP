// ============================================================================
// EL ARMAZÓN NUEVO — lo que se decide sin DOM. PURO, client-safe (sin el registro de apps).
// ============================================================================
//
// Decide con datos que el servidor YA calculó (las apps que la persona ve, su navegación):
//   · la tecla del rubro (la de la cápsula del celular y la de la cabecera en la PC);
//   · dónde aterriza cada rol (la cajera en Vender, la recepción en la Agenda, el dueño en su bandeja);
//   · el espacio y la app de la pantalla actual (qué se marca y cuál es el título en el celular).
// Lo prueba armazon-core.test.ts.

import type { AppDescriptor, NombreIcono } from "@/apps/contract";
import type { EspacioNavId } from "@/apps/espacios";
import { roleHasCapability, type Role } from "@/lib/capabilities";
import { hrefNuevoTurno } from "../turnos/pasos";

export interface AccionDelRubro {
  ruta: string;
  icono: NombreIcono;
  palabra: string;
  /** El atajo de la PC (F1). */
  atajo: string;
}

/**
 * La tecla del rubro:
 *   · Mostrador → «Vender», si esta persona ve la app Vender.
 *   · Estética (servicios) → «Dar un turno», si ve la Agenda Y puede crear turnos (agenda:manage):
 *     abre la lista con el alta ya desplegada (hrefNuevoTurno). El profesional ve su agenda pero no
 *     da turnos: para él no hay tecla (mostrar un botón que rebota es un callejón).
 *   · Si no hay acción, `null` (el lugar lo toma «Buscar»).
 */
export function accionDelRubro(
  apps: readonly Pick<AppDescriptor, "id" | "ruta" | "icono">[],
  esMostrador: boolean,
  role: Role,
): AccionDelRubro | null {
  if (esMostrador) {
    const vender = apps.find((a) => a.id === "vender");
    return vender ? { ruta: vender.ruta, icono: vender.icono, palabra: "Vender", atajo: "F1" } : null;
  }
  const agenda = apps.find((a) => a.id === "agenda");
  if (!agenda || !roleHasCapability(role, "agenda:manage")) return null;
  return { ruta: hrefNuevoTurno(), icono: agenda.icono, palabra: "Dar un turno", atajo: "F1" };
}

/**
 * Dónde aterriza cada rol (auditoría §18, dirección §4.3): la cajera y la recepción, en su PUESTO
 * (Vender, la Agenda de hoy); el dueño, en su bandeja (el Inicio). El profesional ya aterriza en su
 * agenda por `homeRoute`. Sólo si la persona ve esa app: si no, el Inicio de siempre.
 * Devuelve la ruta del puesto, o `null` si su casa es el Inicio.
 */
export function puestoDe(role: Role, esMostrador: boolean, appsVisibles: readonly Pick<AppDescriptor, "id" | "ruta">[]): string | null {
  if (role !== "RECEPTION") return null;
  const id = esMostrador ? "vender" : "agenda";
  return appsVisibles.find((a) => a.id === id)?.ruta ?? null;
}

// ── Navegación (la arma el servidor: armazon/navegacion.ts) ──────────────────

export interface AppDeNav {
  id: string;
  nombre: string;
  ruta: string;
  icono: NombreIcono;
  exacta?: boolean;
  /** Para qué sirve, en una línea (la hoja del espacio en el celular). */
  descripcion?: string;
}

export interface EspacioDeNav {
  id: EspacioNavId;
  nombre: string;
  /** Rótulo corto (cápsula, cabecera angosta). */
  rotulo: string;
  icono: NombreIcono;
  apps: AppDeNav[];
}

/** Espacio de una sola app: su botón abre la app, no una hoja con un renglón (A11). */
export function hrefDelEspacio(e: EspacioDeNav): string {
  return e.apps.length === 1 ? e.apps[0].ruta : `/admin?espacio=${e.id}`;
}

function normalizar(pathname: string): string {
  const sinQuery = pathname.split(/[?#]/, 1)[0];
  return sinQuery.length > 1 && sinQuery.endsWith("/") ? sinQuery.slice(0, -1) : sinQuery;
}

/**
 * La app de la pantalla actual y su espacio: la de ruta más larga que la cubre (las `exacta`,
 * sólo por igualdad), la misma regla que `appDeRuta` (src/apps/rutas.ts), pero sobre las apps de
 * la navegación de ESTA persona (el registro entero no viaja al navegador).
 */
export function dondeEstoy(
  pathname: string,
  espacios: readonly EspacioDeNav[],
): { espacio: EspacioDeNav; app: AppDeNav } | null {
  const path = normalizar(pathname);
  let mejor: { espacio: EspacioDeNav; app: AppDeNav } | null = null;
  for (const espacio of espacios) {
    for (const app of espacio.apps) {
      const cubre = app.exacta ? path === app.ruta : path === app.ruta || path.startsWith(app.ruta + "/");
      if (cubre && (!mejor || app.ruta.length > mejor.app.ruta.length)) mejor = { espacio, app };
    }
  }
  return mejor;
}

/** El espacio pedido en la página del espacio (`/admin?espacio=caja`), si es uno de los suyos. */
export function espacioPedido(pathname: string, espacioParam: string | null, espacios: readonly EspacioDeNav[]): EspacioDeNav | null {
  if (normalizar(pathname) !== "/admin" || !espacioParam) return null;
  return espacios.find((e) => e.id === espacioParam) ?? null;
}

/**
 * El título de la pantalla en el celular: el nombre de la app (nunca «Panel», auditoría 2.3); el
 * del espacio en su página; «Inicio» en el Inicio; y, si la ruta no es de ninguna app (una pantalla
 * interna), el nombre del negocio.
 */
export function tituloDePantalla(
  pathname: string,
  espacioParam: string | null,
  espacios: readonly EspacioDeNav[],
  negocio: string,
): string {
  const pedido = espacioPedido(pathname, espacioParam, espacios);
  if (pedido) return pedido.nombre;
  if (normalizar(pathname) === "/admin") return "Inicio";
  return dondeEstoy(pathname, espacios)?.app.nombre ?? negocio;
}

/** Las iniciales de una persona («Martín Aguirre» → «MA»; «Cecilia» → «CE»). */
export function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "·";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
