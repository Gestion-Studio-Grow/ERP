"use client";

// Lo del club que va EN la barra de arriba (quién opera, la hora, el candado), como el club de hoy: una sola barra.
// Con el panel de casa (PanelDeCasa.tsx) se dibuja en su lugar (`#casa-herramientas`); sin él (el club dentro del
// armazón del ERP, o las pruebas), queda donde está. Es la misma pieza: cambia dónde se ve, no qué hace.

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const ID_HERRAMIENTAS = "casa-herramientas";

/**
 * `fuera`: lo que se ve sin barra (en vez de `children`); `ademas`: lo que se ve abajo cuando sí va en la barra.
 * `en`: dónde de la cabecera — las herramientas de la barra (default), las cintas finas de arriba (`casa-cintas`) o el
 * menú del candado (`casa-menu`, MenuDeLaCasa.tsx).
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
  en?: typeof ID_HERRAMIENTAS | "casa-cintas" | "casa-menu";
}) {
  // El club corre sólo en el navegador (ClubCargador, ssr: false): el lugar ya está en el DOM al montar.
  const [lugar] = useState<HTMLElement | null>(() => (typeof document === "undefined" ? null : document.getElementById(en)));
  if (lugar) return (
    <>
      {createPortal(children, lugar)}
      {ademas}
    </>
  );
  return fuera ?? children;
}
