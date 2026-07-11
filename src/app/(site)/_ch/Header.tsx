"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ReserveButton from "./ReserveButton";

const navLink: React.CSSProperties = { color: "var(--text-strong)", textDecoration: "none", transition: "color .2s", fontSize: 14 };

// `brandName` viene del tenant (ficha de marca, RFC-004-D). Ausente → "CH Estética"
// (compat con la prod de CH). Un tenant no-CH ya no muestra el logo de CH.
export default function Header({ hasNews, brandName }: { hasNews?: boolean; brandName?: string }) {
  const label = brandName?.trim() || "CH Estética";
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "color-mix(in srgb, var(--surface) 90%, transparent)",
        backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${scrolled ? "var(--line)" : "transparent"}`,
        transition: "border-color .3s",
      }}
    >
      <div style={{ maxWidth: 1152, margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/#top" aria-label={`${label} — inicio`} style={{ display: "flex", alignItems: "baseline", gap: 8, textDecoration: "none" }}>
          {/* 24px = "texto grande" WCAG 1.4.3 → umbral 3:1 (el acento del tenant sobre
              el hueso da 4.26:1, AA de texto grande sobrado) sin tocar el color de marca. */}
          <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 24, color: "var(--accent)", lineHeight: 1 }}>{label}</span>
        </Link>
        <nav style={{ display: "flex", alignItems: "center", gap: 24 }} aria-label="Principal">
          <Link href="/#novedades" style={{ ...navLink, position: "relative" }} className="hidden sm:inline">
            Novedades
            {hasNews && (
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
            )}
          </Link>
          <Link href="/#servicios" style={navLink} className="hidden sm:inline">Servicios</Link>
          <Link href="/#equipo" style={navLink} className="hidden sm:inline">Equipo</Link>
          <Link href="/#contacto" style={navLink} className="hidden sm:inline">Cómo llegar</Link>
          <ReserveButton variant="nav" />
        </nav>
      </div>
    </header>
  );
}
