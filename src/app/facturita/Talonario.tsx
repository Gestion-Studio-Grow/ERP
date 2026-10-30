"use client";

// FACTURITA · El momento protagonista de la vidriera (DISENO.md §1 y §5.1): un teléfono dibujado
// en HTML con los tres toques de la app —qué vendiste · a quién · emitir— y la hoja de la factura
// que se desprende al emitir.
//
// SIMULADOR PURO DE NAVEGADOR: no llama al servidor, ni a ARCA, ni guarda nada. Lo que se tipea
// queda en el estado de este componente. Rótulo fijo «Ejemplo · sin validez fiscal» en el
// teléfono y en la hoja; sin CAE con formato válido, sin CUIT, sin emisor.
//
// Estados de la hoja (data-estado, ver piel.ts):
//   inicial  → la del servidor: suelta, «Autorizada». Con JS y sin reduced-motion, el CSS la hace
//              desprenderse una vez a los 1,8 s de estar visible. Sin JS queda suelta (estado final).
//   borrador → el visitante está editando: la hoja cambia en vivo, «Sin emitir».
//   pegada   → un cuadro: la hoja vuelve al teléfono (recortada), sin transición.
//   suelta   → se desprende (clip-path + transform, 520 ms) con «Autorizada · CAE».

import { useEffect, useRef, useState, type FormEvent } from "react";
import Hoja, { DESTINATARIOS, EJEMPLO, plata, type Destinatario } from "./Hoja";

type Estado = "inicial" | "borrador" | "pegada" | "suelta";

const PASOS = ["¿Qué vendiste?", "¿A quién?", "Emitir"] as const;

/** Sólo dígitos y una coma decimal; hasta 9 dígitos enteros y 2 decimales. */
export function limpiarTotal(v: string): string {
  const s = v.replace(/[^\d,]/g, "");
  const i = s.indexOf(",");
  const ent = (i < 0 ? s : s.slice(0, i)).replace(/^0+(?=\d)/, "").slice(0, 9);
  if (i < 0) return ent;
  return `${ent},${s.slice(i + 1).replace(/,/g, "").slice(0, 2)}`;
}

function Icono() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="#9a6a1f" />
      <path d="M11 9h11v3h-7.5v3.5H21v3h-6.5V23H11z" fill="#fff" />
    </svg>
  );
}

