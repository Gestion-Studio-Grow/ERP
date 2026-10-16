// ============================================================================
// EL LECTOR DE CÓDIGO DE BARRAS — lo que "tipea", limpio, y cómo distinguirlo de una persona.
// ============================================================================
//
// Plan: docs/producto/PLAN-TERMINALES-MOSTRADOR.md §6 T-2. Un lector USB o Bluetooth en modo
// teclado (HID) "escribe" el código como si fuera un teclado, muy rápido, y casi siempre termina
// con un Enter. Algunos, de fábrica, mandan algo antes (un `*`, un STX, un identificador como
// `]E0`) o terminan con Tab, o con nada. Eso se configura POR EQUIPO en «Este equipo»
// (perfil-core.ts → `lector: { prefijo, sufijo }`): el lector es del equipo, no del negocio.
//
// Tres piezas:
//   · `quitarPrefijoSufijo`: deja sólo el código (sin el prefijo del lector, sin Enter/Tab, sin
//     los caracteres de control que algunos mandan de envoltorio);
//   · `detectorDeRafaga`: una máquina de estados chica que recibe (tecla, momento) y avisa cuando
//     una RÁFAGA rápida terminó: lo que hace un lector y no hace una persona (un lector manda una
//     tecla cada 5–20 ms; una persona que tipea rápido, cada 80–150 ms);
//   · `enCampoEditable`: si la tecla cayó en un campo donde alguien escribe (ahí el lector no se
//     intercepta: el campo es de la persona). Antes estaba duplicado en CajaRapida y VenderForm.
//
// PURO: sin React ni `window`. El momento lo pasa quien llama (`performance.now()` en el
// navegador, números a mano en los tests). Nada de esto decide plata: sólo encuentra el código;
// el precio y el stock los decide el servidor al cobrar.

import type { PerfilDeTerminal, SufijoDelLector } from "./perfil-core";

export type LectorDelEquipo = PerfilDeTerminal["lector"];

/** Entre tecla y tecla de un lector: hasta 35 ms (una persona no baja de ~80 ms). */
export const UMBRAL_RAFAGA_MS = 35;
/** Lo mínimo que manda un lector: el EAN-8 son 8; con 6 entra también un código interno corto. */
export const MIN_LARGO_RAFAGA = 6;
/** Más que esto no es un código de barras (es un pegado o una tecla trabada): se descarta. */
export const MAX_LARGO_RAFAGA = 64;

// Caracteres de control (STX, ETX, CR, LF, Tab…): un lector los usa de envoltorio, nunca son
// parte del código.
const CONTROL_AL_PRINCIPIO = /^[\u0000-\u001f\u007f]+/;
const CONTROL_AL_FINAL = /[\u0000-\u001f\u007f]+$/;

/**
 * Lo que mandó el lector, sin su envoltorio: primero lo del final (Enter, Tab, ETX), después el
 * prefijo configurado (si está al principio) y los caracteres de control que queden en los
 * bordes. No valida el código: eso lo hace quien lo busca (`interpretarEntrada`, `resolverCodigo`).
 */
export function quitarPrefijoSufijo(raw: string | null | undefined, lector: LectorDelEquipo): string {
  let s = String(raw ?? "").replace(CONTROL_AL_FINAL, "");
  const prefijo = lector.prefijo;
  if (prefijo && s.startsWith(prefijo)) s = s.slice(prefijo.length);
  return s.replace(CONTROL_AL_PRINCIPIO, "").replace(CONTROL_AL_FINAL, "");
}

/** Las teclas que no escriben nada pero viajan dentro de una ráfaga (el `*` es Shift + 8). */
const MODIFICADORES = new Set(["Shift", "Control", "Alt", "AltGraph", "Meta", "CapsLock"]);

/** La tecla que cierra la lectura según el perfil (con "ninguno", la cierra el tiempo). */
function esFinDeLectura(tecla: string, sufijo: SufijoDelLector): boolean {
  return (sufijo === "enter" && tecla === "Enter") || (sufijo === "tab" && tecla === "Tab");
}

export type LecturaDeRafaga = { tipo: "codigo"; valor: string } | null;

export interface DetectorDeRafaga {
  /**
   * Una tecla, con su momento en ms. Devuelve el código si con ESTA tecla terminó una ráfaga
   * (quien llama tiene que frenar el Enter/Tab: es del lector, no de la pantalla). `repetida` =
   * la tecla se mantiene apretada (no es un lector): corta la ráfaga.
   */
  tecla(tecla: string, t: number, repetida?: boolean): LecturaDeRafaga;
  /** Con sufijo "ninguno": si pasó el umbral desde la última tecla y había una ráfaga, la cierra. */
  vencer(t: number): LecturaDeRafaga;
  /** Olvida lo acumulado (la tecla cayó en un campo, se abrió un diálogo…). */
  reiniciar(): void;
}

/**
 * La máquina de la ráfaga. Una ráfaga es una seguidilla de caracteres con TODOS los intervalos
 * por debajo del umbral, de al menos `minLargo`, que termina con la tecla del perfil (o, con
 * sufijo "ninguno", cuando pasa el umbral sin teclas). Una pausa más larga que el umbral empieza
 * una ráfaga nueva; una tecla que no escribe (flechas, Backspace) la corta.
 */
export function detectorDeRafaga({
  lector,
  umbralMs = UMBRAL_RAFAGA_MS,
  minLargo = MIN_LARGO_RAFAGA,
}: {
  lector: LectorDelEquipo;
  umbralMs?: number;
  minLargo?: number;
}): DetectorDeRafaga {
  let buffer = "";
  let ultimo = Number.NEGATIVE_INFINITY;

  const reiniciar = () => {
    buffer = "";
    ultimo = Number.NEGATIVE_INFINITY;
  };
  const cerrar = (): LecturaDeRafaga => {
    const crudo = buffer;
    reiniciar();
    if (crudo.length < minLargo) return null;
    const valor = quitarPrefijoSufijo(crudo, lector);
    return valor ? { tipo: "codigo", valor } : null;
  };

  return {
    tecla(tecla, t, repetida = false) {
      if (MODIFICADORES.has(tecla)) return null;
      if (repetida) {
        reiniciar();
        return null;
      }
      const rapida = t - ultimo <= umbralMs;
      if (esFinDeLectura(tecla, lector.sufijo)) {
        if (rapida && buffer) return cerrar();
        reiniciar();
        return null;
      }
      // Una tecla que no escribe un carácter (flechas, Escape, Backspace, F2) no es de un lector.
      if ([...tecla].length !== 1) {
        reiniciar();
        return null;
      }
      buffer = rapida ? buffer + tecla : tecla;
      ultimo = t;
      if (buffer.length > MAX_LARGO_RAFAGA) reiniciar();
      return null;
    },
    vencer(t) {
      if (lector.sufijo !== "ninguno" || !buffer || t - ultimo <= umbralMs) return null;
      return cerrar();
    },
    reiniciar,
  };
}

/** Lo mínimo de un elemento para saber si es un campo (los tests pasan objetos a mano). */
export type ObjetivoDeTecla = { tagName?: string; isContentEditable?: boolean } | null | undefined;

/**
 * ¿La tecla cayó en un campo de la pantalla (input, textarea, select o algo editable)? Ahí el
 * teclado es de la persona: ni los atajos ni el lector la interceptan. Es la misma regla que
 * tenían CajaRapida y VenderForm, ahora en un solo lugar.
 */
export function enCampoEditable(target: ObjetivoDeTecla): boolean {
  if (!target) return false;
  return !!target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName ?? "");
}
