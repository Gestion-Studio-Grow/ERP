// La raíz de la bandeja del mostrador boutique: la hoja del renglón (la estructura de las columnas)
// con la piel de Vender encima (piel-de-la-bandeja.ts). Sin directiva: corre en el servidor.
// La hoja propia viaja como <style> con `href` + `precedence`: React la sube al <head> una vez.
// Sin precargar la letra del renglón: la bandeja usa la del panel y la precarga quedaba sin usar.
import type { ReactNode } from "react";
import { ConDiseno } from "@/lib/diseno/ConDiseno";
import { PIEL_RENGLON, PRECEDENCIA_DEL_DISENO } from "@/lib/diseno/diseno";
import { CSS_DE_LA_PIEL, PIEL_DEL_MOSTRADOR } from "./piel-de-la-bandeja";

export function PielDeLaBandeja({ children }: { children: ReactNode }) {
  return (
    <div data-diseno={PIEL_RENGLON} data-piel={PIEL_DEL_MOSTRADOR}>
      <style href="piel-mostrador-bandeja" precedence={PRECEDENCIA_DEL_DISENO}>
        {CSS_DE_LA_PIEL}
      </style>
      <ConDiseno nuevo precargarLetra={false}>
        {children}
      </ConDiseno>
    </div>
  );
}