export default function Talonario() {
  // paso 0..2 = los tres toques; 3 = «lista» (pantalla final, la del servidor).
  const [paso, setPaso] = useState(3);
  const [estado, setEstado] = useState<Estado>("inicial");
  const [detalle, setDetalle] = useState(EJEMPLO.detalle);
  const [total, setTotal] = useState(EJEMPLO.total);
  const [destinatario, setDestinatario] = useState<Destinatario>(EJEMPLO.destinatario);
  const [aviso, setAviso] = useState("");
  const escena = useRef<HTMLDivElement>(null);
  const foco = useRef<HTMLElement | null>(null);

  // La hoja se desprende sola (CSS) a los 1,8 s de estar VISIBLE: si al hidratar la escena está
  // fuera de pantalla (celular), se pausa la animación hasta que entre.
  useEffect(() => {
    const el = escena.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        el.removeAttribute("data-espera");
        io.disconnect();
      } else if (performance.now() < 1500) {
        el.setAttribute("data-espera", "");
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Después de cambiar de pantalla, el foco va al título del panel nuevo (teclado y lector).
  useEffect(() => {
    foco.current?.focus({ preventScroll: true });
    foco.current = null;
  }, [paso]);

  const ir = (p: number) => {
    if (estado !== "borrador") setEstado("borrador");
    setAviso("");
    foco.current = document.getElementById(`fx-panel-${p}`);
    setPaso(p);
  };

  const emitir = () => {
    // Un cuadro pegada (recortada, sin transición) y al siguiente, suelta: la hoja se arranca.
    setEstado("pegada");
    requestAnimationFrame(() => requestAnimationFrame(() => setEstado("suelta")));
    setAviso(`Simulación: factura de ejemplo por ${plata(total)} lista. Sin validez fiscal.`);
    foco.current = document.getElementById("fx-panel-3");
    setPaso(3);
    // Que la hoja entera (con «Sin validez fiscal») quede a la vista, también sobre la barra fija del celu.
    const lugar = escena.current?.querySelector(".fx-hoja-lugar");
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => lugar?.scrollIntoView({ block: "nearest", behavior: quieto ? "auto" : "smooth" }));
  };

  const seguir = (e: FormEvent) => {
    e.preventDefault();
    ir(paso + 1);
  };

  const emitida = estado !== "borrador";

  return (
    <div ref={escena} className="fx-escena">
      <section className="fx-telefono" aria-label="Probala sin cuenta: simulador de ejemplo, sin validez fiscal">
        <div className="fx-pantalla">
          <span className="fx-isla" aria-hidden="true" />
          <div className="fx-app-cabecera">
            <span className="fx-app-nombre">
              <Icono />
              Facturita
            </span>
            <span className="fx-rotulo">Ejemplo · sin validez fiscal</span>
          </div>
          <ol className="fx-tabs" aria-label="Los tres toques">
            {PASOS.map((t, i) => (
              <li key={t}>
                <button
                  type="button"
                  className="fx-tab"
                  aria-current={paso === i ? "step" : undefined}
                  data-hecho={paso > i ? "" : undefined}
                  onClick={() => ir(i)}
                >
                  {t}
                </button>
              </li>
            ))}
          </ol>
          <div className="fx-pista" style={{ transform: `translateX(${-paso * 100}%)` }}>
            {/* 1 · ¿Qué vendiste? */}
            <form className="fx-panel" inert={paso !== 0} onSubmit={seguir} aria-labelledby="fx-panel-0">
              <h2 id="fx-panel-0" tabIndex={-1} className="fx-panel-titulo">
                ¿Qué vendiste?
              </h2>
              <label className="fx-etiqueta">
                Detalle
                <input
                  className="fx-campo"
                  value={detalle}
                  maxLength={40}
                  onChange={(e) => setDetalle(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="fx-etiqueta">
                Total en pesos
                <input
                  className="fx-campo fx-cifras"
                  value={total}
                  inputMode="decimal"
                  onChange={(e) => setTotal(limpiarTotal(e.target.value))}
                  autoComplete="off"
                />
              </label>
              <button type="submit" className="fx-btn">
                Seguir
              </button>
            </form>

            {/* 2 · ¿A quién? */}
            <form className="fx-panel" inert={paso !== 1} onSubmit={seguir} aria-labelledby="fx-panel-1">
              <h2 id="fx-panel-1" tabIndex={-1} className="fx-panel-titulo">
                ¿A quién?
              </h2>
              {(Object.keys(DESTINATARIOS) as Destinatario[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  className="fx-opcion"
                  aria-pressed={destinatario === d}
                  onClick={() => setDestinatario(d)}
                >
                  {d === "cf" ? "Consumidor final" : "Con CUIT"}
                </button>
              ))}
              <p className="fx-chico" style={{ margin: 0, fontSize: ".8125rem" }}>
                Si sos monotributista, la letra sale sola: C.
              </p>
              <button type="submit" className="fx-btn">
                Seguir
              </button>
            </form>

            {/* 3 · Emitir */}
            <div className="fx-panel" inert={paso !== 2}>
              <h2 id="fx-panel-2" tabIndex={-1} className="fx-panel-titulo">
                Emitir
              </h2>
              <dl className="fx-resumen">
                <div>
                  <dt>Detalle</dt>
                  <dd>{detalle.trim() || "—"}</dd>
                </div>
                <div>
                  <dt>A</dt>
                  <dd>{DESTINATARIOS[destinatario]}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd className="fx-cifras">{plata(total)}</dd>
                </div>
              </dl>
              <p className="fx-chico" style={{ margin: 0, fontSize: ".8125rem" }}>
                En la app de verdad, esto va a ARCA. Acá no sale de tu pantalla.
              </p>
              <button type="button" className="fx-btn" onClick={emitir}>
                Emitir (de prueba)
              </button>
            </div>

            {/* Lista */}
            <div className="fx-panel" inert={paso !== 3} style={{ alignItems: "flex-start" }}>
              <span className="fx-lista-ok" aria-hidden="true">
                <svg width="28" height="28" viewBox="0 0 16 16">
                  <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h2 id="fx-panel-3" tabIndex={-1} className="fx-panel-titulo">
                Así queda tu factura
              </h2>
              <p className="fx-chico" style={{ margin: 0, fontSize: ".875rem" }}>
                En la app, si ARCA responde, en el momento ves el número y el CAE. Esto es un ejemplo: no se mandó nada.
              </p>
              <button type="button" className="fx-btn fx-solo-js" onClick={() => ir(0)}>
                Probala vos
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="fx-hoja-lugar">
        <figure className="fx-hoja" data-estado={estado} aria-label="Factura de ejemplo, sin validez fiscal">
          <Hoja detalle={detalle} total={total} destinatario={destinatario} emitida={emitida} key={emitida ? "e" : "b"} />
        </figure>
      </div>
      <p className="sr-only" aria-live="polite">
        {aviso}
      </p>
    </div>
  );
}
