// ============================================================================
// EL BLOQUEO DEL CLUB — quién entra con su PIN, cuántos intentos le quedan y cuándo se vuelve a bloquear. PURO.
// ============================================================================
//
// Paridad con el club vanilla (public/previews/breakpoint/club/app.mjs: `bloqueo`, `desbloquear`, `guardarIntentos`,
// `revisarInactividad`), que es lo que el club usa hoy:
//   · En la jornada real nadie opera hasta poner su PIN de 2 dígitos. Se bloquea tras `config.bloqueoMin` minutos sin
//     uso (0 = sólo al apagar la pantalla), si la pantalla estuvo apagada o en otra app 30 s o más, a mano y al recargar.
//   · El PIN se prueba CONTRA UNA PERSONA (`verificarPin`): la que estaba, o la que se elige de la lista. Así cada
//     intento acierta 1 de 100, no «cualquiera de los N usuarios» como con `usuarioPorPin`.
//   · 5 PIN mal → espera; cada tanda espera más: 30 s, 2 min y después 10 min siempre. Un PIN bueno vuelve todo a cero.
//     En la jornada real queda guardado en el equipo por negocio (`gsg-club:<negocio>:intentos-bloqueo:v1`, el
//     `bp-intentos` del vanilla), así que recargar no lo borra. Borrar lo guardado tampoco destraba ESTA pestaña.
//   · Lo que no son 2 números no se llega a evaluar: no gasta un intento (y nunca vale: el motor lo rechaza igual).
// El reloj se inyecta (`ahoraMs`) en todo: los tests no esperan.

import { verificarPin } from "@/lib/club/motor.mjs";
import type { EstadoClub, Usuario } from "@/lib/club/motor.mjs";
import type { AlmacenamientoLocal } from "./almacen";

export const INTENTOS_DEL_BLOQUEO = 5;
/** La espera de cada tanda de 5 PIN mal: 30 s, 2 min y, de la tercera en adelante, 10 min. */
export const ESPERAS_DEL_BLOQUEO_MS: readonly number[] = [30_000, 120_000, 600_000];
/** Pantalla apagada o en otra app por 30 s o más: al volver, se pide el PIN. */
export const OCULTA_MAX_MS = 30_000;
/** Cada cuánto se mira si pasó el tiempo sin uso (como el vanilla). */
export const REVISAR_INACTIVIDAD_MS = 15_000;

export interface IntentosDelBloqueo {
  /** PIN mal seguidos en esta tanda (0–5). */
  fallos: number;
  /** Hasta cuándo hay que esperar (ms); 0 = no hay espera. */
  esperaHasta: number;
  /** Cuántas tandas de 5 mal van sin un PIN bueno (decide cuánto se espera). */
  tandas: number;
}

export const SIN_INTENTOS_DEL_BLOQUEO: IntentosDelBloqueo = Object.freeze({ fallos: 0, esperaHasta: 0, tandas: 0 });

/** Cuántos segundos faltan para poder probar (0 = ya se puede). */
export function segundosDeEspera(i: IntentosDelBloqueo, ahoraMs: number): number {
  return i.esperaHasta > ahoraMs ? Math.ceil((i.esperaHasta - ahoraMs) / 1000) : 0;
}

/** Si la espera ya pasó, la tanda arranca de cero (las tandas siguen contando hasta un PIN bueno). */
export function intentosVigentes(i: IntentosDelBloqueo, ahoraMs: number): IntentosDelBloqueo {
  if (i.fallos >= INTENTOS_DEL_BLOQUEO && i.esperaHasta <= ahoraMs) return { fallos: 0, esperaHasta: 0, tandas: i.tandas };
  return i;
}

/** Anota un PIN malo: el quinto de la tanda traba (30 s, 2 min, 10 min…). Pura. */
export function anotarFallo(previo: IntentosDelBloqueo, ahoraMs: number): IntentosDelBloqueo {
  const i = intentosVigentes(previo, ahoraMs);
  const fallos = i.fallos + 1;
  if (fallos < INTENTOS_DEL_BLOQUEO) return { ...i, fallos };
  const tandas = i.tandas + 1;
  const espera = ESPERAS_DEL_BLOQUEO_MS[Math.min(tandas, ESPERAS_DEL_BLOQUEO_MS.length) - 1];
  return { fallos, esperaHasta: ahoraMs + espera, tandas };
}

/** «esperá 30 segundos» · «esperá 2 minutos». Se arma UNA vez por espera (el lector no lo re-anuncia cada segundo). */
export function textoDeEspera(segundos: number): string {
  if (segundos <= 0) return "";
  return segundos <= 60 ? `Demasiados PIN equivocados: esperá ${segundos} segundos.` : `Demasiados PIN equivocados: esperá ${Math.ceil(segundos / 60)} minutos.`;
}

