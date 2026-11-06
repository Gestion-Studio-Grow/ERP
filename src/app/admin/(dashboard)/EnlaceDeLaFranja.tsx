"use client";

// El enlace de la franja del modo simple («Ver todo» / «Volver al modo simple»). Cliente: la franja vive
// en el layout, que NO se redibuja al navegar dentro del panel, así que la ruta que le llega del servidor
// queda vieja (QA 06/11: desde Caja, «Ver todo» volvía a la Agenda). Acá se lee la ruta ACTUAL, con su
// consulta (el día y el turno abierto). Mientras no hay ruta del navegador, la del servidor.
// <a>, no <Link>: la ruta prende una cookie y no se puede precargar.

import { Suspense, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { hrefModoCompleto, hrefVolverASimple } from "@/lib/modo-simple";

export type ModoDeLaFranja = "ver-todo" | "volver";

/** La ruta del panel con su consulta, para volver ahí después de cambiar de modo. */
export function rutaConConsulta(pathname: string, consulta: string): string {
  return consulta ? `${pathname}?${consulta}` : pathname;
}

export function hrefDeLaFranja(modo: ModoDeLaFranja, ruta: string): string {
  return modo === "ver-todo" ? hrefModoCompleto(ruta) : hrefVolverASimple(ruta);
}

const CLASE = "inline-flex min-h-12 items-center font-semibold text-strong underline underline-offset-4";

function Enlace({ modo, ruta, children }: { modo: ModoDeLaFranja; ruta: string; children: ReactNode }) {
  return (
    <a href={hrefDeLaFranja(modo, ruta)} data-modo-simple={modo} className={CLASE}>
      {children}
    </a>
  );
}

function EnlaceConRutaActual({ modo, children }: { modo: ModoDeLaFranja; children: ReactNode }) {
  const pathname = usePathname();
  const consulta = useSearchParams().toString();
  return (
    <Enlace modo={modo} ruta={rutaConConsulta(pathname, consulta)}>
      {children}
    </Enlace>
  );
}

export default function EnlaceDeLaFranja({ modo, rutaDelServidor, children }: { modo: ModoDeLaFranja; rutaDelServidor: string; children: ReactNode }) {
  return (
    <Suspense fallback={<Enlace modo={modo} ruta={rutaDelServidor}>{children}</Enlace>}>
      <EnlaceConRutaActual modo={modo}>{children}</EnlaceConRutaActual>
    </Suspense>
  );
}
