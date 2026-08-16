"use client";

import { useSyncExternalStore } from "react";

// Franja de novedad, visible arriba de todo el sitio (no solo en la sección
// #novedades a mitad de página) — es la forma en que marcas como Aesop/COS
// hacen que un aviso se "adopte" sin depender de que el visitante scrollee.
// Se recuerda descartada por id en sessionStorage: si Carolina carga una
// novedad nueva, vuelve a aparecer aunque el cliente ya haya cerrado la
// anterior en esa misma sesión.

const STORAGE_KEY = "ch-news-dismissed";

// sessionStorage no avisa cuando cambia en la MISMA pestaña, así que el descarte
// se anuncia a mano con este evento; el `subscribe` de abajo lo escucha para que la
// franja desaparezca sin re-render forzado desde afuera.
const EVENTO_DESCARTE = "ch-news-dismiss";

function subscribeDescarte(onChange: () => void): () => void {
  window.addEventListener(EVENTO_DESCARTE, onChange);
  return () => window.removeEventListener(EVENTO_DESCARTE, onChange);
}

function leerDescartada(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // storage bloqueado (incógnito): la franja se muestra, no rompe
  }
}

export default function AnnouncementBar({ id, message }: { id: string; message: string }) {
  // El descarte vive en sessionStorage — un store del navegador, no estado de React.
  // Leído con `useSyncExternalStore` llega en el primer render del cliente; antes se
  // leía en un efecto que llamaba `setState` en el acto (render extra en cada carga
  // del sitio). En el server no hay storage: se asume DESCARTADA para que el HTML no
  // muestre una franja que el cliente va a esconder un instante después.
  const descartadaId = useSyncExternalStore(subscribeDescarte, leerDescartada, () => id);
  const dismissed = descartadaId === id;

  if (dismissed) return null;

  return (
    <div style={{ background: "var(--surface-inverted)", color: "var(--text-on-accent)" }}>
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
            color: "var(--text-on-accent)",
            textDecoration: "none",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: 9999,
              background: "var(--accent)",
              flexShrink: 0,
              animation: "ch-pulse 2s ease-in-out infinite",
            }}
          />
          <span style={{ textTransform: "uppercase", letterSpacing: ".14em", fontWeight: 600, color: "color-mix(in srgb, var(--text-on-accent) 70%, transparent)", flexShrink: 0 }}>
            Novedad
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{message}</span>
        </a>
        <button
          type="button"
          aria-label="Cerrar aviso"
          onClick={() => {
            try {
              sessionStorage.setItem(STORAGE_KEY, id);
            } catch {
              /* storage bloqueado: igual se esconde en esta vista */
            }
            window.dispatchEvent(new Event(EVENTO_DESCARTE));
          }}
          style={{
            flexShrink: 0,
            background: "transparent",
            border: 0,
            color: "color-mix(in srgb, var(--text-on-accent) 60%, transparent)",
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