/** La cuenta regresiva que se VE (no se anuncia): «0:30», «1:54», «9:59». */
export function relojDeEspera(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Lo que pasó al probar un PIN. */
export type PruebaDePin =
  | { tipo: "espera"; segundos: number; mensaje: string }
  | { tipo: "incompleto"; mensaje: string }
  | { tipo: "malo"; intentos: IntentosDelBloqueo; mensaje: string }
  | { tipo: "bueno"; usuario: Usuario; pin: string; intentos: IntentosDelBloqueo };

/** Sólo 2 números: lo demás no se evalúa (ni gasta un intento). */
export function pinCompleto(pin: string): boolean {
  return /^\d{2}$/.test(pin);
}

/**
 * Prueba el PIN de UNA persona con el tope de intentos. Trabado → no se evalúa. Incompleto (vacío, 1 número, letras)
 * → no se evalúa ni cuenta. Malo (PIN equivocado, usuario inactivo o sin PIN) → cuenta. Bueno → todo a cero. Pura.
 */
export function probarPin(estado: EstadoClub, usuarioId: string | null, pin: string, previo: IntentosDelBloqueo, ahoraMs: number): PruebaDePin {
  const i = intentosVigentes(previo, ahoraMs);
  const espera = segundosDeEspera(i, ahoraMs);
  if (espera > 0) return { tipo: "espera", segundos: espera, mensaje: textoDeEspera(espera) };
  if (!usuarioId) return { tipo: "incompleto", mensaje: "Elegí quién entra." };
  const limpio = String(pin ?? "").trim();
  if (!pinCompleto(limpio)) return { tipo: "incompleto", mensaje: "Poné los 2 números de tu PIN." };
  const r = verificarPin(estado, usuarioId, limpio);
  if (r.ok) return { tipo: "bueno", usuario: r.usuario, pin: limpio, intentos: SIN_INTENTOS_DEL_BLOQUEO };
  const intentos = anotarFallo(i, ahoraMs);
  const s = segundosDeEspera(intentos, ahoraMs);
  // El motivo del motor dice si el usuario no tiene acceso o PIN; nunca muestra un PIN.
  const mensaje = s > 0 ? textoDeEspera(s) : `${r.motivo.replace(/\.$/, "")} (${intentos.fallos} de ${INTENTOS_DEL_BLOQUEO}).`;
  return { tipo: "malo", intentos, mensaje };
}

// ───────────── dónde viven los intentos ─────────────

/**
 * La clave de los intentos del bloqueo en este equipo: la del NEGOCIO, de la misma familia que la jornada
 * (`gsg-club:<negocio>:…`). Sin negocio (la recepción todavía no se lo pasa a la pieza) cae a una clave del equipo
 * (`gsg-club:*:…`; «*» no es un negocio posible): más estricta, nunca más floja.
 */
export function claveDeIntentosDelBloqueo(negocio?: string | null): string {
  const n = negocio?.trim();
  return `gsg-club:${n || "*"}:intentos-bloqueo:v1`;
}

export interface GuardaDelBloqueo {
  leer(): IntentosDelBloqueo;
  guardar(i: IntentosDelBloqueo): void;
}

function deTexto(crudo: string | null): IntentosDelBloqueo | null {
  if (!crudo) return null;
  try {
    const x = JSON.parse(crudo) as Partial<IntentosDelBloqueo>;
    const fallos = Number(x?.fallos);
    const esperaHasta = Number(x?.esperaHasta);
    const tandas = Number(x?.tandas ?? 0);
    if (![fallos, esperaHasta, tandas].every(Number.isFinite)) return null;
    return { fallos: Math.min(INTENTOS_DEL_BLOQUEO, Math.max(0, Math.floor(fallos))), esperaHasta: Math.max(0, esperaHasta), tandas: Math.max(0, Math.floor(tandas)) };
  } catch {
    return null;
  }
}

/**
 * Los intentos en este equipo (localStorage con `clave`), o sólo en memoria (`clave` null: la demo; o sin
 * almacenamiento: incógnito, sin lugar). Nunca tira. Al leer, gana lo MÁS trabado entre lo guardado y lo de esta
 * pestaña: borrar lo guardado (o que otra pestaña escriba menos) no destraba. Un PIN bueno (`SIN_INTENTOS…`) sí limpia.
 */
export function guardaDelBloqueo(almacenamiento: AlmacenamientoLocal | null, clave: string | null): GuardaDelBloqueo {
  let enMemoria: IntentosDelBloqueo = SIN_INTENTOS_DEL_BLOQUEO;
  return {
    leer() {
      if (almacenamiento && clave) {
        try {
          const g = deTexto(almacenamiento.getItem(clave));
          if (g) {
            enMemoria = {
              fallos: g.tandas === enMemoria.tandas ? Math.max(g.fallos, enMemoria.fallos) : g.tandas > enMemoria.tandas ? g.fallos : enMemoria.fallos,
              esperaHasta: Math.max(g.esperaHasta, enMemoria.esperaHasta),
              tandas: Math.max(g.tandas, enMemoria.tandas),
            };
          }
        } catch {
          // sin acceso al almacenamiento: lo de memoria
        }
      }
      return enMemoria;
    },
    guardar(i) {
      enMemoria = i;
      if (!almacenamiento || !clave) return;
      try {
        if (i.fallos === 0 && i.esperaHasta === 0 && i.tandas === 0) almacenamiento.removeItem(clave);
        else almacenamiento.setItem(clave, JSON.stringify(i));
      } catch {
        // sin lugar: queda en memoria
      }
    },
  };
}

// ───────────── cuándo se bloquea ─────────────

/** ¿Pasaron `bloqueoMin` minutos sin uso? (0 = nunca por tiempo: sólo al apagar la pantalla). */
export function vencioLaInactividad(ultimoUsoMs: number, ahoraMs: number, bloqueoMin: number): boolean {
  const min = Number(bloqueoMin);
  return Number.isFinite(min) && min > 0 && ahoraMs - ultimoUsoMs >= min * 60_000;
}

/** ¿La pantalla estuvo apagada (o en otra app) lo suficiente para pedir el PIN al volver? */
export function vuelveDeLaPantallaApagada(ocultaDesdeMs: number | null, ahoraMs: number): boolean {
  return ocultaDesdeMs !== null && ahoraMs - ocultaDesdeMs >= OCULTA_MAX_MS;
}

export type MotivoDelBloqueo = "recarga" | "inactividad" | "pantalla" | "manual" | "cambio";

/** La línea de abajo del título, en criollo. */
export function textoDelMotivo(motivo: MotivoDelBloqueo, bloqueoMin: number): string {
  switch (motivo) {
    case "inactividad":
      return `Pasaron ${bloqueoMin} minutos sin uso.`;
    case "pantalla":
      return "La pantalla se apagó o se cambió de app.";
    case "manual":
      return "Se bloqueó a mano.";
    case "cambio":
      return "Elegí quién entra y poné su PIN.";
    default:
      return "Se volvió a abrir el sistema: poné tu PIN.";
  }
}

/** Quién puede entrar: activos y con PIN armado (sin PIN no hay cómo). Sin PINs: sólo id, nombre y rol. */
export interface QuienEntra {
  id: string;
  nombre: string;
  rol: Usuario["rol"];
}

export function quienesPuedenEntrar(estado: EstadoClub): QuienEntra[] {
  return estado.usuarios.filter((u) => u.activo !== false && !!u.pin).map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol }));
}

