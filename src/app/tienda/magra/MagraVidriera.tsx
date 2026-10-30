// VIDRIERA MAGRA — la entrada del servidor (la monta src/app/tienda/page.tsx vía MagraFront.tsx).
//
// Pone las letras de la marca (next/font, sólo en esta ruta), precarga la foto del hero (candidata a
// LCP) y pinta la piel. El estado de la bolsa, los filtros, la ficha y el pedido viven en
// MagraTienda.tsx (navegador); el CSS, en estilos.ts (viaja una vez, en el HTML).

import { preload } from "react-dom";
import { MAGRA_HERO } from "@/tenants/magra-content";
import { magraFuentes } from "./fuentes";
import MagraPiel from "./MagraPiel";
import type { MagraProps } from "./MagraTienda";

export default function MagraVidriera(props: MagraProps) {
  // La foto real de los packs es lo primero que se ve en el celular: que la pida el <head>.
  preload(MAGRA_HERO.src, {
    as: "image",
    fetchPriority: "high",
    imageSrcSet: MAGRA_HERO.srcSet,
    imageSizes: "(max-width: 820px) 100vw, 48vw",
  });
  return <MagraPiel {...props} claseFuentes={magraFuentes} />;
}
