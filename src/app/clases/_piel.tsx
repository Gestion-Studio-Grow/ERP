// La piel del profe en las pantallas públicas (turnero, link del alumno, «Este link ya no
// funciona»): inyecta la marca UNA sola vez como variables `--padel-*` en el contenedor raíz.
// Todo lo de adentro pinta con `var(--padel-*)` o con los tokens del tema, nunca con un hex
// (matias-DISENO.md §1.2 · M-052). Sin estado: sirve en servidor y en cliente.
//
// Además trae la letra y el movimiento de la piel (fronts/agendaprofe/DISENO.md §3 y §8) en un
// `<style>` chico renderizado acá (componente de servidor: viaja en el HTML, no en el JS):
//  · la condensada de cancha para títulos (`.pz-display`) y el cuerpo: Barlow Condensed y Barlow
//    por `next/font` en un módulo propio (`fuentes.ts`), importado sólo acá: viajan y se precargan
//    únicamente en las pantallas del profe, nunca desde el layout común;
//  · la línea de cancha que se «pinta» una vez (clip-path, nunca la opacidad del titular), la hoja
//    que sube y el pulso de las sugeridas; con `prefers-reduced-motion`, todo quieto.

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/components/ui";
import { varsCss, type MarcaProfe } from "@/lib/padel/marca";
import { clasesFuentes } from "./fuentes";

const CSS_PIEL = `
[data-piel=padel]{--pz-display:var(--pz-fuente-display),sans-serif;--pz-cuerpo:var(--pz-fuente-cuerpo),system-ui,sans-serif;--pz-curva:cubic-bezier(.2,.8,.2,1);font-family:var(--pz-cuerpo)}
[data-piel=padel] .pz-display{font-family:var(--pz-display)}
[data-piel=padel] .pz-num{font-variant-numeric:lining-nums tabular-nums}
[data-piel=padel] .pz-linea{animation:pz-pinta .6s var(--pz-curva) both}
@keyframes pz-pinta{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
[data-piel=padel] dialog[open] .pz-hoja{animation:pz-sube .24s var(--pz-curva) both}
@keyframes pz-sube{from{transform:translateY(100%)}to{transform:none}}
@media (min-width:1024px){@keyframes pz-sube{from{transform:translateY(1.5rem)}to{transform:none}}}
[data-piel=padel] .pz-pulso{animation:pz-pulso .4s var(--pz-curva) 1}
@keyframes pz-pulso{50%{transform:scale(1.04)}}
[data-piel=padel] .pz-aparece{animation:pz-aparece .18s var(--pz-curva) both}
@keyframes pz-aparece{from{transform:scale(0)}to{transform:scale(1)}}
[data-piel=padel] .pz-ancla{scroll-margin-top:1rem}
@media (prefers-reduced-motion:reduce){[data-piel=padel] *,[data-piel=padel] *::before,[data-piel=padel] *::after{animation:none!important;transition-duration:0ms!important}}
`.replace(/\n/g, "");

export function Piel({ marca, children, className }: { marca: MarcaProfe; children: ReactNode; className?: string }) {
  return (
    <div
      data-piel="padel"
      style={varsCss(marca) as CSSProperties}
      className={cn(clasesFuentes, "min-h-dvh bg-[var(--padel-papel)] text-[var(--padel-texto)]", className)}
    >
      <style>{CSS_PIEL}</style>
      {children}
    </div>
  );
}