/** El primer nombre, para «Hola, Majo.» y «PIN de Majo». */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

// ───────────── el pedido de bloqueo (lo usan la pieza y el botón de la cinta) ─────────────

/** Lo mínimo del almacén para bloquear: no hace falta el resto (los tests usan uno de mentira). */
export interface AlmacenQueSeBloquea {
  modo(): "demo" | "real";
  operador(): { usuario: Usuario } | null;
  cambiarOperador(usuario: Usuario | null): void;
}

interface UltimoBloqueo {
  motivo: MotivoDelBloqueo;
  /** Quién estaba (para «Tu PIN para seguir»); null = nadie (recarga): se elige de la lista. */
  usuarioId: string | null;
}

const bloqueos = new WeakMap<object, UltimoBloqueo>();

/**
 * Bloquea el club: anota por qué y quién estaba, y deja sin operador (`cambiarOperador(null)`: apaga «Deshacer»). La
 * pieza del bloqueo lo ve por `suscribirOperador` y tapa todo. En la demo no hace nada (opera el usuario de ejemplo).
 * Devuelve si bloqueó.
 */
export function bloquearElClub(almacen: AlmacenQueSeBloquea, motivo: MotivoDelBloqueo): boolean {
  if (almacen.modo() !== "real") return false;
  const op = almacen.operador();
  if (!op) return false;
  bloqueos.set(almacen, { motivo, usuarioId: op.usuario.id });
  almacen.cambiarOperador(null);
  return true;
}

/** Por qué está bloqueado y quién estaba. Sin pedido anotado (recién abierto), es la recarga y no había nadie. */
export function ultimoBloqueo(almacen: object): UltimoBloqueo {
  return bloqueos.get(almacen) ?? { motivo: "recarga", usuarioId: null };
}

/** Al entrar se olvida el pedido: el próximo bloqueo anota el suyo. */
export function olvidarBloqueo(almacen: object): void {
  bloqueos.delete(almacen);
}
