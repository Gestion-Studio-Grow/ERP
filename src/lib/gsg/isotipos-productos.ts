/**
 * Isotipos de los productos de GSG con identidad propia (MARCA-005, 10/11/2026) — fuente ÚNICA del dibujo.
 *
 * Misma gramática que la madre y que Factoque F06-A: trazo 10 con esquinas rectas, luz mínima 8 y un nudo cobre de
 * 10 × 10 en el punto de acción (skill `marca-gsg`, § 1 y § 4). Están en curvas (rectángulos), viewBox 100.
 * ELEGIDOS POR EL DUEÑO (10/11/2026) en el tablero https://claude.ai/artifact/FauBQcFMGjm78s4Wcy4oV5:
 * Comerciante C1 «Mostrador» y Contador K3 «Carpeta». Módulo PURO: lo usan server components y tests.
 */

import type { ProductoConMarca } from "../producto-identidad";
import { ISOTIPO_FACTOQUE, type GeometriaFactoque } from "../factoque-icono";

export type GeometriaIsotipo = GeometriaFactoque;

/** Comerciante · C1 «Mostrador»: el toldo y el mostrador del local; el nudo es la venta que se factura sola. */
export const ISOTIPO_COMERCIANTE: GeometriaIsotipo = {
  viewBox: "0 0 100 100",
  forma: "M5 10h90v10H5zM5 55h90v10H5zM15 55h10v40H15zM75 55h10v40H75z",
  nudo: "M45 37h10v10H45z",
};

/** Contador · K3 «Carpeta»: la carpeta del cliente con su solapa; el nudo es el comprobante adentro, en su lugar. */
export const ISOTIPO_CONTADOR: GeometriaIsotipo = {
  viewBox: "0 0 100 100",
  // El trazo «M10 90V15H40V27H90V90Z» (10, esquinas rectas) pasado a curvas: 0 píxeles de diferencia con el tablero.
  forma: "M5 10h10v85H5zM15 10h30v10H15zM35 20h10v12H35zM45 22h50v10H45zM85 32h10v63H85zM15 85h70v10H15z",
  nudo: "M45 52h10v10H45z",
};

const ISOTIPOS: Record<ProductoConMarca, GeometriaIsotipo> = {
  comerciante: ISOTIPO_COMERCIANTE,
  contador: ISOTIPO_CONTADOR,
  facturita: ISOTIPO_FACTOQUE,
};

/** El isotipo del producto, o `null` en el ERP vertical (ahí manda la marca del negocio). */
export function isotipoDeProducto(producto: ProductoConMarca | null | undefined): GeometriaIsotipo | null {
  return producto ? ISOTIPOS[producto] ?? null : null;
}
