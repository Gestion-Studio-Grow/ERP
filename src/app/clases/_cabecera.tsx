// La cabecera de las pantallas públicas del profe: la misma en el turnero, en «Mis clases» y en
// «Este link ya no funciona». La cancha de noche arriba, el filete verde abajo, el nombre del
// profe en Fraunces (la única vez que aparece la tipografía display en lo público, §1.2).
// Va adentro de <Piel>: lee los colores de `--padel-*`.

import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export function CabeceraPublica({
  antetitulo,
  titulo,
  logo,
  lema,
  detalle,
  grande = false,
}: {
  /** La línea chica de arriba (el nombre del negocio, o «Clases de pádel»). */
  antetitulo?: ReactNode;
  titulo: ReactNode;
  /** Con autorización registrada (ADR-034): el logo del profe reemplaza al antetítulo. */
  logo?: { src: string; alt: string } | null;
  lema?: ReactNode;
  detalle?: ReactNode;
  /** El turnero (la vidriera) va más alto; el link del alumno, compacto. */
  grande?: boolean;
}) {
  return (
    <header
      className={cn(
        "border-b-[5px] border-[var(--padel-cancha)] bg-[var(--padel-tinta)] px-4 text-[var(--padel-sobre-tinta)]",
        grande ? "pb-6 pt-5" : "py-4",
      )}
    >
      <div className="mx-auto max-w-[35rem]">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo.src} alt={logo.alt} className="h-14 w-auto" />
        ) : (
          antetitulo && <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">{antetitulo}</p>
        )}
        <h1
          className={cn(
            "mt-1 font-display leading-tight",
            grande ? "text-[2.25rem] tracking-[-0.03em]" : "text-[1.6875rem] tracking-[-0.02em]",
          )}
        >
          {titulo}
        </h1>
        {lema && <p className="mt-1 text-base opacity-90">{lema}</p>}
        {detalle && <p className="mt-2 text-sm opacity-80">{detalle}</p>}
      </div>
    </header>
  );
}
