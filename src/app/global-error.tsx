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

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
          <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            Se produjo un error inesperado
          </h1>
          <p style={{ color: "#5c5c5c", lineHeight: 1.6, margin: "0 0 2rem" }}>
            Ya quedó registrado y lo estamos viendo. Podés reintentar; si sigue
            fallando, volvé a entrar en unos minutos.
          </p>
          <button
            onClick={() => reset()}
            style={{
              appearance: "none",
              border: "none",
              cursor: "pointer",
              borderRadius: "0.625rem",
              padding: "0.75rem 1.5rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              color: "#fff",
              background: "#1a1a1a",
            }}
          >
            Reintentar
          </button>
          {error.digest ? (
            <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "#9a9a9a" }}>
              Código de referencia: <code>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
