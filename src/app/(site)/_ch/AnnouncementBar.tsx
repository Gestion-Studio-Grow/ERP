"use client";

import { useEffect, useState } from "react";

// Franja de novedad, visible arriba de todo el sitio (no solo en la sección
// #novedades a mitad de página) — es la forma en que marcas como Aesop/COS
// hacen que un aviso se "adopte" sin depender de que el visitante scrollee.
// Se recuerda descartada por id en sessionStorage: si Carolina carga una
// novedad nueva, vuelve a aparecer aunque el cliente ya haya cerrado la
// anterior en esa misma sesión.

const STORAGE_KEY = "ch-news-dismissed";

export default function AnnouncementBar({ id, message }: { id: string; message: string }) {
  const [dismissed, setDismissed] = useState(true); // arranca oculta hasta chequear sessionStorage (evita parpadeo)

  useEffect(() => {
    setDismissed(sessionStorage.getItem(STORAGE_KEY) === id);
  }, [id]);

  if (dismissed) return null;

  return (
    <div style={{ background: "var(--ch-sage-deep)", color: "var(--ch-ivory)" }}>
      <div
        style={{
          maxWidth: 1152,
          margin: "0 auto",
          padding: "10px 24px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <a
          href="#novedades"
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: ".8125rem",
            color: "var(--ch-ivory)",
            textDecoration: "none",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: 9999,
              background: "var(--ch-teal-logo)",
              flexShrink: 0,
              animation: "ch-pulse 2s ease-in-out infinite",
            }}
          />
          <span style={{ textTransform: "uppercase", letterSpacing: ".14em", fontWeight: 600, color: "rgba(243,238,229,.7)", flexShrink: 0 }}>
            Novedad
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{message}</span>
        </a>
        <button
          type="button"
          aria-label="Cerrar aviso"
          onClick={() => {
            sessionStorage.setItem(STORAGE_KEY, id);
            setDismissed(true);
          }}
          style={{
            flexShrink: 0,
            background: "transparent",
            border: 0,
            color: "rgba(243,238,229,.6)",
            fontSize: "1.1rem",
            lineHeight: 1,
            cursor: "pointer",
            padding: 4,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
