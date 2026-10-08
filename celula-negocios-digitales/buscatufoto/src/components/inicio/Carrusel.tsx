"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Boton, IconoFlecha, Insignia, ModoDemo, Tarjeta } from "@/components/ui";
import type { Funcion } from "@/lib/contenido/funciones";
import s from "./inicio.module.css";

/**
 * Carrusel horizontal de funciones extra: scroll-snap nativo (se mueve con el dedo, la rueda o las
 * flechas del teclado con la pista enfocada) + botones anterior/siguiente.
 */
export function Carrusel({ funciones, titulo }: { funciones: Funcion[]; titulo: string }) {
  const pista = useRef<HTMLUListElement>(null);
  const [inicio, setInicio] = useState(true);
  const [fin, setFin] = useState(false);

  const medir = useCallback(() => {
    const p = pista.current;
    if (!p) return;
    setInicio(p.scrollLeft <= 4);
    setFin(p.scrollLeft + p.clientWidth >= p.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const p = pista.current;
    if (!p) return;
    medir();
    p.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    return () => {
      p.removeEventListener("scroll", medir);
      window.removeEventListener("resize", medir);
    };
  }, [medir]);

  const mover = (dir: 1 | -1) => {
    const p = pista.current;
    if (!p) return;
    const diapo = p.querySelector("li");
    const paso = diapo ? diapo.getBoundingClientRect().width + 14 : p.clientWidth * 0.8;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    p.scrollBy({ left: dir * paso, behavior: quieto ? "auto" : "smooth" });
  };

  return (
    <section className={s.carrusel} aria-roledescription="carrusel" aria-labelledby="titulo-carrusel">
      <div className={s.carruselCabeza}>
        <h3 id="titulo-carrusel" className="titulo-m">
          {titulo}
        </h3>
        <div className={s.carruselBotones}>
          <Boton icono aria-label="Funciones anteriores" aria-controls="pista-funciones" disabled={inicio} onClick={() => mover(-1)}>
            <span style={{ display: "inline-flex", transform: "scaleX(-1)" }}>
              <IconoFlecha />
            </span>
          </Boton>
          <Boton icono aria-label="Funciones siguientes" aria-controls="pista-funciones" disabled={fin} onClick={() => mover(1)}>
            <IconoFlecha />
          </Boton>
        </div>
      </div>
      <ul
        id="pista-funciones"
        ref={pista}
        className={s.pista}
        tabIndex={0}
        aria-label={`${titulo}: usá las flechas para desplazarte`}
      >
        {funciones.map((f, i) => (
          <li
            key={f.id}
            className={`${s.diapo} ${s.conTinte}`}
            data-tinte={f.tinte} aria-roledescription="diapositiva" aria-label={`${i + 1} de ${funciones.length}: ${f.titulo}`}>
            <Tarjeta as="article" className={s.extra}>
              <div className={s.extraInsignias}>
                {f.pro ? <Insignia tono="acento">Pro</Insignia> : null}
                {f.demo ? <ModoDemo /> : null}
                {f.proximamente ? <Insignia>Próximamente</Insignia> : null}
              </div>
              <h4>{f.titulo}</h4>
              <p>{f.corto}</p>
            </Tarjeta>
          </li>
        ))}
      </ul>
    </section>
  );
}
