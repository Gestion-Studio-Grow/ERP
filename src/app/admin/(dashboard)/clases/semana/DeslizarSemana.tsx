"use client";

// Deslizar de costado cambia de semana (M-057). Un gesto mayormente horizontal de 60 px o más
// (direccionDeslizar, probado en _agenda-core.test.ts); lo vertical sigue siendo scroll. Los
// botones ‹ › hacen lo mismo para quien no desliza (teclado, lector de pantalla). Sin animación:
// la semana nueva aparece en su lugar.

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { direccionDeslizar } from "../_agenda-core";

export function DeslizarSemana({ anterior, siguiente, children }: { anterior: string; siguiente: string; children: React.ReactNode }) {
  const router = useRouter();
  const inicio = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      onTouchStart={(e) => {
        const t = e.touches[0];
        inicio.current = t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0];
        const i = inicio.current;
        inicio.current = null;
        if (!t || !i) return;
        // Un deslizar que arranca en una cinta que se desplaza de costado no cambia de semana.
        if ((e.target as HTMLElement).closest?.("[data-sin-deslizar]")) return;
        const d = direccionDeslizar(t.clientX - i.x, t.clientY - i.y);
        if (d) router.push(d === "siguiente" ? siguiente : anterior);
      }}
      data-qa="deslizar-semana"
    >
      {children}
    </div>
  );
}
