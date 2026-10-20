"use client";

// Lo del club que va EN la barra de arriba (quién opera, la hora, el candado), como el club de hoy: una sola barra.
// Con el panel de casa (PanelDeCasa.tsx) se dibuja en su lugar (`#casa-herramientas`); sin él (el club dentro del
// armazón del ERP, o las pruebas), queda donde está. Es la misma pieza: cambia dónde se ve, no qué hace.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const ID_HERRAMIENTAS = "casa-herramientas";

export default function EnLaCabecera({ children, fuera = null }: { children: ReactNode; fuera?: ReactNode }) {
  const [lugar, setLugar] = useState<HTMLElement | null>(null);
  useEffect(() => setLugar(document.getElementById(ID_HERRAMIENTAS)), []);
  if (lugar) return createPortal(children, lugar);
  return fuera ?? children;
}
