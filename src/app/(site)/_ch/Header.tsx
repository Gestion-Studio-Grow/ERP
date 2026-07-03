"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ReserveButton from "./ReserveButton";

const navLink: React.CSSProperties = { color: "var(--ch-ink)", textDecoration: "none", transition: "color .2s", fontSize: 14 };

export default function Header({ hasNews }: { hasNews?: boolean }) {
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
        background: "rgba(243,238,229,.9)",
        backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${scrolled ? "var(--ch-hairline)" : "transparent"}`,
        transition: "border-color .3s",
      }}
    >
      <div style={{ maxWidth: 1152, margin: "0 auto", padding: "0 24px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/#top" aria-label="CH Estética — inicio" style={{ display: "flex", alignItems: "baseline", gap: 8, textDecoration: "none" }}>
          <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 24, color: "var(--ch-teal-logo)", lineHeight: 1 }}>CH</span>
          <span style={{ textTransform: "uppercase", letterSpacing: ".22em", fontWeight: 600, fontSize: ".75rem", color: "var(--ch-mocha)" }}>Estética</span>
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
                  background: "var(--ch-teal-logo)",
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
