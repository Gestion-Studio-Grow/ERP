// La placa del profe (fronts/agendaprofe/DISENO.md §5.1): quién es, qué da, cuánto sale y dónde, en
// cuatro líneas, como la placa de horarios que Matías sube a sus historias. Componentes de SERVIDOR:
// llegan enteros en el HTML (la página es force-dynamic y no tiene esqueleto) y no suman JS.
// Lo que el profe no cargó no se dibuja: sin precio no hay «$ 0», sin lugar no hay «Dónde».
//
// Va en dos piezas para el celular: la PRESENTACIÓN (antetítulo, nombre, lema) arriba, compacta, y
// los DETALLES (duración, precio, dónde, la cancha, la regla) después del turnero, así el primer
// horario tocable entra en la primera pantalla de quien llega desde Instagram. En la compu las dos
// van juntas en la columna izquierda, en el orden del diseño.

import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { antetitulo, foco } from "./_estilos";
import { IconoMapa, IconoReloj } from "./_iconos";
import { IlustracionCancha } from "./_logotipo";

const valor = "pz-display pz-num mt-1 block text-[clamp(1.75rem,3vw,2.5rem)] font-bold uppercase leading-none";

export function PresentacionProfe({ nombre, lema }: { nombre: string; lema: string }) {
  return (
    <section aria-labelledby="profe" className="@container">
      <p className={antetitulo}>Profe de pádel</p>
      <h1
        id="profe"
        className="pz-display mt-2 pt-[0.08em] text-[clamp(2.75rem,min(9.5vw,18cqi),7rem)] font-extrabold uppercase leading-[0.88] tracking-[-0.01em] [text-wrap:balance] lg:mt-3"
      >
        {nombre}
      </h1>
      {lema && <p className="mt-2 max-w-[34rem] text-[var(--padel-suave)] lg:mt-4 lg:text-[var(--padel-texto)]">{lema}</p>}
    </section>
  );
}

export function DetallesProfe({
  duracionMin,
  precio,
  lugar,
  maps,
  regla,
  monograma,
}: {
  duracionMin: number;
  /** El precio de la clase individual (null: no se muestra). */
  precio: string | null;
  lugar: string;
  maps: string | null;
  regla: string;
  monograma: string;
}) {
  const datos: { t: string; v: ReactNode; ancho?: boolean }[] = [];
  if (duracionMin > 0) datos.push({ t: "Duración", v: <span className={valor}>{duracionMin} min</span> });
  if (precio) datos.push({ t: "La clase", v: <span className={valor}>{precio}</span> });
  if (lugar)
    datos.push({
      t: "Dónde",
      ancho: true,
      v: maps ? (
        <a href={maps} target="_blank" rel="noopener noreferrer" className={cn("mt-1 inline-flex min-h-11 items-center gap-1.5 text-[1.0625rem] font-semibold text-[var(--padel-cancha)] underline underline-offset-2", foco)} data-qa="lugar">
          <IconoMapa className="size-5 shrink-0" />
          {lugar}
          <span className="sr-only"> (abre el mapa)</span>
        </a>
      ) : (
        <span className="mt-1 block text-[1.0625rem] font-semibold" data-qa="lugar">
          {lugar}
        </span>
      ),
    });

  return (
    <section aria-label="La clase" className="grid gap-5 lg:grid-cols-[minmax(0,12rem)_1fr] lg:items-start">
      {/* Hasta que llegue la foto del profe, la ilustración de la cancha con su monograma (§7). */}
      <IlustracionCancha monograma={monograma} className="order-2 aspect-video lg:order-none lg:aspect-[4/5]" />
      <div className="order-1 grid gap-4 lg:order-none">
        {datos.length > 0 && (
          <dl className="flex flex-wrap gap-x-8 gap-y-4 lg:grid lg:gap-y-4">
            {datos.map((d) => (
              <div key={d.t} className={d.ancho ? "basis-full" : undefined}>
                <dt className={antetitulo}>{d.t}</dt>
                <dd>{d.v}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="flex items-start gap-2 text-[var(--padel-suave)]" data-qa="regla-cancelacion">
          <IconoReloj className="mt-0.5 size-5 shrink-0" />
          <span>{regla}.</span>
        </p>
      </div>
    </section>
  );
}
