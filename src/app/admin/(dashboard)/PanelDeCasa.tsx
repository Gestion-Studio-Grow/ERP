// EL PANEL DE UN NEGOCIO CON CASA (`casa` en el registro de apps): su backoffice es UNA app — Break Point, el club —
// sin el menú general del ERP. Mismo motor, misma base y mismo login; la pantalla es la del negocio. Arriba, una
// cabecera propia (marca, las pocas apps que acompañan y «Salir»); abajo, la app a todo el ancho. Con estética
// propia (src/lib/club/estetica.ts) toma la piel que se definió con el cliente; sin ella, la del ERP.

import Link from "next/link";
import type { ReactNode } from "react";
import type { AppDescriptor } from "@/apps/contract";
import type { EsteticaDelClub } from "@/lib/club/estetica";
import { archivo } from "@/lib/club/estetica-fuente";
import FormCerrarSesion from "../FormCerrarSesion";

export default function PanelDeCasa({
  apps,
  brandName,
  monogram,
  userName,
  estetica,
  children,
}: {
  /** La casa primero y las de cuenta que la persona puede abrir (`appsDeLaCasa`). */
  apps: readonly AppDescriptor[];
  brandName: string;
  monogram: string;
  userName: string;
  estetica: EsteticaDelClub | null;
  children: ReactNode;
}) {
  return (
    <div data-estetica-club={estetica ?? undefined} className={estetica ? `${archivo.variable} min-h-screen bg-surface text-body` : "min-h-screen bg-surface text-body"}>
      <header data-casa="cabecera" className="sticky top-0 z-30">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-2.5">
          <span className="mr-auto flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" data-casa="monograma" className="grid size-9 shrink-0 place-items-center rounded-md text-sm font-bold">
              {monogram}
            </span>
            <span data-casa="marca" className="truncate text-lg font-bold">{brandName}</span>
          </span>
          {apps.length > 1 && (
            <nav aria-label="Panel" className="flex items-center gap-1">
              {apps.map((a) => (
                <Link key={a.id} href={a.ruta} data-casa="enlace" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold">
                  {a.nombre}
                </Link>
              ))}
            </nav>
          )}
          <FormCerrarSesion>
            <button type="submit" data-casa="enlace" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold" aria-label={`Salir (${userName})`}>
              Salir
            </button>
          </FormCerrarSesion>
        </div>
      </header>
      {children}
    </div>
  );
}
