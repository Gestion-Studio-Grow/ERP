// FACTURITA · Marco de la vidriera pública (landing, alta, planes y legales): piel Fable en claro,
// el acento cobre de la marca (preset `cobre`, branding.ts), el papel del talonario, la barra de arriba y el pie. Sin base ni
// sesión (PD-1): todo sale de constantes, así las páginas pueden ser `force-static`.
//
// El CSS de la vidriera (`piel.ts`) se imprime ACÁ, en el servidor: si lo importara un componente
// cliente viajaría dos veces (HTML y JS). Ver vidriera-de-autor §5.

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { resolveAccent } from "@/lib/branding";
import { BOTON_CHICO, BOTON_PRINCIPAL } from "./estilos";
import { PIEL_FACTURITA } from "./piel";
import BarraFija from "./BarraFija";
import LogoFactoque from "./LogoFactoque";
import { LogoGSG } from "@/components/marca/MarcaGSG";
import { MarcaDeAgua } from "@/components/marca/MarcaDeAgua";
import { ISOTIPO_FACTOQUE } from "@/lib/factoque-icono";

const claro = resolveAccent("cobre", "light");
const oscuro = resolveAccent("cobre", "dark");

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
      className="fx isolate"
      data-barra={barraFija ? "" : undefined}
      data-alta={alta ? "" : undefined}
    >
      <style dangerouslySetInnerHTML={{ __html: PIEL_FACTURITA }} />
      {/* Marca de agua: mosaico del isotipo de Factoque (la vidriera es de un producto de GSG). */}
      <MarcaDeAgua geometria={ISOTIPO_FACTOQUE} className="text-[color:var(--fx-tinta)]" />
      <a href="#contenido" className="fx-saltar">
        Saltar al contenido
      </a>
      {/* Res. SCI 424/2020: el botón de arrepentimiento en la PRIMERA pantalla, a la vista y sin cuenta
          (también en el pie). Arriba de la barra, en una línea chica: no tapa el alta. */}
      <nav aria-label="Arrepentimiento y baja" className="fx-caja fx-chico" style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", columnGap: 16, paddingBlock: 4 }}>
        <Link href="/facturita/arrepentimiento" className="fx-enlace">
          Botón de arrepentimiento
        </Link>
        <Link href="/facturita/baja" className="fx-enlace">
          Darme de baja
        </Link>
      </nav>
      <header className="fx-barra">
        <div className="fx-caja fx-barra-fila">
          <Link href="/facturita" className="fx-marca">
            <LogoFactoque alto={64} />
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
        {/* Madre y producto en la misma pieza (logo-madre-final.md §8.3): manda Factoque con su respaldo «Powered by
            Gestión Studio Grow» (≥ 88 px); la madre va en v10 A2 a la mitad de su alto (112 → 56, el mínimo de la v10),
            separada por más que el área de respeto de los dos (20 + 10 px). En el celular el lockup de 112 no entra
            (403 px de ancho): queda sólo Factoque con respaldo, a todo el ancho, y el respaldo ya nombra a GSG. */}
        <div className="fx-caja fx-pie-firma">
          <LogoFactoque alto={112} respaldo className="fx-pie-producto" />
          <a href="https://gsgapp.com.ar/" className="fx-pie-madre fx-solo-compu" aria-label="Gestión Studio Grow (se abre en otra pestaña)" target="_blank" rel="noopener noreferrer">
            <LogoGSG alto={56} />
          </a>
        </div>
        <div className="fx-caja fx-pie-fila">
          <p>Factoque emite comprobantes electrónicos con el servicio oficial de ARCA.</p>
          <nav aria-label="Legales" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/facturita/terminos">Términos</Link>
            <Link href="/facturita/privacidad">Privacidad</Link>
            {/* Res. SCI 424/2020 y Res. 316/2018: en todas las pantallas de la vidriera, sin cuenta. */}
            <Link href="/facturita/arrepentimiento">Botón de arrepentimiento</Link>
            <Link href="/facturita/baja">Darme de baja</Link>
          </nav>
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
