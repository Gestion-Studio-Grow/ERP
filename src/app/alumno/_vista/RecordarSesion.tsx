"use client";

// Al abrir /alumno/<token>, este teléfono queda recordado (cookie httpOnly que escribe el servidor):
// la próxima vez el turnero saluda («Hola Juan») y el ícono instalado abre /mis-clases. Una sola
// vez por visita; no pinta nada.

import { useEffect, useRef } from "react";
import { recordarToken } from "@/lib/padel/acciones-alumno";

export function RecordarSesion({ token }: { token: string }) {
  const hecho = useRef(false);
  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    recordarToken(token).catch(() => {});
  }, [token]);
  return null;
}
