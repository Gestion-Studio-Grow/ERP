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

// MIA-194 · punto 1 (recorrido MIA-193): quien no puede abrir una app del panel vuelve a Inicio con el aviso, no con un rebote
// mudo. El parámetro sólo dice de qué app se habla; el porqué lo recalcula Inicio con la misma regla (no se lee del link).
const INICIO = "/admin/proyectos/inicio";
export const PARAMETRO_SIN_ACCESO = "sin-acceso";

/** Adónde vuelve quien no puede abrir `app`. Sin app, Inicio a secas. PURA. */
export function destinoSinAcceso(app: string | null | undefined): string {
  return app ? `${INICIO}?${PARAMETRO_SIN_ACCESO}=${encodeURIComponent(app)}` : INICIO;
}

/** Las apps del ERP que abre «Empresa · ver» (`MODULOS_DE_LA_APP`, gestion-core.ts). */
const APPS_DE_EMPRESA: ReadonlySet<string> = new Set(["cuentas-a-cobrar", "cuentas-a-pagar", "flujo-de-fondos"]);

/**
 * El aviso de Inicio. `no-prendida`: el negocio no tiene la app (módulo o edición); `rol`: la persona no la abre. Sin nombre
 * (un id que no es del registro), no hay aviso. PURA.
 */
export function textoSinAcceso(app: { id: string; nombre: string } | null | undefined, porque: "rol" | "no-prendida"): string | null {
  if (!app) return null;
  if (porque === "no-prendida") return `No pudiste abrir «${app.nombre}»: todavía no está prendida en este negocio. Pedile a GSG que la prenda.`;
  return APPS_DE_EMPRESA.has(app.id)
    ? `No pudiste abrir «${app.nombre}»: se abre con «Cuentas, cashflow y bancos» en tu rol de Proyectos. Pedíselo a Dirección.`
    : `No pudiste abrir «${app.nombre}»: tu rol de Proyectos no la abre. Si la necesitás, pedíselo a Dirección.`;
}
