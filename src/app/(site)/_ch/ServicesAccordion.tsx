"use client";

import { useEffect, useState } from "react";

// Menú de servicios de la landing.
//
// POR QUÉ ES UN COMPONENTE CLIENT Y NO `<details>` NATIVO:
// La versión anterior usaba <details>/<summary> con `display:flex` en el
// summary. Eso dispara un bug conocido de WebKit (Safari / iOS Safari): al
// poner display flex/grid en un <summary> deja de reconocerse como disparador
// y el desplegable NO abre. En iPhone los clientes veían las categorías sin
// poder expandirlas. Con estado de React el toggle funciona igual en todos
// los navegadores.
//
// COMPORTAMIENTO RESPONSIVO:
// - Mobile (<640px): cada categoría arranca colapsada; se toca para expandir,
//   con animación suave (grid-template-rows 0fr→1fr) y chevron que rota.
// - Tablet/desktop (≥640px): todo expandido y sin interacción — la lista
//   editorial de siempre.

type Service = { id: string; name: string; durationMin: number; price: number; residentPrice: number | null };
type Group = { id: string; name: string; services: Service[] };

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

function ServiceList({ services }: { services: Service[] }) {
  return (
    <div>
      {services.map((it) => (
        <div
          key={it.id}
          style={{
            borderBottom: "1px solid rgba(199,180,156,.6)",
            padding: "12px 8px",
            margin: "0 -8px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <span>{it.name}</span>
          <span style={{ fontSize: ".875rem", color: "var(--ch-mocha)", whiteSpace: "nowrap", textAlign: "right" }}>
            {it.durationMin} min · ${it.price.toLocaleString("es-AR")}
            {/* Beneficio vecino (ADR-013): visible siempre en la lista de precios,
                no escondido detrás del paso de reserva — es parte de lo que
                convence de reservar. */}
            {it.residentPrice != null && (
              <>
                {" · "}
                <span style={{ color: "var(--ch-petrol)", fontWeight: 600 }}>
                  Vecino/a ${it.residentPrice.toLocaleString("es-AR")}
                </span>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

const headingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display), Georgia, serif",
  fontSize: "1.5rem",
  fontWeight: 560,
};

export default function ServicesAccordion({ groups }: { groups: Group[] }) {
  const isMobile = useIsMobile();
  // Primera categoría abierta por defecto en mobile, para que se vea de una
  // que las categorías se despliegan (affordance) sin quedar todo abierto.
  const [openId, setOpenId] = useState<string | null>(null);

  // Vista desktop/tablet: todo expandido, sin interacción.
  if (!isMobile) {
    return (
      <div style={{ maxWidth: 768 }}>
        {groups.map((g) => (
          <div key={g.id} style={{ marginBottom: 32 }}>
            <h3 style={{ ...headingStyle, margin: "0 0 8px" }}>{g.name}</h3>
            <ServiceList services={g.services} />
          </div>
        ))}
      </div>
    );
  }

  // Vista mobile: acordeón.
  return (
    <div style={{ maxWidth: 768 }}>
      {groups.map((g, i) => {
        const open = openId === g.id || (openId === null && i === 0);
        return (
          <div
            key={g.id}
            style={{ borderBottom: "1px solid rgba(199,180,156,.4)" }}
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? "__none__" : g.id)}
              aria-expanded={open}
              className="ch-acc-trigger"
              style={{
                ...headingStyle,
                width: "100%",
                background: "transparent",
                border: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "16px 0",
                textAlign: "left",
                color: "var(--ch-ink)",
              }}
            >
              <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                {g.name}
                <span style={{ fontSize: ".8rem", fontFamily: "var(--font-body)", fontWeight: 400, color: "var(--ch-mocha)" }}>
                  {g.services.length}
                </span>
              </span>
              <span
                aria-hidden
                style={{
                  color: "var(--ch-mocha)",
                  fontSize: "1.4rem",
                  lineHeight: 1,
                  transition: "transform .25s ease",
                  transform: open ? "rotate(90deg)" : "none",
                }}
              >
                ›
              </span>
            </button>
            {/* Animación por max-height (cap generoso). Más robusta que el
                truco de grid-template-rows 0fr→1fr, que en WebKit/Chromium
                se traba a mitad de toggle. `visibility`/`hidden` saca del
                foco de teclado lo colapsado. */}
            <div
              aria-hidden={!open}
              style={{
                overflow: "hidden",
                maxHeight: open ? 2000 : 0,
                opacity: open ? 1 : 0,
                transition: "max-height .35s ease, opacity .25s ease",
              }}
            >
              <div style={{ paddingBottom: 12 }}>
                <ServiceList services={g.services} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
