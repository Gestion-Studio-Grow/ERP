// FACTURITA · Marco de la vidriera pública (landing, alta, planes y legales): piel Fable en claro,
// el acento verde de Factoque, el papel del talonario, la barra de arriba y el pie. Sin base ni
// sesión (PD-1): todo sale de constantes, así las páginas pueden ser `force-static`.
//
// El CSS de la vidriera (`piel.ts`) se imprime ACÁ, en el servidor: si lo importara un componente
// cliente viajaría dos veces (HTML y JS). Ver vidriera-de-autor §5.

import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { resolveAccent } from "@/lib/branding";
import { BOTON_CHICO, BOTON_PRINCIPAL } from "./estilos";
import { PIEL_FACTURITA } from "./piel";
import BarraFija from "./BarraFija";

const claro = resolveAccent("monte", "light");
const oscuro = resolveAccent("monte", "dark");

const ESTILO_ACENTO = {
  "--tenant-accent-light": claro.accent,
  "--tenant-on-accent-light": claro.onAccent,
  "--tenant-accent-dark": oscuro.accent,
  "--tenant-on-accent-dark": oscuro.onAccent,
} as CSSProperties;

export default function VidrieraMarco({
  children,
  barraFija,
  botonAlta = true,
  alta = false,
}: {
  children: ReactNode;
  /** Celular: barra fija inferior con «Empezar gratis». `tras-cta` = aparece cuando el CTA del héroe sale de pantalla. */
  barraFija?: "siempre" | "tras-cta";
  /** Botón «Empezar gratis» chico en la barra de arriba (sólo compu). En el alta no va: ya estás ahí. */
  botonAlta?: boolean;
  /** El alta lleva su propia barra fija (el botón del paso): reserva el lugar abajo. */
  alta?: boolean;
}) {
  return (
    <div
      data-skin="fable"
      data-theme="light"
      style={ESTILO_ACENTO}
      className="fx"
      data-barra={barraFija ? "" : undefined}
      data-alta={alta ? "" : undefined}
    >
      <style dangerouslySetInnerHTML={{ __html: PIEL_FACTURITA }} />
      <a href="#contenido" className="fx-saltar">
        Saltar al contenido
      </a>
      <header className="fx-barra">
        <div className="fx-caja fx-barra-fila">
          <Link href="/facturita" className="fx-marca">
            <Image src="/facturita/icon.svg" alt="" width={36} height={36} priority />
            Factoque
          </Link>
          <nav aria-label="Factoque" className="fx-nav">
            <Link href="/facturita/planes" className="fx-nav-item">
              Planes
            </Link>
            <Link href="/admin/login" className="fx-nav-item">
              Ingresar
            </Link>
            {botonAlta && (
              <Link href="/facturita/alta" className={`${BOTON_CHICO} fx-solo-compu`}>
                Empezar gratis
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main id="contenido">{children}</main>
      <footer className="fx-pie">
        <div className="fx-caja fx-pie-fila">
          <p>Factoque emite comprobantes electrónicos con el servicio oficial de ARCA.</p>
          <nav aria-label="Legales" className="flex gap-5">
            <Link href="/facturita/terminos">Términos</Link>
            <Link href="/facturita/privacidad">Privacidad</Link>
          </nav>
          <p>Un producto de Gestión Studio Grow</p>
        </div>
      </footer>
      {barraFija && (
        <BarraFija modo={barraFija}>
          <Link href="/facturita/alta" className={BOTON_PRINCIPAL}>
            Empezar gratis
          </Link>
        </BarraFija>
      )}
    </div>
  );
}
