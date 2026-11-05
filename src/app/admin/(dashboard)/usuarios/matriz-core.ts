// QUÉ PUEDE HACER CADA PERSONA — la matriz de permisos por usuario. PURO.
//
// docs/producto/permisos/PLAN.md §3, §8 y §9. El rol da el default; cada casilla graba sólo la
// EXCEPCIÓN (prendida o apagada respecto del rol). Esto arma lo que la pantalla dibuja: una fila por
// usuario agrupada por rol, ocho columnas, y por celda el valor que rige, el que daría el rol, si es
// excepción y si se puede tocar. No decide permisos: el valor sale de `permisoEfectivo`, el mismo
// resolvedor que usa el servidor, y las negativas (propia fila, otros socios) las vuelve a chequear
// `setUserPermission`. Ocultar o apagar una casilla acá es UX, no seguridad.

import type { Role } from "@/lib/capabilities";
import { permisoEfectivo, type Capability, type PermisoOverride } from "@/lib/capabilities";
import { etiquetaDeRol } from "./roles";

export type ClaveColumna = "reserva-online" | "agendar" | "editar-turnos" | "cobrar-turnos" | "contacto" | "stock" | "senias-mp" | "caja";

export type ColumnaMatriz = {
  n: number;
  clave: ClaveColumna;
  titulo: string;
  /** Las capacidades que graba. Vacío en la 1: es `Professional.active`, no una capability. */
  capacidades: readonly Capability[];
  /** Sólo en negocios con agenda (servicios). */
  deAgenda: boolean;
};

export const COLUMNAS: readonly ColumnaMatriz[] = [
  { n: 1, clave: "reserva-online", titulo: "Disponible para reserva online", capacidades: [], deAgenda: true },
  { n: 2, clave: "agendar", titulo: "Agendar turnos en su agenda", capacidades: ["agenda:create"], deAgenda: true },
  { n: 3, clave: "editar-turnos", titulo: "Editar turnos en su agenda", capacidades: ["agenda:manage"], deAgenda: true },
  { n: 4, clave: "cobrar-turnos", titulo: "Cargar cobranzas en sus turnos", capacidades: ["agenda:collect"], deAgenda: true },
  { n: 5, clave: "contacto", titulo: "Ver datos de contacto de clientes", capacidades: ["clients:contact"], deAgenda: false },
  { n: 6, clave: "stock", titulo: "Cargar movimientos de stock", capacidades: ["stock:receive", "stock:count", "stock:adjust"], deAgenda: false },
  { n: 7, clave: "senias-mp", titulo: "Recibir señas en su cuenta de Mercado Pago", capacidades: ["payments:own-account"], deAgenda: true },
  { n: 8, clave: "caja", titulo: "Abrir y cerrar la caja", capacidades: ["cash:manage"], deAgenda: false },
];

export type UsuarioDeLaMatriz = {
  id: string;
  name: string;
  role: Role;
  professionalId: string | null;
  overrides: ReadonlyArray<PermisoOverride>;
  /** `Professional.active` de su ficha; `null` sin ficha vinculada. */
  fichaActiva: boolean | null;
};

export type CeldaMatriz = {
  clave: ClaveColumna;
  /** Lo que rige hoy para esta persona. */
  valor: boolean;
  /** Lo que daría el rol solo. `null` donde el rol no dice nada (casilla 1). */
  porRol: boolean | null;
  /** El valor difiere del rol: hay una fila grabada para esta persona. */
  excepcion: boolean;
  /** Por qué no se puede tocar; `null` = se puede. */
  bloqueo: string | null;
};

export type FilaMatriz = { usuario: { id: string; name: string; professionalId: string | null }; celdas: CeldaMatriz[] };
export type GrupoMatriz = { rol: Role; nombre: string; filas: FilaMatriz[] };
export type Matriz = { columnas: ColumnaMatriz[]; grupos: GrupoMatriz[] };

export const BLOQUEOS = {
  propia: "Nadie se cambia sus propios permisos.",
  socio: "Los socios tienen todo: se cambia el rol, no las casillas.",
  sinFicha: "Sin ficha de profesional vinculada: vinculala primero.",
  sinFichaParaAgendar: "Para prenderla, primero vinculá su ficha de profesional: es «en su agenda».",
  proximamente: "Próximamente.",
} as const;

const ORDEN_DE_ROLES: readonly Role[] = ["OWNER", "RECEPTION", "PROFESSIONAL"];

function celdaDe(col: ColumnaMatriz, u: UsuarioDeLaMatriz, actorId: string): CeldaMatriz {
  const bloqueoGeneral = u.id === actorId ? BLOQUEOS.propia : u.role === "OWNER" ? BLOQUEOS.socio : null;

  if (col.clave === "reserva-online") {
    const valor = u.fichaActiva === true;
    return {
      clave: col.clave,
      valor,
      porRol: null,
      excepcion: false,
      bloqueo: bloqueoGeneral ?? (u.professionalId === null || u.fichaActiva === null ? BLOQUEOS.sinFicha : null),
    };
  }

  const sinOverrides = { role: u.role, overrides: [] };
  const valor = col.capacidades.every((c) => permisoEfectivo(u, c));
  const porRol = col.capacidades.every((c) => permisoEfectivo(sinOverrides, c));

  let bloqueo: string | null = bloqueoGeneral;
  if (col.clave === "senias-mp") bloqueo = BLOQUEOS.proximamente;
  // §5: un profesional sin ficha no tiene «su agenda»; se puede apagar lo prendido, no prender.
  else if (!bloqueo && u.role === "PROFESSIONAL" && u.professionalId === null && !valor && (col.clave === "agendar" || col.clave === "editar-turnos")) {
    bloqueo = BLOQUEOS.sinFichaParaAgendar;
  }
  return { clave: col.clave, valor, porRol, excepcion: valor !== porRol, bloqueo };
}

/** La matriz para este negocio: un grupo por rol (en el orden socio → recepción → profesional). */
export function armarMatriz(usuarios: readonly UsuarioDeLaMatriz[], actorId: string, esMostrador: boolean): Matriz {
  const columnas = COLUMNAS.filter((c) => !esMostrador || !c.deAgenda);
  const grupos = ORDEN_DE_ROLES.map((rol) => ({
    rol,
    nombre: etiquetaDeRol(rol, esMostrador),
    filas: usuarios
      .filter((u) => u.role === rol)
      .map((u) => ({
        usuario: { id: u.id, name: u.name, professionalId: u.professionalId },
        celdas: columnas.map((c) => celdaDe(c, u, actorId)),
      })),
  })).filter((g) => g.filas.length > 0);
  return { columnas, grupos };
}

/** Lo que se le manda a `setUserPermission` al dejar la casilla en `nuevo`: volver al rol borra la excepción. */
export function valorParaGrabar(celda: Pick<CeldaMatriz, "porRol">, nuevo: boolean): "default" | "si" | "no" {
  if (celda.porRol === nuevo) return "default";
  return nuevo ? "si" : "no";
}

/** «Por rol: sí» / «Por rol: no». La casilla 1 no depende del rol. */
export function textoPorRol(celda: Pick<CeldaMatriz, "porRol">): string | null {
  if (celda.porRol === null) return null;
  return `Por rol: ${celda.porRol ? "sí" : "no"}`;
}
