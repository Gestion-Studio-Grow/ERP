"use client";

import { useSyncExternalStore } from "react";
import { Boton, IconoLuna, IconoSol } from "@/components/ui";

type Tema = "claro" | "oscuro";
const oyentes = new Set<() => void>();

function leer(): Tema {
  return document.documentElement.getAttribute("data-tema") === "claro" ? "claro" : "oscuro";
}

function suscribir(o: () => void) {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

export function AlternadorTema() {
  const tema = useSyncExternalStore(suscribir, leer, () => "oscuro" as Tema);
  const otro: Tema = tema === "oscuro" ? "claro" : "oscuro";
  return (
    <Boton
      variante="fantasma"
      icono
      aria-label={`Cambiar a tema ${otro}`}
      title={`Tema ${otro}`}
      onClick={() => {
        document.documentElement.setAttribute("data-tema", otro);
        try {
          localStorage.setItem("btf:tema", otro);
        } catch {}
        oyentes.forEach((o) => o());
      }}
    >
      {tema === "oscuro" ? <IconoLuna /> : <IconoSol />}
    </Boton>
  );
}
