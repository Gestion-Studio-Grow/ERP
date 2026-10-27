// La piel del profe en las pantallas públicas (turnero, link del alumno, «Este link ya no
// funciona»): inyecta la marca UNA sola vez como variables `--padel-*` en el contenedor raíz.
// Todo lo de adentro pinta con `var(--padel-*)` o con los tokens del tema, nunca con un hex
// (matias-DISENO.md §1.2 · M-052). Sin estado: sirve en servidor y en cliente.

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/components/ui";
import { varsCss, type MarcaProfe } from "@/lib/padel/marca";

export function Piel({ marca, children, className }: { marca: MarcaProfe; children: ReactNode; className?: string }) {
  return (
    <div
      data-piel="padel"
      style={varsCss(marca) as CSSProperties}
      className={cn("min-h-dvh bg-[var(--padel-papel)] font-body text-[var(--padel-texto)]", className)}
    >
      {children}
    </div>
  );
}
