// ============================================================================
// BUSCAR CLIENTAS POR TELÉFONO O MAIL — el ÚNICO lugar que decide cómo (casilla 5 de la matriz).
// ============================================================================
//
// Cuatro vueltas de certificación encontraron el mismo agujero en buscadores distintos: cada uno
// decidía solo cómo buscar por teléfono y, sin `clients:contact`, dejaba reconstruir el número de a
// un tramo («5555-12», «555512», «11555»…). La regla vive acá, PURA, y los buscadores sólo la aplican:
//
//   · CON `clients:contact`: como siempre. El texto tal cual sobre el teléfono guardado, sus dígitos
//     seguidos, la clave nacional (`normalizarTelefono`: sin +54/0/15) y, con 8 dígitos o más, el número
//     local (encuentra «011 15 4000-7919» tipeando «1140007919»). Por mail, si el buscador lo pide.
//   · SIN `clients:contact`: por nombre (eso lo hace cada buscador) o por los ÚLTIMOS 4 dígitos
//     completos, los mismos que muestra la máscara «•••• 1234». Nunca un tramo del medio, nunca por mail.
//
// Dos salidas para las dos formas de consultar que hay en el repo: `wherePorContacto` (Prisma, un
// `OR` de `ClientWhereInput`) y `sqlPorContacto` (SQL crudo, una expresión booleana). Un test guardián
// (`busqueda-por-contacto.test.ts`) falla si aparece un `phone: { contains` o un `phone LIKE` fuera de acá.

import { Prisma } from "@/generated/prisma/client";
import { normalizarTelefono, puedeVerContacto, ultimosCuatroBuscados, type QuienMira } from "./telefono";

/** Desde cuántos dígitos seguidos se busca por dígitos (menos trae medio negocio). */
const MINIMO_DE_DIGITOS = 3;

export type CriterioDeContacto =
  /**
   * Con permiso: `crudo` tal cual sobre el teléfono guardado (`null` si lo tipeado no tiene dígitos: por
   * teléfono no hay nada que buscar); `digitos` sobre el teléfono sin separadores; `mail` si el buscador lo pide.
   */
  | { modo: "completo"; crudo: string | null; digitos: string[]; mail: string }
  /** Sin permiso y tipeó exactamente 4 dígitos: sólo los teléfonos que TERMINAN en esos 4. */
  | { modo: "ultimos4"; cuatro: string }
  /** No se busca por contacto (sin permiso y no son 4 dígitos, o no se tipeó nada). */
  | { modo: "ninguno" };

/**
 * Qué se puede buscar por teléfono/mail con lo tipeado, según quién mira. `quien` acepta la sesión o el
 * booleano ya resuelto (los cores puros reciben `veContacto`).
 */
export function criterioDeContacto(texto: string | null | undefined, quien: QuienMira | boolean): CriterioDeContacto {
  const t = String(texto ?? "").trim();
  const veContacto = typeof quien === "boolean" ? quien : puedeVerContacto(quien);
  if (!veContacto) {
    const cuatro = ultimosCuatroBuscados(t);
    return cuatro ? { modo: "ultimos4", cuatro } : { modo: "ninguno" };
  }
  if (!t) return { modo: "ninguno" };
  const digitos = t.replace(/\D/g, "");
  const variantes = new Set<string>();
  if (digitos.length >= MINIMO_DE_DIGITOS) {
    variantes.add(digitos);
    const clave = normalizarTelefono(digitos);
    if (clave.length >= MINIMO_DE_DIGITOS) variantes.add(clave);
    if (clave.length >= 8) variantes.add(clave.slice(-8));
  }
  return { modo: "completo", crudo: digitos ? t : null, digitos: [...variantes], mail: t };
}

/**
 * Para Prisma: las condiciones a sumar al `OR` del buscador (vacío si no se busca por contacto).
 * `conMail` suma el mail; sólo las pantallas que ya buscaban por mail lo piden.
 */
export function wherePorContacto(c: CriterioDeContacto, opciones: { conMail?: boolean } = {}): Prisma.ClientWhereInput[] {
  switch (c.modo) {
    case "completo":
      return [
        ...(c.crudo !== null ? [{ phone: { contains: c.crudo } }] : []),
        ...c.digitos.filter((d) => d !== c.crudo).map((d) => ({ phone: { contains: d } })),
        ...(opciones.conMail ? [{ email: { contains: c.mail, mode: "insensitive" as const } }] : []),
      ];
    case "ultimos4":
      return [{ phone: { endsWith: c.cuatro } }];
    case "ninguno":
      return [];
  }
}

function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Para SQL crudo: una expresión booleana sobre la columna del teléfono (`"phone"` por defecto; la lista
 * de fichas pasa `c.phone`). Sin búsqueda por contacto devuelve `FALSE`, así se puede sumar a un `OR`.
 */
export function sqlPorContacto(c: CriterioDeContacto, columna: Prisma.Sql = Prisma.sql`"phone"`): Prisma.Sql {
  const digitos = Prisma.sql`regexp_replace(COALESCE(${columna}, ''), '[^0-9]', '', 'g')`;
  switch (c.modo) {
    case "completo": {
      const partes = [
        ...(c.crudo !== null ? [Prisma.sql`${columna} LIKE ${`%${escaparLike(c.crudo)}%`}`] : []),
        ...c.digitos.map((d) => Prisma.sql`${digitos} LIKE ${`%${d}%`}`),
      ];
      return partes.length ? Prisma.sql`(${Prisma.join(partes, " OR ")})` : Prisma.sql`FALSE`;
    }
    case "ultimos4":
      return Prisma.sql`${digitos} LIKE ${`%${c.cuatro}`}`;
    case "ninguno":
      return Prisma.sql`FALSE`;
  }
}
