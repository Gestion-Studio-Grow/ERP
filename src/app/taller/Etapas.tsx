"use client";

// La barra de etapas de «Así trabajamos» se dibuja una vez al entrar en pantalla. Sin JS, o con
// prefers-reduced-motion, o si ya está a la vista al cargar, queda dibujada: el estado por defecto es el final.
import { useEffect, useRef } from "react";

export default function Etapas({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const ol = ref.current;
    if (!ol || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (ol.getBoundingClientRect().top < window.innerHeight) return;
    ol.dataset.anim = "espera";
    const io = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        // Un cuadro después, para que el estado «espera» llegue a pintarse y la transición corra.
        requestAnimationFrame(() => (ol.dataset.anim = "listo"));
        io.disconnect();
      },
      { threshold: 0.35 },
    );
    io.observe(ol);
    return () => io.disconnect();
  }, []);
  return (
    <ol ref={ref} className="agr-etapas">
      <li aria-hidden="true" className="agr-etapas__linea" />
      {children}
    </ol>
  );
}
