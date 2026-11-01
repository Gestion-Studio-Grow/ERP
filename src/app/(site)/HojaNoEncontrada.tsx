// El cuerpo del 404 de la vidriera, sin nada de ningún negocio en particular: el nombre llega por prop (el suyo, o ninguno) y los
// colores y la letra son los del layout del sitio. El de CH con el diseño nuevo es otro (_ch/NoEncontradaCH.tsx), con su piel.

import type { CSSProperties } from "react";
import Link from "next/link";

export type EnlaceDeVuelta = { href: string; etiqueta: string };

const BOTON: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 44,
  padding: "0 20px",
  background: "var(--accent)",
  color: "var(--text-on-accent)",
  fontWeight: 600,
  textDecoration: "none",
};
const ENLACE: CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: 44, color: "var(--accent)", fontWeight: 600 };

export default function HojaNoEncontrada({
  nombre,
  titulo,
  detalle,
  enlaces,
}: {
  /** El nombre del negocio; `null` si no tiene uno legible: neutro. */
  nombre: string | null;
  titulo: string;
  detalle: string;
  enlaces: readonly EnlaceDeVuelta[];
}) {
  return (
    <section aria-labelledby="no-encontrada-t" style={{ maxWidth: 1152, margin: "0 auto", padding: "clamp(56px, 8vw, 120px) 24px" }}>
      {nombre && <p style={{ margin: 0, fontSize: ".875rem", fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--accent)" }}>{nombre}</p>}
      <h1 id="no-encontrada-t" style={{ margin: "16px 0 0", fontFamily: "var(--font-display), Georgia, serif", fontSize: "clamp(2rem, 5vw, 3.25rem)", fontWeight: 400, lineHeight: 1.1, overflowWrap: "anywhere" }}>
        {titulo}
      </h1>
      <p style={{ margin: "20px 0 0", maxWidth: 560, fontSize: "1.125rem", lineHeight: 1.5 }}>{detalle}</p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 24px", marginTop: 32 }}>
        {enlaces.map((e, i) => (
          <Link key={e.href} href={e.href} style={i === 0 ? BOTON : ENLACE}>
            {e.etiqueta}
          </Link>
        ))}
      </div>
    </section>
  );
}
