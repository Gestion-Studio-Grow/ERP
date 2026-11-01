"use client";

// Las subpestañas de Diseño dentro de la ficha. El servidor arma los paneles; acá se muestra el que pide `?sub=`, conservando el resto de la dirección (`tab=diseno`).

import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Pestanas } from "@/components/ui";
import { SUBPESTANAS, type SubPestana } from "@/lib/proyectos/diseno-core";

export function SubpestanasDiseno({ paneles }: { paneles: Record<SubPestana, ReactNode> }) {
  const ruta = usePathname();
  const params = useSearchParams();
  const pedida = params.get("sub");
  const actual: SubPestana = SUBPESTANAS.find((s) => s.id === pedida)?.id ?? "tareas";
  const href = (sub: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("tab", "diseno");
    p.set("sub", sub);
    return `${ruta}?${p.toString()}`;
  };
  return (
    <div className="grid min-w-0 gap-4">
      <Pestanas etiqueta="Secciones de Diseño" conRaya pestanas={SUBPESTANAS.map((s) => ({ href: href(s.id), etiqueta: s.label, actual: s.id === actual }))} />
      <div className="min-w-0">{paneles[actual]}</div>
    </div>
  );
}
