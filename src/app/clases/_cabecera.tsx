// La cabecera de las pantallas públicas del profe: la misma en el turnero, en «Mis clases» y en
// «Este link ya no funciona». La noche del club arriba y, abajo, la LÍNEA DE CANCHA (6 px blancos
// sobre 14 px de azul: la línea de fondo vista desde arriba), que se pinta una vez de izquierda a
// derecha al cargar (clip-path; nunca la opacidad del titular). Es la firma de la marca y cuesta
// cero bytes (fronts/agendaprofe/DISENO.md §5.1). Va adentro de <Piel>: lee los colores de `--padel-*`.

import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export function CabeceraPublica({
  antetitulo,
  titulo,
  logo,
  marca,
  derecha,
  lema,
  detalle,
  grande = false,
}: {
  /** La línea chica de arriba (el nombre del negocio, o «Clases de pádel»). */
  antetitulo?: ReactNode;
  /** El H1 de la pantalla. En el turnero no va acá: el nombre del profe es el H1 de la placa. */
  titulo?: ReactNode;
  /** Con autorización registrada (ADR-034): el logo del profe reemplaza al antetítulo. */
  logo?: { src: string; alt: string } | null;
  /** El logotipo tipográfico (texto, no imagen): reemplaza al antetítulo. */
  marca?: ReactNode;
  /** A la derecha: «Mis clases» o «¿Ya sos alumno?». */
  derecha?: ReactNode;
  lema?: ReactNode;
  detalle?: ReactNode;
  /** El turnero (la vidriera) va al ancho de la placa; el link del alumno, compacto. */
  grande?: boolean;
}) {
  const ancho = grande ? "max-w-[76rem] px-[clamp(1rem,4vw,3.5rem)]" : "max-w-[35rem] px-4";
  return (
    <header className="bg-[var(--padel-tinta)] text-[var(--padel-sobre-tinta)]">
      <div className={cn("mx-auto flex min-h-[5.5rem] items-center justify-between gap-4 py-4 lg:min-h-[6.5rem]", ancho)}>
        <div className="min-w-0">
          {marca ??
            (logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo.src} alt={logo.alt} className="h-14 w-auto lg:h-[4.5rem]" />
            ) : (
              antetitulo && <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.2em] opacity-85">{antetitulo}</p>
            ))}
        </div>
        {derecha && <div className="shrink-0">{derecha}</div>}
      </div>
      {(titulo || lema || detalle) && (
        <div className={cn("mx-auto pb-5", ancho)}>
          {titulo && <h1 className="pz-display text-[clamp(2.25rem,7vw,3rem)] font-extrabold leading-[0.95] tracking-[-0.005em] [text-wrap:balance]">{titulo}</h1>}
          {lema && <p className="mt-2 text-base opacity-90">{lema}</p>}
          {detalle && <p className="mt-2 text-sm opacity-85">{detalle}</p>}
        </div>
      )}
      <div aria-hidden className="h-5 bg-[var(--padel-cancha)]">
        <div className="pz-linea h-1.5 bg-[var(--padel-sobre-tinta)]" />
      </div>
    </header>
  );
}
