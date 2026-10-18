// ============================================================================
// PERFIL DE TERMINAL — cómo trabaja ESTE equipo (PC kiosco, tablet de recepción, celular).
// ============================================================================
//
// Plan: docs/producto/PLAN-TERMINALES-MOSTRADOR.md §6 T-1. Aplica ADR-055 (variante) al
// mostrador: el PERFIL es el objeto maestro (los tres de `PERFILES_BASE`, uno por tipo de
// equipo) y la ASIGNACIÓN es "este equipo, para esta persona, usa este perfil (ajustado)".
// Nunca "a todos con todo": el ancho del ticket o el prefijo del lector son del EQUIPO, no
// del negocio. La balanza, en cambio, es del negocio (supermercado/config-repo.ts): dos
// objetos, dos asignaciones.
//
// Dónde se guarda: en el `localStorage` del navegador, con una clave que lleva el negocio Y
// la persona (`gsg-terminal:<negocio>:<usuario>:v1`). Por qué así:
//   · sin migración y sin ir a la base: es una preferencia del equipo, no un dato del negocio;
//   · el negocio en la clave: el mismo origen puede servir dos negocios (sandbox /demo,
//     `FORCE_TENANT_SLUG` en una vista previa), y `localStorage` es por ORIGEN (MT-1/MT-4);
//   · la persona en la clave: en el mostrador suele haber UNA computadora para varias personas,
//     y la que entra no hereda el perfil de la anterior.
// No es seguridad ni decide plata: nada de lo que dice el perfil cambia precios, stock ni
// cobros (eso lo decide el servidor). Lo peor que logra quien lo edita a mano es un ticket
// más ancho. Igual se valida al leer: lo que no cierra se descarta y vale el de fábrica.
//
// PURO: sin React ni `window`. El almacén se inyecta (los tests usan uno en memoria); el hook
// del navegador está en ./usar-perfil.ts.

export type TipoDeTerminal = "kiosco-pc" | "tablet-recepcion" | "celular-mostrador";
export type AnchoDeTicket = 58 | 80;
export type SufijoDelLector = "enter" | "tab" | "ninguno";
export type PantallaDeInicio = "/admin" | "/admin/vender" | "/admin/caja-rapida" | "/admin/turnos";

export type PerfilDeTerminal = {
  tipo: TipoDeTerminal;
  anchoTicket: AnchoDeTicket;
  /** Imprimir el ticket solo al cobrar (sin diálogo, con Chrome en modo kiosco). */
  impresionDirecta: boolean;
  sonido: boolean;
  vibracion: boolean;
  lector: { prefijo: string; sufijo: SufijoDelLector };
  pantallaInicio: PantallaDeInicio;
};

/** Versión de lo guardado. Un cambio de forma sube la versión: lo viejo se descarta y vale el de fábrica. */
export const VERSION_DEL_PERFIL = 1;

/** Un lector manda, a lo sumo, un puñado de caracteres antes del código (`*`, STX, `]C1`…). */
export const LARGO_MAXIMO_DEL_PREFIJO = 8;

export const TIPOS_DE_TERMINAL: readonly TipoDeTerminal[] = ["kiosco-pc", "tablet-recepcion", "celular-mostrador"];
export const ANCHOS_DE_TICKET: readonly AnchoDeTicket[] = [58, 80];
export const SUFIJOS_DEL_LECTOR: readonly SufijoDelLector[] = ["enter", "tab", "ninguno"];
export const PANTALLAS_DE_INICIO: readonly PantallaDeInicio[] = ["/admin", "/admin/vender", "/admin/caja-rapida", "/admin/turnos"];

/** Sin nada guardado (o ilegible), el equipo es un celular de mostrador: el caso más común hoy (MAGRA). */
export const TIPO_POR_DEFECTO: TipoDeTerminal = "celular-mostrador";

/**
 * Los tres perfiles maestros (plan §3 y §5). Se congelan: elegir uno devuelve una COPIA
 * (`perfilDeFabrica`), así ajustar un equipo nunca toca el maestro.
 */
