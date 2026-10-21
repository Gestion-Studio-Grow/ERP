// EL PANEL DE UN NEGOCIO CON CASA (`casa` en el registro de apps): su backoffice es UNA app — Break Point, el club —
// sin el menú general del ERP. Mismo motor, misma base y mismo login; la pantalla es la del negocio. Arriba, una
// cabecera propia (marca, las pocas apps que acompañan y «Salir»); abajo, la app a todo el ancho. La piel es la del
// negocio (`data-estetica` en la raíz del layout, src/lib/estetica-backoffice.ts).

import Link from "next/link";
import type { ReactNode } from "react";
import type { AppDescriptor } from "@/apps/contract";
import FormCerrarSesion from "../FormCerrarSesion";
import ThemeToggle from "./ThemeToggle";

export default function PanelDeCasa({
  apps,
  brandName,
  monogram,
  logo,
  userName,
  children,
}: {
  /** La casa primero y las de cuenta que la persona puede abrir (`appsDeLaCasa`). */
  apps: readonly AppDescriptor[];
  brandName: string;
  monogram: string;
  /** El logo del cliente (LogoDelNegocio); sin él, monograma y nombre. */
  logo?: ReactNode;
  userName: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface text-body">
      <header data-casa="cabecera" className="sticky top-0 z-30">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-2.5">
          <span className="mr-auto flex min-w-0 items-center gap-2.5">
            {logo ?? (
              <>
                <span aria-hidden="true" data-casa="monograma" className="grid size-9 shrink-0 place-items-center rounded-md text-sm font-bold">
                  {monogram}
                </span>
                <span data-casa="marca" className="truncate text-lg font-bold">{brandName}</span>
              </>
            )}
          </span>
          {/* Lo que la app pone en la barra (el club: quién opera, la hora, el candado): club/EnLaCabecera.tsx. */}
          <div id="casa-herramientas" data-casa="herramientas" className="flex flex-wrap items-center gap-2 empty:hidden" />
          {apps.length > 1 && (
            <nav aria-label="Panel" className="flex items-center gap-1">
              {apps.map((a) => (
                <Link key={a.id} href={a.ruta} data-casa="enlace" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold">
                  {a.nombre}
                </Link>
              ))}
            </nav>
          )}
          {/* Claro u oscuro: lo elige quien usa el panel y se recuerda en el equipo (igual que en el resto del ERP). */}
          <ThemeToggle />
          <FormCerrarSesion>
            <button type="submit" data-casa="enlace" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold" aria-label={`Salir (${userName})`}>
              Salir
            </button>
          </FormCerrarSesion>
        </div>
      </header>
      {children}
      {/* Sello GSG: crédito discreto en el backoffice (estándar de marca), nunca en la vidriera del cliente. */}
      <p className="px-4 py-6 text-center text-xs text-faint">Con tecnología de Gestión Studio Grow</p>
    </div>
  );
}
