"use client";

// La agenda de HOY se actualiza sola (punto 9, U6): una reserva de la web aparece sin recargar. Cuida la
// base: una relectura por minuto y sólo con la pantalla a la vista, sin un cajón abierto ni alguien
// tipeando. Al volver a la pestaña después de un rato, una sola. No es un aviso (eso requiere construirse).

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CADA_MS, tocaRefrescar } from "./refresco-core";

export function RefrescoDeAgenda() {
  const router = useRouter();
  const ultimo = useRef(0);
  useEffect(() => {
    ultimo.current = Date.now();
    const probar = () => {
      const activo = document.activeElement;
      const hay = tocaRefrescar({
        visible: document.visibilityState === "visible",
        ocupada: document.querySelector("dialog[open]") !== null || activo instanceof HTMLInputElement || activo instanceof HTMLTextAreaElement || activo instanceof HTMLSelectElement,
        desdeElUltimo: Date.now() - ultimo.current,
      });
      if (!hay) return;
      ultimo.current = Date.now();
      router.refresh();
    };
    const reloj = setInterval(probar, CADA_MS);
    document.addEventListener("visibilitychange", probar);
    return () => {
      clearInterval(reloj);
      document.removeEventListener("visibilitychange", probar);
    };
  }, [router]);
  return null;
}
