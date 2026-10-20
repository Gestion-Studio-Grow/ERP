"use client";

// Lo del club que va EN la barra de arriba (quién opera, la hora, el candado), como el club de hoy: una sola barra.
// Con el panel de casa (PanelDeCasa.tsx) se dibuja en su lugar (`#casa-herramientas`); sin él (el club dentro del
// armazón del ERP, o las pruebas), queda donde está. Es la misma pieza: cambia dónde se ve, no qué hace.

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const ID_HERRAMIENTAS = "casa-herramientas";

/** `fuera`: lo que se ve sin barra (en vez de `children`); `ademas`: lo que se ve abajo cuando sí va en la barra. */
export default function EnLaCabecera({ children, fuera = null, ademas = null }: { children: ReactNode; fuera?: ReactNode; ademas?: ReactNode }) {
  // El club corre sólo en el navegador (ClubCargador, ssr: false): el lugar ya está en el DOM al montar.
  const [lugar] = useState<HTMLElement | null>(() => (typeof document === "undefined" ? null : document.getElementById(ID_HERRAMIENTAS)));
  if (lugar) return (
    <>
      {createPortal(children, lugar)}
      {ademas}
    </>
  );
  return fuera ?? children;
}
