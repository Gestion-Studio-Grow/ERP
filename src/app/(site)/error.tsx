"use client";

// Algo falló al dibujar una página del sitio del negocio (P0-3, ronda 2). Sin esto, la falla subía hasta global-error, que
// reemplaza todo el sitio y no se ve de nadie: acá queda el encabezado y el pie del negocio, y se puede reintentar.
//
// Sólo el nombre del negocio (lo trae el layout): nada de CH para otro negocio. El detalle del error nunca se muestra (puede
// filtrar cosas internas): va a la consola con el código que lo cruza con los logs, como global-error.

import { useEffect } from "react";
import Link from "next/link";
import { useDiseno } from "@/lib/diseno/DisenoProvider";
import { useNegocioDelSitio } from "./_ch/negocio-del-sitio";

// `retry` (Next 16): vuelve a pedir la página al servidor. `reset` sólo limpia el estado y, si falló un componente de
// servidor, repetía el mismo error.
export default function ErrorDelSitio({ error, reset, retry }: { error: Error & { digest?: string }; reset: () => void; retry?: () => void }) {
  const nuevo = useDiseno();
  const otraVez = () => (retry ?? reset)();
  const { nombre } = useNegocioDelSitio();

  useEffect(() => {
    console.error(JSON.stringify({ level: "error", scope: "site-error-boundary", digest: error.digest, name: error.name }));
  }, [error]);

  if (nuevo) {
    return (
      <div className="chf">
        <section className="chf-env" style={{ paddingBlock: "clamp(56px, 8vw, 120px)" }} aria-labelledby="chf-err-t">
          <p className="chf-kicker">{nombre}</p>
          <h1 id="chf-err-t" className="chf-h2" style={{ marginTop: 16 }}>
            No pudimos mostrar esta página.
          </h1>
          <p className="chf-lede" style={{ marginTop: 20 }}>
            Fue un problema nuestro. Probá de nuevo; si sigue igual, volvé en unos minutos.
          </p>
          <div className="chf-acc">
            <button type="button" onClick={otraVez} className="chf-btn">
              Probar de nuevo
            </button>
            <Link href="/" className="chf-enlace">
              Volver al inicio
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <section style={{ maxWidth: 640, margin: "0 auto", padding: "clamp(56px, 8vw, 96px) 24px" }} aria-labelledby="sitio-err-t">
      <h1 id="sitio-err-t" style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 480, fontSize: "clamp(1.75rem, 4vw, 2.5rem)", lineHeight: 1.1, margin: 0 }}>
        No pudimos mostrar esta página
      </h1>
      <p style={{ margin: "16px 0 0", lineHeight: 1.6, color: "var(--text-muted)" }}>Fue un problema nuestro. Probá de nuevo; si sigue igual, volvé en unos minutos.</p>
      <div style={{ marginTop: 28, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 24 }}>
        <button
          type="button"
          onClick={otraVez}
          style={{ minHeight: 48, padding: "0 24px", border: 0, cursor: "pointer", background: "var(--text-strong)", color: "var(--text-on-accent)", fontSize: 15 }}
        >
          Probar de nuevo
        </button>
        <Link href="/" style={{ color: "var(--text-strong)", textDecoration: "underline", textUnderlineOffset: 4 }}>
          Volver al inicio
        </Link>
      </div>
    </section>
  );
}