export const PERFILES_BASE: Readonly<Record<TipoDeTerminal, Readonly<PerfilDeTerminal>>> = Object.freeze({
  // Alto volumen (súper, buffet, retail con EAN): térmica 80 mm, lector USB con Enter, la caja con lector.
  "kiosco-pc": Object.freeze({
    tipo: "kiosco-pc",
    anchoTicket: 80,
    impresionDirecta: true,
    sonido: true,
    vibracion: false,
    lector: Object.freeze({ prefijo: "", sufijo: "enter" }),
    pantallaInicio: "/admin/caja-rapida",
  }),
  // Recepción de turnos (CH, Break Point): el ticket va por WhatsApp o PDF; la térmica, sólo si hay PC al lado.
  "tablet-recepcion": Object.freeze({
    tipo: "tablet-recepcion",
    anchoTicket: 80,
    impresionDirecta: false,
    sonido: true,
    vibracion: false,
    lector: Object.freeze({ prefijo: "", sufijo: "enter" }),
    pantallaInicio: "/admin/turnos",
  }),
  // Celular en el mostrador (MAGRA hoy): vibra en vez de sonar, ticket de 58 mm si algún día hay térmica.
  "celular-mostrador": Object.freeze({
    tipo: "celular-mostrador",
    anchoTicket: 58,
    impresionDirecta: false,
    sonido: false,
    vibracion: true,
    lector: Object.freeze({ prefijo: "", sufijo: "enter" }),
    pantallaInicio: "/admin/vender",
  }),
}) as Readonly<Record<TipoDeTerminal, Readonly<PerfilDeTerminal>>>;

/** Una copia editable del perfil maestro de ese tipo. */
export function perfilDeFabrica(tipo: TipoDeTerminal): PerfilDeTerminal {
  const base = PERFILES_BASE[tipo];
  return { ...base, lector: { ...base.lector } };
}

/** ¿El perfil quedó igual al de fábrica de su tipo? (para mostrar "Ajustado"). */
export function esDeFabrica(perfil: PerfilDeTerminal): boolean {
  const base = PERFILES_BASE[perfil.tipo];
  return (
    perfil.anchoTicket === base.anchoTicket &&
    perfil.impresionDirecta === base.impresionDirecta &&
    perfil.sonido === base.sonido &&
    perfil.vibracion === base.vibracion &&
    perfil.lector.prefijo === base.lector.prefijo &&
    perfil.lector.sufijo === base.lector.sufijo &&
    perfil.pantallaInicio === base.pantallaInicio
  );
}

const incluye = <T>(lista: readonly T[], x: unknown): x is T => (lista as readonly unknown[]).includes(x);

/**
 * ¿El prefijo es algo que un lector puede mandar? Hasta 8 caracteres y sin Enter ni Tab
 * (esos son el SUFIJO: si el prefijo los tuviera, el código se cortaría antes de empezar).
 * `null` si está bien; si no, el motivo en criollo.
 */
export function problemaDelPrefijo(prefijo: unknown): string | null {
  if (typeof prefijo !== "string") return "El prefijo tiene que ser texto.";
  if (prefijo.length > LARGO_MAXIMO_DEL_PREFIJO) return `El prefijo va de 0 a ${LARGO_MAXIMO_DEL_PREFIJO} caracteres.`;
  if (/[\r\n\t]/.test(prefijo)) return "El prefijo no puede llevar Enter ni Tab: eso va en «Qué manda al final».";
  return null;
}

/**
 * Normaliza lo que llega de afuera (el `localStorage`, editable a mano) a un perfil válido, o
 * `null`. Exige la versión vigente: un perfil guardado con otra forma no se adivina. Mismo
 * espíritu que `formatoDesdeAfuera` (supermercado/balanza.ts): nunca confía en la forma.
 */
