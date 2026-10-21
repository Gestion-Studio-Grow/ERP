// EL PANEL DE UN NEGOCIO CON CASA (`casa` en el registro de apps): su backoffice es UNA app — Break Point, el club —
// sin el menú general del ERP. Mismo motor, misma base y mismo login; la pantalla es la del negocio. Arriba, una
// cabecera propia (marca, las pocas apps que acompañan y «Salir»); abajo, la app a todo el ancho. La piel es la del
// negocio (`data-estetica` en la raíz del layout, src/lib/estetica-backoffice.ts).

import Link from "next/link";
import { Montserrat } from "next/font/google";
import type { ReactNode } from "react";
import type { AppDescriptor } from "@/apps/contract";
import FormCerrarSesion from "../FormCerrarSesion";
import MenuDeLaCasa from "./MenuDeLaCasa";
import ThemeToggle from "./ThemeToggle";

// La letra del logo de Break Point y de «GESTIÓN / DEL CLUB» al lado, como el club de hoy (club.html: Montserrat 500).
// Va como variable (`--font-montserrat`) en la cabecera; la usa sólo la piel de Break Point (club/piel/armazon.css),
// y con `preload: false` el archivo lo baja sólo quien la pinta (no todo /admin).
const montserrat = Montserrat({ weight: "500", subsets: ["latin"], variable: "--font-montserrat", display: "swap", preload: false });

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
      {/* Las cintas finas de arriba de todo (la demo, el aviso al dueño): la app las pone por portal (club/EnLaCabecera). */}
      <div id="casa-cintas" data-casa="cintas" className="flex flex-col empty:hidden" />
      <header data-casa="cabecera" className={`sticky top-0 z-30 ${montserrat.variable}`}>
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
          {/* Lo que la app pone en la barra (el club: quién opera, la hora, el candado): club/EnLaCabecera.tsx. Cada
              herramienta tiene su lugar fijo, en el orden del club de hoy (buscador, quién opera, reloj): así no depende
              de cuál se monta primero. Sin nada adentro, la barra no deja el hueco. */}
          <div id="casa-herramientas" data-casa="herramientas" className="flex flex-wrap items-center gap-2 [&:not(:has(>*>*))]:hidden">
            <span id="casa-buscar" data-casa="lugar" className="contents" />
            <span id="casa-ficha" data-casa="lugar" className="contents" />
            <span id="casa-reloj" data-casa="lugar" className="contents" />
          </div>
          {/* En el celular las otras apps (Usuarios) van adentro del candado: la barra entra en un renglón. */}
          {apps.length > 1 && (
            <nav aria-label="Panel" className="flex items-center gap-1 max-sm:hidden">
              {apps.map((a) => (
                <Link key={a.id} href={a.ruta} data-casa="enlace" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold">
                  {a.nombre}
                </Link>
              ))}
            </nav>
          )}
          {/* El candado: bloquear la pantalla (lo pone la app) y «Salir», como el club de hoy. Después, claro u oscuro
              (lo elige quien usa el panel y se recuerda en el equipo, igual que en el resto del ERP). */}
          <MenuDeLaCasa>
            {apps.length > 1 && (
              <nav aria-label="Panel" className="flex flex-col gap-1 border-b border-line pb-1 sm:hidden">
                {apps.map((a) => (
                  <Link key={a.id} href={a.ruta} className="flex min-h-11 items-center rounded-sm px-3 text-sm font-semibold hover:bg-surface-sunken">
                    {a.nombre}
                  </Link>
                ))}
              </nav>
            )}
            <FormCerrarSesion>
              <button type="submit" className="flex min-h-11 w-full items-center rounded-sm px-3 text-left text-sm font-semibold hover:bg-surface-sunken">
                Salir del sistema ({userName})
              </button>
            </FormCerrarSesion>
          </MenuDeLaCasa>
          <ThemeToggle />
        </div>
      </header>
      {children}
      {/* Sello GSG: crédito discreto en el backoffice (estándar de marca), nunca en la vidriera del cliente. */}
      <p className="px-4 py-6 text-center text-xs text-faint">Con tecnología de Gestión Studio Grow</p>
    </div>
  );
}
