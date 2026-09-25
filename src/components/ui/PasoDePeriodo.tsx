// PASO DE PERÍODO (diseño «Renglón»): «‹ 23/09 · Jueves 24 de septiembre · 25/09 ›» o
// «‹ agosto · Septiembre 2026 · octubre ›». Son enlaces (cada período tiene su URL: se comparte y
// «Atrás» vuelve), con toques de 44 px en el celular, y el período actual escrito, no un campo de
// fecha. Lo usan Caja (cierre y libro), Cierre del mes, Resultado, Retenciones, Libro IVA y Ventas.
//
// Presentacional (sin "use client"): sirve en servidor y en cliente.

import Link from "next/link";
import { cn } from "./cn";

export type PasoDelPeriodo = { href: string; texto: string } | null;

export function PasoDePeriodo({
  etiqueta,
  actual,
  anterior,
  siguiente,
  volver,
  className,
}: {
  /** Qué se recorre, para el lector de pantalla («Día», «Mes»). */
  etiqueta: string;
  /** El período que se está mirando, escrito («Jueves 24 de septiembre»). */
  actual: string;
  anterior: PasoDelPeriodo;
  siguiente: PasoDelPeriodo;
  /** Volver al período de hoy, si no se está en él («Hoy», «Este mes»). */
  volver?: PasoDelPeriodo;
  className?: string;
}) {
  const tecla =
    "inline-flex min-h-11 items-center gap-1 rounded px-2.5 text-sm text-muted hover:bg-surface-sunken hover:text-strong sm:min-h-9";
  return (
    <nav aria-label={etiqueta} className={cn("flex flex-wrap items-center gap-x-1 gap-y-1", className)}>
      {anterior ? (
        <Link href={anterior.href} rel="prev" className={tecla} aria-label={`${etiqueta} anterior: ${anterior.texto}`}>
          <span aria-hidden>‹</span> {anterior.texto}
        </Link>
      ) : null}
      <span aria-current="page" className="px-1.5 text-sm font-semibold text-strong">
        {actual}
      </span>
      {siguiente ? (
        <Link href={siguiente.href} rel="next" className={tecla} aria-label={`${etiqueta} siguiente: ${siguiente.texto}`}>
          {siguiente.texto} <span aria-hidden>›</span>
        </Link>
      ) : null}
      {volver ? (
        <Link href={volver.href} className={cn(tecla, "font-medium text-accent-ink")}>
          {volver.texto}
        </Link>
      ) : null}
    </nav>
  );
}
