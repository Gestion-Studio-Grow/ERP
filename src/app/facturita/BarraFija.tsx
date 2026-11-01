"use client";

// FACTURITA · Barra fija inferior del celular (DISENO.md §6): un solo botón «Empezar gratis»,
// siempre a un toque. En la home aparece cuando el CTA del héroe (#cta-heroe) sale de pantalla;
// en planes está siempre. Sin JS se ve siempre (el CSS sólo la esconde con `scripting: enabled`).
// No re-renderiza: el estado vive en atributos del propio nodo (data-visible / inert).

import { useEffect, useRef, type ReactNode } from "react";

export default function BarraFija({ modo, children }: { modo: "siempre" | "tras-cta"; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const barra = ref.current;
    if (!barra) return;
    const mostrar = (si: boolean) => {
      if (si) barra.setAttribute("data-visible", "");
      else barra.removeAttribute("data-visible");
      barra.inert = !si;
    };
    const cta = modo === "tras-cta" ? document.getElementById("cta-heroe") : null;
    if (!cta || typeof IntersectionObserver === "undefined") {
      mostrar(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => {
      // Se muestra cuando el CTA del héroe ya no está en pantalla (scrolleaste más allá).
      mostrar(!e.isIntersecting);
    });
    io.observe(cta);
    return () => io.disconnect();
  }, [modo]);

  return (
    <div ref={ref} className="fx-barrafija" data-modo={modo}>
      {children}
    </div>
  );
}
