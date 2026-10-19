// ============================================================================
// UN SOLO TOPE PARA TODO PIN DEL EQUIPO — el del bloqueo, también para firmar (descuento) y para la caja.
// ============================================================================
//
// Un PIN corto se adivina probando (el de recepción, de 2, en 100 intentos). El bloqueo ya cuenta los PIN mal en
// `gsg-club:<negocio>:intentos-bloqueo:v1` y traba 30 s → 2 min → 10 min; si el descuento y la caja contaran aparte,
// cada pantalla sería una puerta más para probar. Acá se usa ESE contador: un PIN mal en la caja suma al del bloqueo,
// y la espera del bloqueo traba también la caja y el descuento. Un PIN bueno de un DUEÑO lo vuelve a cero; uno bueno
// de recepción no (SEC-5: si no, alguien prueba 4 PIN del dueño, pone el suyo y arranca de nuevo). La regla es una sola,
// la del motor, por `anotarIntento` del bloqueo (con el olvido a las 8 h sin fallos).
//
// Cuenta SÓLO un PIN que se llegó a evaluar (`pin: "bueno" | "malo"`): un envío sin monto o sin concepto no es un
// intento ni vuelve el contador a cero (hallazgo M2 del Gate).

import type { Almacen, Desenlace } from "./almacen";
import {
  INTENTOS_DEL_BLOQUEO,
  anotarIntento,
  claveDeIntentosDelBloqueo,
  guardaDelBloqueo,
  intentosVigentes,
  segundosDeEspera,
  textoDeEspera,
  type GuardaDelBloqueo,
} from "./bloqueo-core";

/** Qué pasó con el PIN: "bueno", "malo" o null (no se llegó a mirar). */
export type ResultadoDelPin = "bueno" | "malo" | null;
/** `duenio`: el PIN bueno es de un dueño (sólo ése vuelve el contador a cero). */
export type DesenlaceConPin = Desenlace & { pin: ResultadoDelPin; duenio?: boolean };

/**
 * Corre `correr` si el equipo no está trabado y anota lo que pasó con el PIN. Trabado: no corre y dice cuánto
 * esperar. Un PIN malo suma «(3 de 5)» al motivo o, si fue el quinto, la espera; uno bueno de un dueño lo vuelve a
 * cero. Pura salvo `guarda`.
 */
export function conTopeDePin<D extends DesenlaceConPin>(guarda: GuardaDelBloqueo, ahoraMs: number, correr: () => D): { desenlace: D | DesenlaceConPin; trabado: boolean } {
  const previo = intentosVigentes(guarda.leer(), ahoraMs);
  const espera = segundosDeEspera(previo, ahoraMs);
  if (espera > 0) return { desenlace: { ok: false, mensaje: textoDeEspera(espera), pin: null }, trabado: true };
  const d = correr();
  if (d.pin !== "bueno" && d.pin !== "malo") return { desenlace: d, trabado: false };
  const intentos = anotarIntento(previo, { ok: d.pin === "bueno", duenio: d.duenio === true }, ahoraMs);
  guarda.guardar(intentos);
  if (d.pin === "bueno") return { desenlace: d, trabado: false };
  const s = segundosDeEspera(intentos, ahoraMs);
  const mensaje = s > 0 ? `${d.mensaje} ${textoDeEspera(s)}` : `${d.mensaje.replace(/\.$/, "")} (${intentos.fallos} de ${INTENTOS_DEL_BLOQUEO}).`;
  return { desenlace: { ...d, mensaje }, trabado: false };
}

// Una guarda por almacén y por clave: las pantallas del mismo club comparten lo de memoria, y con el negocio quedan en
// el equipo con la clave del bloqueo (recargar no los borra). No depende de quién llama primero: sin negocio va a la
// clave del equipo (`*`, más estricta), con negocio a la del negocio. Sin almacenamiento (incógnito, sin lugar), en memoria.
const guardas = new WeakMap<Almacen, Map<string, GuardaDelBloqueo>>();

export function guardaDelPin(almacen: Almacen, negocio: string | undefined): GuardaDelBloqueo {
  const clave = claveDeIntentosDelBloqueo(negocio);
  let porClave = guardas.get(almacen);
  if (!porClave) {
    porClave = new Map();
    guardas.set(almacen, porClave);
  }
  let g = porClave.get(clave);
  if (!g) {
    let almacenamiento: Storage | null = null;
    try {
      almacenamiento = typeof window !== "undefined" ? window.localStorage : null;
    } catch {
      almacenamiento = null;
    }
    g = guardaDelBloqueo(almacenamiento, clave);
    porClave.set(clave, g);
  }
  return g;
}
