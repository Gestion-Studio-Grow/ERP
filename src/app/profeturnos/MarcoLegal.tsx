// PROFETURNOS · Marco de las páginas legales (términos, privacidad, arrepentimiento y baja). Sin base
// ni sesión: todo sale de constantes, así las páginas pueden ser estáticas. Res. SCI 424/2020: el
// Botón de arrepentimiento y el de baja a la vista arriba y en el pie, sin cuenta.
// Sello GSG (Gate de Excelencia, bloque 2): crédito en el pie.

import type { ReactNode } from "react";
import Link from "next/link";
import { PROFETURNOS } from "@/lib/factoque-tramites";

const ENLACE = "underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const R = PROFETURNOS.rutaBase;

export default function MarcoLegal({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-body">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded-lg focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-strong"
      >
        Saltar al contenido
      </a>
      <nav aria-label="Arrepentimiento y baja" className="mx-auto flex w-full max-w-3xl flex-wrap justify-end gap-x-4 px-4 py-1 text-sm">
        <Link href={`${R}/arrepentimiento`} className={ENLACE}>
          Botón de arrepentimiento
        </Link>
        <Link href={`${R}/baja`} className={ENLACE}>
          Darme de baja
        </Link>
      </nav>
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <Link href={R} className={`text-lg font-semibold text-strong ${ENLACE}`}>
            {PROFETURNOS.nombre}
          </Link>
          <Link href="/admin/login" className={`text-sm font-medium text-strong ${ENLACE}`}>
            Ingresar
          </Link>
        </div>
      </header>
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-6 text-sm">
          <nav aria-label="Legales" className="flex flex-wrap gap-x-4 gap-y-2">
            <Link href={`${R}/terminos`} className={ENLACE}>
              Términos y condiciones
            </Link>
            <Link href={`${R}/privacidad`} className={ENLACE}>
              Privacidad
            </Link>
            <Link href={`${R}/arrepentimiento`} className={ENLACE}>
              Botón de arrepentimiento
            </Link>
            <Link href={`${R}/baja`} className={ENLACE}>
              Darme de baja
            </Link>
          </nav>
          <p className="m-0 text-muted">Hecho por Gestión Studio Grow</p>
        </div>
      </footer>
    </div>
  );
}
