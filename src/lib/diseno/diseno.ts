// ============================================================================
// DISEÑO NUEVO («Renglón») — lo que ven los dos lados. Client-safe.
// ============================================================================
//
// El diseño nuevo se prende POR NEGOCIO con el interruptor "Diseño nuevo" (`diseno-nuevo`,
// src/cambios/interruptores.ts): una fila de la consola del operador, sin deploy, y en CH sólo
// la escribe el dueño. Prendido, cada layout del negocio (panel, ingreso, contador, Facturita)
// pone `data-diseno="renglon"` en su raíz y envuelve su contenido con `ConDiseno`. La piel vive
// en una hoja SIN capa acotada bajo `[data-diseno="renglon"]`: sin el atributo no toca nada. La
// consola del operador lo lleva siempre (la usa sólo GSG).
//
// Apagado (CH hoy): la raíz no lleva el atributo, no se monta el provider ni se pide ninguna hoja.
// El HTML es el de siempre; lo prueban src/lib/diseno/raices-ch.test.ts (las raíces) y
// src/app/admin/(dashboard)/armazon/armazon-ch.test.ts (el armazón).
//
// Dónde se pregunta:
//   · servidor: `await disenoNuevo()` (diseno.server.ts), una lectura por pedido compartida con el
//     resto de los interruptores. Si la lectura falla, APAGADO.
//   · cliente: `useDiseno()` (DisenoProvider.tsx). Sin provider (CH), `false`.
// Los dos devuelven un booleano a propósito: `if (useDiseno())` no puede dar "prendido" por error.
//
// Sin Prisma ni nada de servidor: lo importan los layouts, ConDiseno y los tests.

import { VERSION_HOJA } from "@/design/hoja-version";
import { LETRA } from "@/design/fuentes";

/** El valor de `data-diseno` en la raíz de un layout con el diseño nuevo. */
export const PIEL_RENGLON = "renglon";

/** El atributo de la raíz. Apagado, no se escribe: la raíz queda como siempre. */
export const ATRIBUTO_DISENO = "data-diseno";

/**
 * La hoja de la piel, servida con `<link rel="stylesheet" precedence>` SÓLO con el diseño nuevo
 * prendido: la pone `ConDiseno`, React la sube al `<head>` y no la repite entre layouts. Así un
 * negocio apagado no descarga ni un byte de la piel. Es un archivo estático de `public/` (no un
 * `import` de CSS, que Next metería en el CSS de toda la ruta, CH incluido). La `?v=` cambia con
 * cada cambio de la hoja (src/design/hoja.ts la genera y hoja.test.ts la vigila). Una sola hoja:
 * piezas y armazón juntos (≤ 30 KB gzip).
 */
export const HOJAS_DEL_DISENO: readonly string[] = [`/diseno/renglon.css?v=${VERSION_HOJA}`];

/** La letra (src/design/fuentes.ts): se precarga sólo con el diseño nuevo, para que llegue con la hoja. */
export const LETRA_DEL_DISENO = LETRA.archivo;

/**
 * El grupo de precedencia de la hoja. Next pone el CSS importado en el grupo "next" (en el
 * servidor de desarrollo, "next_<archivo>"), que se descubre antes que este: la piel queda después.
 */
export const PRECEDENCIA_DEL_DISENO = "diseno-renglon";
