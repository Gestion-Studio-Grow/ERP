"use client";

import { useRef, useState, useTransition } from "react";
import { inscribirEnCampania } from "@/lib/campania-actions";

/**
 * Formulario del obsequio de apertura. Se llega por QR, desde el celular,
 * parada en la puerta del local.
 *
 * Dos decisiones de diseño que vienen de ese escenario:
 *  - La confirmación NO depende de que el servidor conteste bien. Si falla,
 *    la persona igual ve "Listo": lo que se pierde es un contacto, no la
 *    experiencia de alguien con gente esperando atrás.
 *  - Al confirmar se retira todo lo demás de la pantalla. El pedido fue
 *    "listo y nada más".
 */
export default function FormularioObsequio() {
  const [listo, setListo] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const confirmacion = useRef<HTMLDivElement>(null);

  function alEnviar(formData: FormData) {
    iniciar(async () => {
      await inscribirEnCampania(formData);
      setListo(true);
      // Que un lector de pantalla se entere de que el trámite terminó.
      requestAnimationFrame(() => confirmacion.current?.focus());
    });
  }

  return (
    <div className="mx-auto w-full max-w-[440px] px-5 pb-16 pt-7 flex flex-col gap-6">
      <header className="text-center">
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.3em]"
          style={{ color: "var(--accent)" }}
        >
          Barrio La Alameda · Canning
        </p>
        <h1
          className="mt-2 font-serif italic leading-[0.96] tracking-tight"
          style={{ fontSize: "clamp(40px,12.5vw,54px)", color: "var(--text-strong)" }}
        >
          Grand <span className="block ml-[0.55em]">Opening</span>
        </h1>
        <p
          className="mt-4 text-[11px] leading-[2.1] tracking-[0.24em]"
          style={{ color: "var(--text-muted)" }}
        >
          TE ESPERAMOS PARA CELEBRAR
          <br />
          ESTE NUEVO COMIENZO
        </p>
      </header>

      <div
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3.5 text-center"
        style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}
      >
        <span className="text-[11px] tracking-[0.19em]" style={{ color: "var(--text-muted)" }}>
          SÁBADO
        </span>
        <span
          className="whitespace-nowrap font-serif text-[22px] tracking-[0.02em]"
          style={{ color: "var(--text-strong)" }}
        >
          15 AGOSTO
        </span>
        <span className="text-[11px] leading-[1.75] tracking-[0.19em]" style={{ color: "var(--text-muted)" }}>
          DESDE
          <br />
          17 HS
        </span>
      </div>

      {!listo ? (
        <form
          action={alEnviar}
          className="flex flex-col gap-[18px] rounded-[7px] p-6"
          style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
        >
          <h2
            className="text-center font-serif text-[22px] font-normal"
            style={{ color: "var(--text-strong)" }}
          >
            Obsequio de apertura
          </h2>
          <p className="m-0 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Completá tus datos para participar.
          </p>

          <div className="flex flex-col gap-[13px]">
            <div className="grid grid-cols-2 gap-[11px]">
              <Campo etiqueta="Nombre *">
                <input name="nombre" required autoComplete="given-name" className={CLASE_INPUT} style={ESTILO_INPUT} />
              </Campo>
              <Campo etiqueta="Apellido *">
                <input name="apellido" required autoComplete="family-name" className={CLASE_INPUT} style={ESTILO_INPUT} />
              </Campo>
            </div>

            <Campo etiqueta="Teléfono *">
              <input
                name="tel"
                type="tel"
                required
                inputMode="tel"
                autoComplete="tel"
                pattern="[0-9+()\s-]{8,}"
                title="Ingresá tu teléfono con característica, por ejemplo 11 5555 5555"
                className={CLASE_INPUT}
                style={ESTILO_INPUT}
              />
            </Campo>

            <Campo etiqueta="Instagram" opcional>
              <span className="relative block">
                <span
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base"
                  style={{ color: "var(--text-muted)" }}
                  aria-hidden="true"
                >
                  @
                </span>
                <input
                  name="ig"
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  className={`${CLASE_INPUT} pl-7`}
                  style={ESTILO_INPUT}
                />
              </span>
            </Campo>

            <label
              className="flex items-start gap-[9px] text-[12.5px] leading-normal"
              style={{ color: "var(--text-muted)" }}
            >
              <input
                type="checkbox"
                name="ok"
                required
                className="mt-px h-[18px] w-[18px] shrink-0"
                style={{ accentColor: "var(--accent)" }}
              />
              <span>
                Acepto que CH Estética guarde mis datos y me contacte con novedades y
                promociones. Puedo pedir la baja cuando quiera.
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={pendiente}
            className="rounded-[5px] px-4 py-4 text-xs font-bold uppercase tracking-[0.19em] disabled:opacity-60"
            style={{ background: "var(--accent)", color: "var(--text-on-accent)" }}
          >
            {pendiente ? "Enviando…" : "Participar"}
          </button>
        </form>
      ) : (
        <div
          ref={confirmacion}
          role="status"
          tabIndex={-1}
          className="flex flex-col items-center gap-3.5 rounded-[7px] px-6 py-10 text-center"
          style={{ background: "var(--surface)", border: "1px solid var(--line)" }}
        >
          <span
            className="grid h-[58px] w-[58px] place-items-center rounded-full"
            style={{ background: "var(--accent)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-on-accent)" strokeWidth="2.6"
                 strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <h2 className="m-0 font-serif text-[27px] font-normal leading-tight"
              style={{ color: "var(--text-strong)" }}>
            Listo, ya podés participar!
          </h2>
        </div>
      )}

      {!listo && (
        <p className="text-center text-[11px] leading-[2] tracking-[0.19em]"
           style={{ color: "var(--text-muted)" }}>
          BARRIO LA ALAMEDA · CANNING
          <br />
          SÁBADO 15 DE AGOSTO · DESDE LAS 17 HS
        </p>
      )}
    </div>
  );
}

// 16px de fuente a propósito: por debajo de eso iOS hace zoom al enfocar el campo.
const CLASE_INPUT = "w-full rounded-[5px] px-3 py-3 text-base";
const ESTILO_INPUT: React.CSSProperties = {
  background: "var(--color-surface-sunken)",
  border: "1px solid var(--color-line)",
  color: "var(--text-strong)",
};

function Campo({
  etiqueta,
  opcional,
  children,
}: {
  etiqueta: string;
  opcional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.13em]"
           style={{ color: "var(--text-muted)" }}>
      <span>
        {etiqueta}
        {opcional && (
          <span className="font-normal normal-case tracking-normal opacity-70"> (opcional)</span>
        )}
      </span>
      {children}
    </label>
  );
}
