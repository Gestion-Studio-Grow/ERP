"use client";

// LAS ANCLAS DE LA PÁGINA NO SUMAN «ATRÁS» (ronda 2, QA de Magra vuelta 2, MEDIA). Un `<a href="#cortes">` empuja una
// entrada del historial SIN el estado de Next; después del pedido (gracias), «atrás» cae en esa entrada y Next la
// ignora (`app-router.js`: `if (!event.state) return`): la dirección dice `/tienda#cortes` y la pantalla sigue en
// gracias. Hacía falta un segundo «atrás». Acá la ancla se resuelve en la página: se desplaza hasta la sección, le
// pasa el foco (como un salto al contenido) y REEMPLAZA la dirección en vez de empujar otra.

import { useEffect } from "react";
import { estadoPropio } from "./historial";

export function useAnclasSinHistorial(): void {
  useEffect(() => {
    const alTocar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href^='#']");
      if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self")) return;
      const id = decodeURIComponent(a.getAttribute("href")!.slice(1));
      if (!id) return;
      const destino = id === "top" ? document.getElementById("top") : document.getElementById(id);
      if (!destino && id !== "top") return; // ancla rota: que haga lo de siempre
      e.preventDefault();
      const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (destino) destino.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
      else window.scrollTo({ top: 0, behavior: suave ? "smooth" : "auto" });
      if (destino) {
        if (!destino.matches("a[href], button, input, select, textarea, [tabindex]")) destino.setAttribute("tabindex", "-1");
        destino.focus({ preventScroll: true });
      }
      window.history.replaceState(estadoPropio(), "", `${window.location.pathname}${window.location.search}#${encodeURIComponent(id)}`);
    };
    document.addEventListener("click", alTocar);
    return () => document.removeEventListener("click", alTocar);
  }, []);
}
