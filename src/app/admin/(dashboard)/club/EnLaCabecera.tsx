"use client";

// Lo del club que va EN la barra de arriba (quién opera, la hora, el candado), como el club de hoy: una sola barra.
// Con el panel de casa (PanelDeCasa.tsx) se dibuja en su lugar (`#casa-herramientas`); sin él (el club dentro del
// armazón del ERP, o las pruebas), queda donde está. Es la misma pieza: cambia dónde se ve, no qué hace.
//
// La barra tiene un LUGAR FIJO para cada herramienta (`casa-buscar`, `casa-ficha`, `casa-reloj`, en ese orden, como
// el club de hoy): cada pieza va a su lugar, así el orden en pantalla (y el del Tab) no depende de cuál se monta
// primero (el bloqueo, que pone la ficha, baja en su propio chunk). Sin ese lugar (otro armazón), va a las
// herramientas a secas.

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const ID_HERRAMIENTAS = "casa-herramientas";
/** Los lugares de la barra, en el orden en que se ven: el buscador, la ficha de quien opera y el reloj. */
export const LUGARES_DE_LA_BARRA = ["casa-buscar", "casa-ficha", "casa-reloj"] as const;
export type LugarDeLaBarra = (typeof LUGARES_DE_LA_BARRA)[number];

/**
 * `fuera`: lo que se ve sin barra (en vez de `children`); `ademas`: lo que se ve abajo cuando sí va en la barra.
 * `en`: dónde de la cabecera — las herramientas de la barra (default) o uno de sus lugares fijos, las cintas finas de
 * arriba (`casa-cintas`) o el menú del candado (`casa-menu`, MenuDeLaCasa.tsx).
 */
export default function EnLaCabecera({
  children,
  fuera = null,
  ademas = null,
  en = ID_HERRAMIENTAS,
}: {
  children: ReactNode;
  fuera?: ReactNode;
  ademas?: ReactNode;
  en?: typeof ID_HERRAMIENTAS | LugarDeLaBarra | "casa-cintas" | "casa-menu";
}) {
  // El club corre sólo en el navegador (ClubCargador, ssr: false): el lugar ya está en el DOM al montar.
  const [lugar] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    const propio = document.getElementById(en);
    if (propio) return propio;
    return (LUGARES_DE_LA_BARRA as readonly string[]).includes(en) ? document.getElementById(ID_HERRAMIENTAS) : null;
  });
  if (lugar) return (
    <>
      {createPortal(children, lugar)}
      {ademas}
    </>
  );
  return fuera ?? children;
}
