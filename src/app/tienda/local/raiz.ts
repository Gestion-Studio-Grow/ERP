// La raíz de toda pantalla de «Pedí Local» (vidriera, Mi cuenta, textos legales): la clase de la
// piel, las variables de la marca del local (marca.ts), la clase de su letra (fuentes.ts) y los
// atributos que la hoja usa para pintar la banda y la letra. Sin marca, piel GSG.

import type { CSSProperties } from "react";
import type { PielDelLocal } from "@/lib/delivery-local/marca";
import { manrope } from "./fuentes";

export function atributosDeRaiz(piel: PielDelLocal, clase: string) {
  return {
    className: piel.letra === "manrope" ? `${clase} ${manrope.variable}` : clase,
    style: piel.variables as CSSProperties,
    "data-marca": piel.variables["--pl-primario"] ? "" : undefined,
    "data-banda": piel.banda ? "" : undefined,
    "data-letra": piel.letra ?? undefined,
  };
}
