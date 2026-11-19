// MIA-50 T11 · Adenda 2 (C-CF1, C-CF2): la puerta del rol de Proyectos para una app del ERP que entra al panel de la
// productora (Cuentas a cobrar, Cuentas a pagar, Flujo de fondos). El menú ya la filtra en el layout, pero el layout sin
// el header `x-pathname` no frena y `requireApp` sólo mira el rol del ERP, el módulo y el panel: la regla del rol de
// Proyectos tiene que vivir también en la página y en la acción. PURA; el servidor: `puerta-de-gestion.server.ts`.

import { permisoDe, type ModuloGestion, type RolGestion } from "./gestion-core";

type Guardados = readonly { rol: string; modulo: string; ver: boolean; editar: boolean }[];

export const SIN_PUERTA_DE_GESTION = "Esto se abre con «Cuentas, cashflow y bancos» en tu rol de Proyectos. Pedíselo a Dirección.";

/**
 * ¿Pasa? Fuera del panel de Proyectos (CH y el resto, `panel` ≠ "proyectos") no cambia nada: la decide `requireApp` como
 * siempre. Adentro, sin actor (sin ficha que leer, o sin permiso de agenda) no pasa; con actor, manda la matriz (`permisoDe`,
 * lo guardado por Dirección encima de lo de fábrica). PURA.
 */
export function puertaDeGestionAbierta(panel: string | null, actor: { rol: RolGestion; permisos: Guardados } | null, modulo: ModuloGestion, nivel: "ver" | "editar"): boolean {
  if (panel !== "proyectos") return true;
  if (!actor) return false;
  return permisoDe(actor.rol, modulo, actor.permisos)[nivel];
}
