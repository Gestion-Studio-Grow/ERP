// ============================================================================
// MIS APPS — las apps que cada persona fija arriba de su Inicio.
// ============================================================================
//
// Dónde se guardan: en una cookie httpOnly `inicio-fijadas` con `<userId>.<id>,<id>,…`, sin
// dominio (queda en el subdominio del negocio) y con path /admin. Por qué así:
//   · localStorage, descartado: el servidor no lo ve y el Inicio saltaría al cargar (primero
//     sin "Mis apps", después con);
//   · una tabla, descartada por ahora: necesita migración. Si piden que las fijadas viajen
//     entre la PC y el celular de la misma persona, ése es el cambio (y es owner-level).
// Consecuencia esperada: en otro navegador, la misma persona no ve sus fijadas.
//
// El `userId` adelante es porque el mostrador suele tener UNA computadora para varias
// personas: si entra otra, no hereda las fijadas de la anterior. No es seguridad: la cookie la
// puede editar su dueño, y lo peor que logra es fijarse apps que YA ve. Por eso, al leerla, las
// ids se cruzan SIEMPRE con las apps visibles que calcula el servidor (`fijadasVisibles`): una
// app que le sacaron a la persona, o una id inventada, no aparece.
//
// PURO: sin cookies ni servidor. Lo usan la action que la escribe y el Inicio que la lee, y
// los tests lo ejecutan con el registro real.

import type { AppDescriptor } from "@/apps/contract";

export const COOKIE_FIJADAS = "inicio-fijadas";

/** Más de 8 deja de ser "las de todos los días" y empuja el resto del Inicio abajo del pliegue. */
export const MAX_FIJADAS = 8;

/** Un año: es una preferencia, no una sesión. Se renueva con cada cambio. */
export const DURACION_FIJADAS_S = 60 * 60 * 24 * 365;

/** Las ids del registro son kebab-case; cualquier otra cosa en la cookie es basura o edición a mano. */
const ID_VALIDA = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Las ids fijadas de `userId`, en el orden en que las fijó. Vacío si la cookie no existe, es
 * de otra persona o está rota. Sin duplicados y con el tope aplicado: nunca confía en la forma.
 */
export function leerFijadas(valor: string | undefined | null, userId: string): string[] {
  if (!valor || !userId) return [];
  // El ÚLTIMO punto: las ids nunca llevan puntos, así un userId con puntos también se lee bien.
  const punto = valor.lastIndexOf(".");
  if (punto <= 0) return [];
  if (valor.slice(0, punto) !== userId) return [];
  const ids: string[] = [];
  for (const id of valor.slice(punto + 1).split(",")) {
    if (ID_VALIDA.test(id) && !ids.includes(id)) ids.push(id);
    if (ids.length === MAX_FIJADAS) break;
  }
  return ids;
}

/** El valor de la cookie para `userId` con estas ids (ya validadas por `aplicarCambio`). */
export function escribirFijadas(userId: string, ids: readonly string[]): string {
  return `${userId}.${ids.join(",")}`;
}

/**
 * Las apps fijadas que la persona TODAVÍA ve, en su orden. Una app que dejó de ver (le
 * cambiaron el rol, el negocio apagó el módulo) desaparece de "Mis apps" sin tocar la cookie.
 */
export function fijadasVisibles(ids: readonly string[], visibles: readonly AppDescriptor[]): AppDescriptor[] {
  const porId = new Map(visibles.map((a) => [a.id, a]));
  return ids.flatMap((id) => {
    const app = porId.get(id);
    return app && app.enLanzador !== false ? [app] : [];
  });
}

export type CambioFijadas = { accion: "fijar" | "quitar"; appId: string };

export type ResultadoCambio =
  | { ok: true; ids: string[]; app: AppDescriptor | null }
  | { ok: false; error: string };

export const YA_TENES_EL_MAXIMO = `Ya tenés ${MAX_FIJADAS} apps en Mis apps. Quitá una para sumar otra.`;
export const APP_QUE_NO_VES = "Esa app no está entre las tuyas. Recargá el Inicio y probá de nuevo.";

/**
 * Aplica un cambio a las fijadas actuales. Lo que decide la action antes de escribir:
 *   · fijar: sólo una app que la persona ve (la lista la calcula el servidor, no el pedido) y
 *     hasta `MAX_FIJADAS`; fijar dos veces la misma no la duplica;
 *   · quitar: siempre se puede, aunque la app ya no esté entre las visibles.
 * De paso se limpian las ids que ya no son visibles: no ocupan lugar en el tope de 8.
 */
export function aplicarCambio(
  actuales: readonly string[],
  cambio: CambioFijadas,
  visibles: readonly AppDescriptor[],
): ResultadoCambio {
  const vigentes = fijadasVisibles(actuales, visibles).map((a) => a.id);
  if (cambio.accion === "quitar") {
    const app = visibles.find((a) => a.id === cambio.appId) ?? null;
    return { ok: true, ids: vigentes.filter((id) => id !== cambio.appId), app };
  }
  const app = visibles.find((a) => a.id === cambio.appId && a.enLanzador !== false);
  if (!app) return { ok: false, error: APP_QUE_NO_VES };
  if (vigentes.includes(app.id)) return { ok: true, ids: vigentes, app };
  if (vigentes.length >= MAX_FIJADAS) return { ok: false, error: YA_TENES_EL_MAXIMO };
  return { ok: true, ids: [...vigentes, app.id], app };
}
