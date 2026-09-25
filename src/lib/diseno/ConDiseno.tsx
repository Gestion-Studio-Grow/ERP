// ============================================================================
// ConDiseno — lo que un layout monta adentro de su raíz para el diseño nuevo.
// ============================================================================
//
// Prendido: la hoja de la piel (`<link precedence>`, ver HOJAS_DEL_DISENO), la precarga de su letra
// y el provider de `useDiseno()`. Apagado: devuelve su hijo TAL CUAL, sin envolverlo en nada. El atributo
// `data-diseno="renglon"` lo pone cada layout en su propia raíz (acá no hay raíz).
//
// UN SOLO HIJO, siempre: apagado, ese hijo queda en el mismo lugar del árbol que antes de existir
// ConDiseno, así que ni el HTML ni el payload RSC que viaja adentro del HTML cambian. Con dos
// hijos devolvería un arreglo y el payload ganaría un nivel. Lo mide raices-ch.test.ts.
//
// Va DESPUÉS de <AdminThemeScript />: ese script corrige el tema de `currentScript.parentElement`
// y tiene que seguir siendo el primer hijo de la raíz. Las hojas no ocupan lugar en la raíz:
// React las sube al <head>.
//
// Sin directiva: en un layout (servidor) corre en el servidor y sólo deja lo que devuelve.

import type { ReactNode } from "react";
import { preload } from "react-dom";
import { DisenoProvider } from "./DisenoProvider";
import { HOJAS_DEL_DISENO, LETRA_DEL_DISENO, PRECEDENCIA_DEL_DISENO } from "./diseno";

export function ConDiseno({ nuevo, children }: { nuevo: boolean; children: ReactNode }) {
  if (!nuevo) return children;
  // La letra se pide ya (no cuando el navegador termine de leer la hoja): menos tiempo con el
  // respaldo. `preload` de React la sube al <head> una sola vez aunque haya dos layouts.
  preload(LETRA_DEL_DISENO, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <>
      {HOJAS_DEL_DISENO.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence={PRECEDENCIA_DEL_DISENO} />
      ))}
      <DisenoProvider nuevo>{children}</DisenoProvider>
    </>
  );
}
