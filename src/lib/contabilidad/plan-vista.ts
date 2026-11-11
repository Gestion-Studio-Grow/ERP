// ============================================================================
// FC-01 · lo que las pantallas de Plan de cuentas y Ejercicio necesitan calcular. PURO.
// ============================================================================
//
// El resultado de una acción vuelve a la pantalla como un CÓDIGO en la URL (`?r=`), nunca como
// texto: el mensaje sale de esta tabla fija, así nadie arma un link que muestre otra cosa.

import type { CuentaDelPlan, EjercicioListado } from "./repo-plan";
import { ROLES_CUENTA, type RolCuenta } from "./roles";

export interface FilaDelArbol {
  cuenta: CuentaDelPlan;
  /** 0 para las cinco grandes ramas; uno más por cada nivel del código. */
  nivel: number;
  /** Se le pueden colgar cuentas de detalle (la misma regla que `agregarHoja`). */
  aceptaHojas: boolean;
}

/** El plan como árbol aplanado, en el orden en que llega (por código). */
export function filasDelArbol(cuentas: readonly CuentaDelPlan[]): FilaDelArbol[] {
  const agrupaAgrupadores = new Set(cuentas.filter((c) => !c.imputable && c.padreId).map((c) => c.padreId));
  return cuentas.map((cuenta) => ({
    cuenta,
    nivel: cuenta.codigo.split(".").length - 1,
    aceptaHojas: !cuenta.imputable && cuenta.padreId !== null && cuenta.activa && !agrupaAgrupadores.has(cuenta.id),
  }));
}

/** Cuentas que pueden cumplir el rol: de detalle, activas y del tipo del rol (como `problemaDeAsignacion`). */
export function cuentasParaRol(cuentas: readonly CuentaDelPlan[], rol: RolCuenta): CuentaDelPlan[] {
  const tipo = ROLES_CUENTA[rol].tipo;
  return cuentas.filter((c) => c.imputable && c.activa && c.tipo === tipo);
}

export type CodigoResultado =
  | "sembrado" | "hoja" | "baja" | "alta" | "rol" | "ejercicio"
  | "MIGRACION_PENDIENTE" | "NO_ENCONTRADO" | "PADRE_INVALIDO" | "DATOS_INVALIDOS" | "CUENTA_EN_USO"
  | "ROL_INVALIDO" | "EJERCICIO_SUPERPUESTO" | "FECHAS_INVALIDAS" | "APAGADO" | "SIN_PERMISO" | "ERROR";

export const MENSAJES_RESULTADO: Record<CodigoResultado, { tono: "exito" | "error"; texto: string }> = {
  sembrado: { tono: "exito", texto: "Listo: el plan quedó cargado y el sistema ya sabe qué cuenta usar para cada cosa." },
  hoja: { tono: "exito", texto: "Cuenta agregada." },
  baja: { tono: "exito", texto: "Cuenta dada de baja: no recibe más movimientos." },
  alta: { tono: "exito", texto: "Cuenta reactivada." },
  rol: { tono: "exito", texto: "Listo: el sistema usa esa cuenta para ese rol." },
  ejercicio: { tono: "exito", texto: "Ejercicio abierto." },
  MIGRACION_PENDIENTE: { tono: "error", texto: "La contabilidad de este negocio todavía no está habilitada." },
  NO_ENCONTRADO: { tono: "error", texto: "No encontramos esa cuenta en el plan de este negocio. Recargá la pantalla." },
  PADRE_INVALIDO: { tono: "error", texto: "Las cuentas nuevas van debajo de un agrupador de detalle activo, por ejemplo «Caja y bancos»." },
  DATOS_INVALIDOS: { tono: "error", texto: "Revisá el nombre: entre 2 y 80 letras y que no se repita en el mismo agrupador. Sólo se dan de baja cuentas de detalle." },
  CUENTA_EN_USO: { tono: "error", texto: "Esa cuenta cumple un rol del sistema: asigná el rol a otra cuenta antes de darla de baja." },
  ROL_INVALIDO: { tono: "error", texto: "Esa cuenta no puede cumplir el rol: tiene que ser de detalle, estar activa y ser del tipo que el rol pide." },
  EJERCICIO_SUPERPUESTO: { tono: "error", texto: "Ya hay un ejercicio que cubre parte de esas fechas." },
  FECHAS_INVALIDAS: { tono: "error", texto: "Revisá las fechas: el cierre tiene que ser posterior al inicio, y el ejercicio no puede durar más de un año." },
  APAGADO: { tono: "error", texto: "La contabilidad no está prendida en este negocio." },
  SIN_PERMISO: { tono: "error", texto: "No podés cambiar el plan de cuentas con tu usuario. Pedíselo a la dueña o al dueño." },
  ERROR: { tono: "error", texto: "No se pudo guardar. Probá de nuevo en un rato." },
};

export function mensajeResultado(r: string | undefined): (typeof MENSAJES_RESULTADO)[CodigoResultado] | null {
  return r && Object.prototype.hasOwnProperty.call(MENSAJES_RESULTADO, r) ? MENSAJES_RESULTADO[r as CodigoResultado] : null;
}

/** «2026-03-31» → la fecha a las 00:00 UTC; cualquier otra cosa (o un día que no existe) → null. */
export function leerDia(valor: unknown): Date | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor ? d : null;
}

export function diaIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Un ejercicio dura a lo sumo un año (el primero puede ser irregular, más corto). */
export function duracionValida(inicio: Date, cierre: Date): boolean {
  if (cierre < inicio) return false;
  const tope = new Date(Date.UTC(inicio.getUTCFullYear() + 1, inicio.getUTCMonth(), inicio.getUTCDate()));
  return cierre < tope;
}

/**
 * Fechas que la pantalla propone para el próximo ejercicio: el día siguiente al último cierre y un
 * año; sin ejercicios, el año calendario de `hoy` (el cierre comercial lo cambia el contador).
 */
export function ejercicioSugerido(ejercicios: readonly Pick<EjercicioListado, "fechaCierre">[], hoy: Date): { inicio: string; cierre: string } {
  const ultimo = ejercicios.reduce<Date | null>((max, e) => (!max || e.fechaCierre > max ? e.fechaCierre : max), null);
  const inicio = ultimo
    ? new Date(Date.UTC(ultimo.getUTCFullYear(), ultimo.getUTCMonth(), ultimo.getUTCDate() + 1))
    : new Date(Date.UTC(hoy.getUTCFullYear(), 0, 1));
  const cierre = new Date(Date.UTC(inicio.getUTCFullYear() + 1, inicio.getUTCMonth(), inicio.getUTCDate() - 1));
  return { inicio: diaIso(inicio), cierre: diaIso(cierre) };
}
