"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ReserveButton from "./ReserveButton";

const navLink: React.CSSProperties = { color: "var(--text-strong)", textDecoration: "none", transition: "color var(--ch-transicion)", fontSize: 14 };

// `brandName` viene del tenant (ficha de marca, RFC-004-D; el layout siempre lo pasa). Ausente → nombre neutro: el
// nombre de CH no es el de cualquier negocio (P0 ronda 2, fail-open).
//
// `nuevo` lo pone el layout SÓLO para CH con el interruptor «Diseño nuevo» prendido (DISENO.md §5.1 y §6):
// marca de palabra, nav grande y «Reservar» petróleo de 52 px (en el celular, 56 px de alto y «Reservar» con
// borde: el acceso principal es la barra fija de abajo). Sin `nuevo`, el encabezado de siempre, igual.
export default function Header({ hasNews, brandName, nuevo }: { hasNews?: boolean; brandName?: string; nuevo?: boolean }) {
  const label = brandName?.trim() || "Reservas";
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (nuevo) {
    return (
      <header className="chf-cab" data-bajo={scrolled ? "" : undefined}>
        <div className="chf-cab-env">
          <Link href="/#top" aria-label={`${label} — inicio`} className="chf-marca">
            {label}
          </Link>
          <nav className="chf-nav" aria-label="Principal">
            {hasNews && <Link href="/#novedades">Novedades</Link>}
            <Link href="/servicios">Servicios</Link>
            <Link href="/#equipo">Equipo</Link>
            <Link href="/#contacto">Cómo llegar</Link>
            <ReserveButton clase="chf-btn">Reservar</ReserveButton>
          </nav>
        </div>
      </header>
    );
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "color-mix(in srgb, var(--surface) 90%, transparent)",
        backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${scrolled ? "var(--line)" : "transparent"}`,
        transition: "border-color var(--ch-transicion)",
      }}
    >
      <div style={{ maxWidth: 1152, margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/#top" aria-label={`${label} — inicio`} style={{ display: "flex", alignItems: "center", minHeight: 44, gap: 8, textDecoration: "none" }}>
          {/* 24px = "texto grande" WCAG 1.4.3 → umbral 3:1 (el acento del tenant sobre
              el hueso da 4.26:1, AA de texto grande sobrado) sin tocar el color de marca. */}
          <span className="ch-marca" style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 24, color: "var(--accent)", lineHeight: 1 }}>{label}</span>
        </Link>
        <nav style={{ display: "flex", alignItems: "center", gap: 24 }} aria-label="Principal">
          {/* El link a Novedades se muestra SOLO si hay novedades cargadas: si no, era un ancla
              muerta a una sección vacía (el caso de CH, que no publica novedades). */}
          {hasNews && (
            <Link href="/#novedades" style={{ ...navLink, position: "relative" }} className="hidden sm:inline">
              Novedades
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: -2,
                  right: -8,
                  width: 6,
                  height: 6,
                  borderRadius: 9999,
                  background: "var(--accent)",
                  animation: "ch-pulse 2s ease-in-out infinite",
                }}
              />
            </Link>
          )}
          {/* Va a la CARTA COMPLETA, no al ancla de la vitrina: quien abre "Servicios"
              del menú casi siempre viene a mirar precios. */}
          <Link href="/servicios" style={navLink} className="hidden min-h-11 items-center sm:inline-flex">Servicios</Link>
          <Link href="/#equipo" style={navLink} className="hidden min-h-11 items-center sm:inline-flex">Equipo</Link>
          <Link href="/#contacto" style={navLink} className="hidden min-h-11 items-center sm:inline-flex">Cómo llegar</Link>
          <ReserveButton variant="nav" />
        </nav>
      </div>
    </header>
  );
}
