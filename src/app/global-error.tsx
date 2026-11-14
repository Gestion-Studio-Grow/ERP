"use client";

// Error boundary de ÚLTIMO recurso (Célula 2 — Confiabilidad). Next lo monta cuando
// una excepción escapa al root layout: reemplaza TODO el árbol, por eso trae su
// propio <html>/<body>. Regla de oro: no puede depender de nada que pueda haber
// fallado (branding por-tenant toca DB, globals.css puede no haber cargado) → todo
// inline y sin deps. Objetivo: que una falla parcial muestre una salida digna y un
// botón de reintento en vez de una pantalla en blanco o un stack crudo al cliente.
//
// El detalle del error NO se muestra al usuario (podría filtrar internals); se
// manda a la consola, que en Netlify se ingiere como log estructurado (ver
// src/lib/logger.ts). `error.digest` es el id que Next asigna al error del server
// y que también aparece en los logs → sirve para cruzar el reporte del usuario con
// la línea de log exacta.
//
// Salida (PLAT-005): además de reintentar, «Volver al inicio» con un <a href> común — acá no hay
// layout ni router confiable, así que nada de <Link>. `retry` (Next 16) vuelve a pedir la página al
// servidor; `reset` sólo limpia el estado. Accesibilidad: role="alert", foco al título, botones de 44 px.

import { useEffect, useRef, type CSSProperties } from "react";

const BOTON: CSSProperties = {
  appearance: "none",
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "44px",
  cursor: "pointer",
  borderRadius: "0.625rem",
  padding: "0.75rem 1.5rem",
  fontSize: "0.95rem",
  fontWeight: 600,
  fontFamily: "inherit",
  textDecoration: "none",
};

export default function GlobalError({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  retry?: () => void;
}) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titulo.current?.focus();
  }, []);
  useEffect(() => {
    // Best-effort: si esto también falla, no queremos re-tirar dentro del boundary.
    try {
      console.error(
        JSON.stringify({
          level: "error",
          scope: "global-error-boundary",
          msg: "unhandled error reached global boundary",
          digest: error.digest,
          name: error.name,
          message: error.message,
        }),
      );
    } catch {
      /* noop — el boundary nunca debe romperse a sí mismo */
    }
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          background: "#faf9f7",
          color: "#1a1a1a",
        }}
      >
        <main
          style={{
            maxWidth: "32rem",
            padding: "2.5rem 1.5rem",
            textAlign: "center",
          }}
        >
          <div role="alert">
          <h1
            ref={titulo}
            tabIndex={-1}
            style={{ fontSize: "1.375rem", fontWeight: 600, margin: "0 0 0.5rem", outline: "none" }}
          >
            Se produjo un error inesperado
          </h1>
          <p style={{ color: "#5c5c5c", lineHeight: 1.6, margin: "0 0 2rem" }}>
            Ya quedó registrado y lo estamos viendo. Podés reintentar o volver al
            inicio; si sigue fallando, volvé a entrar en unos minutos.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => (retry ?? reset)()}
              style={{ ...BOTON, border: "none", color: "#fff", background: "#1a1a1a" }}
            >
              Reintentar
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error reemplaza el layout: carga completa a propósito */}
            <a
              href="/"
              style={{ ...BOTON, border: "1.5px solid #d4d1cb", color: "#1a1a1a", background: "#fff" }}
            >
              Volver al inicio
            </a>
          </div>
          {error.digest ? (
            <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "#6b6b6b" }}>
              Código de referencia: <code>{error.digest}</code>
            </p>
          ) : null}
          </div>
        </main>
      </body>
    </html>
  );
}
