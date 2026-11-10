"use client";

// La navegación fija por secciones de la carta de «Pedí Local»: queda pegada arriba al bajar, marca
// la sección que se está viendo (IntersectionObserver, sin escuchar el scroll) y lleva a cada una
// con un toque. Con reduced-motion el salto es instantáneo. Chips de 44 px, `aria-current` en la
// sección actual y el chip activo siempre a la vista (se desliza el riel, no la página).

import { useEffect, useRef, useState, type MouseEvent } from "react";
import s from "./local.module.css";

export default function IndiceDeLaCarta({ secciones }: { secciones: readonly { id: string; titulo: string }[] }) {
  const [activa, setActiva] = useState(secciones[0]?.id ?? "");
  const riel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visibles = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) visibles.set(e.target.id.replace(/^cat-/, ""), e.isIntersecting);
        const primera = secciones.find((x) => visibles.get(x.id));
        if (primera) setActiva(primera.id);
      },
      // La franja de «lo que se está leyendo»: debajo de la barra fija, en el tercio de arriba.
      { rootMargin: "-80px 0px -60% 0px" },
    );
    for (const x of secciones) {
      const el = document.getElementById(`cat-${x.id}`);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [secciones]);

  useEffect(() => {
    const r = riel.current;
    const chip = r?.querySelector<HTMLElement>(`[data-seccion="${activa}"]`);
    if (!r || !chip) return;
    const izq = chip.offsetLeft - r.clientWidth / 2 + chip.clientWidth / 2;
    r.scrollTo({ left: Math.max(0, izq), behavior: "auto" });
  }, [activa]);

  function ir(e: MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(`cat-${id}`);
    if (!el) return;
    e.preventDefault();
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" });
    window.history.replaceState(null, "", `#cat-${id}`);
    setActiva(id);
    // El foco va a la sección: el teclado y el lector siguen desde ahí.
    el.focus({ preventScroll: true });
  }

  return (
    <nav aria-label="Secciones de la carta" className={s.indice}>
      <div className={s.indiceRiel} ref={riel}>
        {secciones.map((x) => (
          <a
            key={x.id}
            href={`#cat-${x.id}`}
            data-seccion={x.id}
            aria-current={x.id === activa ? "true" : undefined}
            className={s.indiceChip}
            onClick={(e) => ir(e, x.id)}
          >
            {x.titulo}
          </a>
        ))}
      </div>
    </nav>
  );
}