export function perfilDesdeAfuera(x: unknown): PerfilDeTerminal | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  if (o.v !== VERSION_DEL_PERFIL) return null;
  if (!incluye(TIPOS_DE_TERMINAL, o.tipo)) return null;
  if (!incluye(ANCHOS_DE_TICKET, o.anchoTicket)) return null;
  if (typeof o.impresionDirecta !== "boolean" || typeof o.sonido !== "boolean" || typeof o.vibracion !== "boolean") return null;
  if (!incluye(PANTALLAS_DE_INICIO, o.pantallaInicio)) return null;
  const lector = o.lector as Record<string, unknown> | null | undefined;
  if (!lector || typeof lector !== "object" || Array.isArray(lector)) return null;
  if (problemaDelPrefijo(lector.prefijo) !== null || !incluye(SUFIJOS_DEL_LECTOR, lector.sufijo)) return null;
  return {
    tipo: o.tipo,
    anchoTicket: o.anchoTicket,
    impresionDirecta: o.impresionDirecta,
    sonido: o.sonido,
    vibracion: o.vibracion,
    lector: { prefijo: lector.prefijo as string, sufijo: lector.sufijo },
    pantallaInicio: o.pantallaInicio,
  };
}

const PREFIJO_DE_LA_CLAVE = "gsg-terminal:";

/**
 * La clave del almacén: `gsg-terminal:<negocio>:<usuario>:v1`. Las partes van codificadas
 * (`encodeURIComponent`): un `:` adentro de una no puede hacer que dos combinaciones distintas
 * den la misma clave. Sin negocio o sin persona no hay clave: tira, porque una clave "de nadie"
 * la compartirían todos los que usan el equipo.
 */
export function claveDelPerfil(tenantSlug: string, userId: string): string {
  const negocio = tenantSlug.trim();
  const persona = userId.trim();
  if (!negocio || !persona) throw new RangeError("El perfil del equipo necesita el negocio y la persona.");
  return `${PREFIJO_DE_LA_CLAVE}${encodeURIComponent(negocio)}:${encodeURIComponent(persona)}:v${VERSION_DEL_PERFIL}`;
}

/** Lo mínimo del `Storage` del navegador que se usa (se inyecta en los tests). */
export type AlmacenDelEquipo = Pick<Storage, "getItem" | "setItem">;

/** El perfil a partir del texto guardado. Sin nada, o con algo que no se puede leer: el de fábrica por defecto. */
export function perfilDeTexto(crudo: string | null | undefined): PerfilDeTerminal {
  if (!crudo) return perfilDeFabrica(TIPO_POR_DEFECTO);
  try {
    return perfilDesdeAfuera(JSON.parse(crudo)) ?? perfilDeFabrica(TIPO_POR_DEFECTO);
  } catch {
    return perfilDeFabrica(TIPO_POR_DEFECTO);
  }
}

/** El perfil de este equipo para esta persona. Nunca tira: sin almacén (modo privado, bloqueado), el de fábrica. */
export function leerPerfil(almacen: AlmacenDelEquipo | null, clave: string): PerfilDeTerminal {
  if (!almacen) return perfilDeFabrica(TIPO_POR_DEFECTO);
  try {
    return perfilDeTexto(almacen.getItem(clave));
  } catch {
    return perfilDeFabrica(TIPO_POR_DEFECTO);
  }
}

/** El texto que se guarda: el perfil con su versión. */
export function textoDelPerfil(perfil: PerfilDeTerminal): string {
  return JSON.stringify({ v: VERSION_DEL_PERFIL, ...perfil });
}

/**
 * Guarda el perfil. `false` si no es válido (no se guarda nada) o si el almacén no deja
 * (lleno, modo privado): la pantalla lo dice en vez de fingir que quedó.
 */
export function guardarPerfil(almacen: AlmacenDelEquipo | null, clave: string, perfil: PerfilDeTerminal): boolean {
  if (!almacen) return false;
  const valido = perfilDesdeAfuera({ v: VERSION_DEL_PERFIL, ...perfil });
  if (!valido) return false;
  try {
    almacen.setItem(clave, textoDelPerfil(valido));
    return true;
  } catch {
    return false;
  }
}

/**
 * La pantalla de inicio que de verdad se puede abrir: la del perfil si está entre las que la
 * persona puede abrir en este negocio (lo calcula el servidor con `requireApp`/`appPermitida`),
 * si no el Inicio. El perfil nunca abre una puerta: sólo elige entre las que ya están abiertas.
 */
export function pantallaQueSePuedeAbrir(perfil: PerfilDeTerminal, permitidas: readonly PantallaDeInicio[]): PantallaDeInicio {
  return permitidas.includes(perfil.pantallaInicio) ? perfil.pantallaInicio : "/admin";
}
