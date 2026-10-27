// ============================================================================
// EL BUSCADOR GLOBAL «/» — cuándo se abre y qué encuentra además de personas. PURO, client-safe.
// ============================================================================
//
// Reingeniería CH, Tanda 2 (§2.1 «Buscador global → «/» desde cualquier pantalla: clientas y turnos
// por nombre o teléfono»). Lo usan los dos armazones: el de siempre (CH con «Diseño nuevo» apagado,
// BuscadorGlobal.tsx) y el nuevo (ArmazonNuevo.tsx).
//
// «/» NUNCA le roba la tecla a quien escribe: en un campo, un área de texto, un desplegable o algo
// editable, la barra es una barra. Tampoco con Ctrl/⌘/Alt (atajos del navegador) ni si otro ya la
// atendió (`defaultPrevented`).

import type { Comando } from "@/components/ui/comandos-core";

/** El evento con el que cualquier botón «Buscar» de una pantalla abre el buscador global. */
export const EVENTO_BUSCAR = "gsg:buscar";

/** Para un botón de una pantalla (la lupa del celular, «Buscar /» de la agenda). */
export function abrirBuscadorGlobal(): void {
  window.dispatchEvent(new Event(EVENTO_BUSCAR));
}

/** Lo que mira el atajo de una tecla (un KeyboardEvent alcanza). */
export interface TeclaApretada {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
  target: unknown;
}

const EDITABLE = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/** ¿El foco está donde se escribe? */
export function escribiendoEn(target: unknown): boolean {
  const el = target as { closest?: (s: string) => unknown; isContentEditable?: boolean } | null;
  if (!el || typeof el.closest !== "function") return false;
  return el.isContentEditable === true || el.closest(EDITABLE) !== null;
}

/** ¿Esta tecla abre el buscador? «/» suelta, fuera de un campo. */
export function esAtajoDeBuscar(e: TeclaApretada): boolean {
  if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.defaultPrevented || e.isComposing) return false;
  return !escribiendoEn(e.target);
}

/** ¿El negocio da turnos y quien mira ve la agenda? Sólo entonces hay clientas y turnos que buscar. */
export function veLaAgenda(rutas: readonly string[]): boolean {
  return rutas.some((r) => r === "/admin/turnos" || r.startsWith("/admin/turnos/"));
}

/** El menú de la barra como comandos de la paleta: «/» también lleva a «Caja», «Clientes»… */
export function comandosDelMenu(menu: readonly { href: string; label: string }[]): Comando[] {
  return menu.map((m) => ({ id: `menu-${m.href}`, grupo: "apps" as const, nombre: m.label, href: m.href }));
}
