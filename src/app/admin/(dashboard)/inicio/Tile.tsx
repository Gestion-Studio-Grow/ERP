// El botón de una app en el Inicio: ícono, nombre, para qué sirve y, si lleva, su número.
// Todo el tile es el link (táctil entero, ≥ 44 px); el número llega aparte por streaming.
//
// El alfiler de "Mis apps" va AL LADO del link, encima de su esquina, no adentro: un botón
// dentro de un link no se puede usar con teclado. Con Tab se pasa por el tile y después por su
// alfiler. La fila del nombre deja libre esa esquina (`pr-9`) para que no quede abajo del alfiler;
// el número, más abajo, usa el ancho entero.

import Link from "next/link";
import { Suspense } from "react";
import type { AppDescriptor } from "@/apps/contract";
import type { Role } from "@/lib/capabilities";
import { IconoApp } from "@/components/iconos-apps";
import { todayInBusinessTz } from "@/lib/datetime";
import { hrefDelTile } from "./href-del-tile";
import NumeroKpi, { NumeroCargando } from "./NumeroKpi";
import BotonFijar from "./BotonFijar";

export default function Tile({
  app,
  role,
  conNumero,
  fijada,
}: {
  app: AppDescriptor;
  role: Role;
  conNumero: boolean;
  /** `undefined` = sin alfiler. `true`/`false` = está o no en "Mis apps". */
  fijada?: boolean;
}) {
  const conAlfiler = fijada !== undefined;
  return (
    <div className="relative h-full">
      <Link
        href={hrefDelTile(app, todayInBusinessTz(), conNumero)}
        className="flex h-full min-h-11 flex-col gap-3 rounded-xl border border-line bg-surface-raised p-4 shadow-xs transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span className={`flex items-start gap-3 ${conAlfiler ? "pr-9" : ""}`}>
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <IconoApp nombre={app.icono} />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold leading-snug text-strong">{app.nombre}</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-muted">{app.descripcion}</span>
          </span>
        </span>
        {conNumero && (
          <Suspense fallback={<NumeroCargando />}>
            <NumeroKpi appId={app.id} role={role} />
          </Suspense>
        )}
      </Link>
      {conAlfiler && <BotonFijar appId={app.id} nombre={app.nombre} fijada={fijada} className="absolute right-1.5 top-1.5" />}
    </div>
  );
}
