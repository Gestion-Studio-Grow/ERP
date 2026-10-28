// FACTURITA · Marco de la vidriera pública (landing, alta y planes): piel Fable en claro, el
// acento ámbar del producto, la barra de arriba y el pie. Sin base ni sesión (PD-1): todo sale
// de constantes, así las tres páginas pueden ser `force-static`.

import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { resolveAccent } from "@/lib/branding";
import { FOCO } from "./estilos";

const claro = resolveAccent("ambar", "light");
const oscuro = resolveAccent("ambar", "dark");

const ESTILO_ACENTO = {
  "--tenant-accent-light": claro.accent,
  "--tenant-on-accent-light": claro.onAccent,
  "--tenant-accent-dark": oscuro.accent,
  "--tenant-on-accent-dark": oscuro.onAccent,
} as CSSProperties;

export default function VidrieraMarco({ children }: { children: ReactNode }) {
  return (
    <div data-skin="fable" data-theme="light" style={ESTILO_ACENTO} className="min-h-screen bg-surface text-body">
      <a
        href="#contenido"
        className={`sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface-raised focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-strong ${FOCO}`}
      >
        Saltar al contenido
      </a>
      <header className="border-b border-line bg-surface-raised">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/facturita" className={`flex items-center gap-2 rounded-lg ${FOCO}`}>
            <Image src="/facturita/icon.svg" alt="" width={32} height={32} />
            <span className="text-lg font-semibold tracking-tight text-strong">Facturita</span>
          </Link>
          <nav aria-label="Facturita" className="flex items-center gap-1 text-sm font-medium">
            <Link href="/facturita/planes" className={`rounded-lg px-3 py-2 text-muted hover:text-strong ${FOCO}`}>
              Planes
            </Link>
            <Link href="/admin/login" className={`rounded-lg px-3 py-2 text-muted hover:text-strong ${FOCO}`}>
              Ingresar
            </Link>
          </nav>
        </div>
      </header>
      <main id="contenido">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-xs text-faint sm:flex-row sm:justify-between sm:px-6">
          <p>Facturita emite comprobantes electrónicos con el servicio oficial de ARCA.</p>
          <nav aria-label="Legales" className="flex gap-4">
            <Link href="/facturita/terminos" className={`rounded hover:text-strong ${FOCO}`}>Términos</Link>
            <Link href="/facturita/privacidad" className={`rounded hover:text-strong ${FOCO}`}>Privacidad</Link>
          </nav>
          <p>Un producto de Gestión Studio Grow</p>
        </div>
      </footer>
    </div>
  );
}
