// ============================================================================
// EL CAMPO ÚNICO — la ráfaga del lector sin foco, para TODO negocio con balanza.
// ============================================================================
//
// En Vender, el lector que pasa la etiqueta "sin tocar nada" (el foco quedó en un botón, o en la
// página después de cobrar) se escucha con `useLectorDeRafaga` (terminal/usar-lector.ts) y el
// criterio de `VenderForm.tsx:626-635`. Ahí sólo andaba con el módulo `terminal` (el perfil del
// equipo trae el prefijo y el sufijo del lector). El campo único lo prende para todo negocio con
// formato de balanza guardado (E02, MG-020), con el lector de fábrica: sin prefijo y con Enter.
//
// El criterio de QUÉ tecla se mira es el mismo que en Vender: fuera de un campo donde la persona
// escribe (una casilla o un medio de pago tocado no cuentan) o en el peso/cantidad de un renglón,
// y sin un diálogo abierto. En el propio campo único tampoco: ahí lo que entra lo lee su Enter.
//
// PURO: sin React ni `window`. Lo prueba rafaga.test.ts.

import { enCampoDeTexto, esCampoDeCantidad, type LectorDelEquipo, type ObjetivoDeTecla } from "@/lib/terminal/lector-core";

/** El lector de fábrica: sin prefijo, termina con Enter (lo que manda casi todo lector HID). */
export const LECTOR_DE_FABRICA: Readonly<LectorDelEquipo> = Object.freeze({ prefijo: "", sufijo: "enter" });

/**
 * ¿Esta tecla la mira el lector de ráfaga? Mismo criterio que `VenderForm.tsx:626-635`. PURA.
 * `dialogoAbierto` = hay un `dialog[open]` en la página.
 */
export function teclaParaLaRafaga(objetivo: ObjetivoDeTecla, dialogoAbierto: boolean): boolean {
  return (!enCampoDeTexto(objetivo) || esCampoDeCantidad(objetivo)) && !dialogoAbierto;
}

/** ¿Se escucha sin foco? Lo que diga quien integra; si no dice, sí cuando hay balanza. PURA. */
export function rafagaPrendida(rafaga: boolean | undefined, hayBalanza: boolean): boolean {
  return rafaga ?? hayBalanza;
}
