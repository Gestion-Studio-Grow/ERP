"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";

// Aparición sutil al hacer scroll (fade + translateY), respetando
// prefers-reduced-motion. Si el usuario prefiere menos movimiento, se muestra
// directo sin animar.
export default function Reveal({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visto, setVisto] = useState(false);
  // La preferencia se lee como lo que es — estado del navegador, no estado de
  // React — así llega en el primer render y no hace falta un `setState` dentro del
  // efecto (que costaba un render extra por cada bloque revelable de la página).
  const reduce = usePrefersReducedMotion();
  const shown = reduce || visto;

  useEffect(() => {
    if (reduce) return; // sin animación: ya se muestra, no hay nada que observar
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisto(true);
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(16px)",
        transition: "opacity var(--ch-transicion), transform var(--ch-transicion)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
