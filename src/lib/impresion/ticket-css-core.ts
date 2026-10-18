// ============================================================================
// EL PAPEL DEL TICKET — el documento imprimible de 58 u 80 mm, compartido.
// ============================================================================
//
// Plan: docs/producto/PLAN-TERMINALES-MOSTRADOR.md §6 T-4. Antes cada documento de rollo armaba
// su propio `@page` y su `body` (el ticket de Vender, fijo en 58 mm). Acá queda UNA vez el
// papel: el tamaño de página, el ancho del cuerpo, los márgenes y la letra, para 58 y para 80 mm.
// Lo que cambia según el papel es poco y está a la vista en `MEDIDAS`:
//   · 58 mm (el rollo chico, el de siempre): letra 11 px, márgenes 2 mm arriba y 3 mm a los costados;
//   · 80 mm (el rollo de la PC de caja): letra 12 px, márgenes 3 mm arriba y 4 mm a los costados.
// Abajo siempre 6 mm: lo que necesita la cuchilla para no cortar el último renglón.
//
// Por qué un documento propio y no `window.print()` sobre la pantalla: con la pantalla, la
// impresora de rollo imprime (en blanco) todo el alto de la página y tira papel de más. Se
// imprime desde un iframe invisible (TicketVenta.tsx). Blanco y negro fijos a propósito: es
// papel térmico, no la pantalla del negocio (no lleva la marca ni el modo oscuro).
//
// PURO: devuelve texto. El 58 mm tiene que salir IGUAL, byte a byte, que el ticket de antes
// (lo fija ticket-css-core.test.ts): las impresoras que ya andan no se tocan.

import type { AnchoDeTicket } from "@/lib/terminal/perfil-core";

export type { AnchoDeTicket };

/** Lo que cambia según el ancho del rollo. */
export interface MedidasDelTicket {
  /** Letra del cuerpo, en px. */
  fuente: number;
  /** Letra de los renglones chicos (fecha, detalle), en px. */
  fuenteChica: number;
  /** Margen de arriba y de los costados, en mm (abajo siempre 6 mm). */
  arriba: number;
  costados: number;
}

export const MEDIDAS: Readonly<Record<AnchoDeTicket, Readonly<MedidasDelTicket>>> = Object.freeze({
  58: Object.freeze({ fuente: 11, fuenteChica: 10, arriba: 2, costados: 3 }),
  80: Object.freeze({ fuente: 12, fuenteChica: 11, arriba: 3, costados: 4 }),
});

/** El ancho que de verdad se usa: cualquier cosa que no sea 80 es el rollo chico de siempre. */
export function anchoSeguro(ancho: unknown): AnchoDeTicket {
  return ancho === 80 ? 80 : 58;
}

/** El papel: tamaño de página, ancho del cuerpo, márgenes y letra. */
export function cssDeTicket(ancho: AnchoDeTicket): string {
  const a = anchoSeguro(ancho);
  const m = MEDIDAS[a];
  return (
    `@page{size:${a}mm auto;margin:0}` +
    "html,body{margin:0;padding:0;background:#fff;color:#000}" + // design-lint-ignore — papel térmico, no la pantalla
    `body{width:${a}mm;box-sizing:border-box;padding:${m.arriba}mm ${m.costados}mm 6mm;` +
    `font:${m.fuente}px/1.35 ui-monospace,Menlo,Consolas,monospace}`
  );
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * El documento completo, listo para el `srcdoc` del iframe. `estilos` son los del contenido
 * (renglones, negritas) y van DESPUÉS del papel; `cuerpoHtml` ya viene escapado por quien lo
 * arma. El título va escapado acá.
 */
export function documentoImprimible({
  titulo,
  ancho,
  cuerpoHtml,
  estilos = "",
}: {
  titulo: string;
  ancho: AnchoDeTicket;
  cuerpoHtml: string;
  estilos?: string;
}): string {
  return (
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapar(titulo)}</title><style>` +
    cssDeTicket(ancho) +
    estilos +
    "</style></head><body>" +
    cuerpoHtml +
    "</body></html>"
  );
}
