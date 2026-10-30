"use client";

// ============================================================================
// LA FICHA — `<dialog>` nativo (foco atrapado, Escape y fondo inerte los pone el navegador).
// ============================================================================
//
// Dos columnas en la compu (la silueta a la izquierda, los datos a la derecha), pantalla completa en el
// celular con la barra de acción pegada abajo. Pala: la ficha técnica de palas.ts con su fuente y lo que
// no cierra; sin ficha, «Ficha técnica a confirmar». Zapatilla: los talles en chips; el elegido viaja en
// la nota del pedido (el motor no tiene variantes). Al cerrar, el foco vuelve a quien la abrió.

import { useHoja } from "@/components/vidriera/useHoja";
import { useLayoutEffect, useRef, useState } from "react";
import { plata } from "../vidriera/catalogo-core";
import type { Item } from "./catalogo";
import { NOMBRE_FORMA, NOMBRE_JUEGO, NOMBRE_NIVEL } from "./palas";
import { TALLES } from "./tokens";
import { Silueta } from "./Siluetas";
import { BloqueDePrecio } from "./Precio";

export default function Ficha({
  p,
  enBolsa,
  focoEnTalles,
  parecidas,
  hayWhatsApp,
  puedeEnfrentar,
  alCerrar,
  alAgregar,
  alEnfrentar,
  alAbrir,
  alConsultar,
}: {
  p: Item;
  enBolsa: number;
  focoEnTalles: boolean;
  parecidas: readonly Item[];
  hayWhatsApp: boolean;
  puedeEnfrentar: boolean;
  alCerrar: () => void;
  alAgregar: (talle: string | null, cantidad: number) => void;
  alEnfrentar: () => void;
  alAbrir: (id: string) => void;
  alConsultar: (mensaje: string) => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const talles = useRef<HTMLDivElement>(null);
  const origen = useRef<Element | null>(null);
  const v = p.vista;
  const f = v.ficha;
  const esZapa = v.seccion === "calzado";
  const [talle, setTalle] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const sinStock = p.disponibilidad === "sin-stock";
  const faltaTalle = esZapa && !talle;

  useLayoutEffect(() => {
    const d = dialogo.current;
    if (!origen.current) origen.current = document.activeElement;
    void d; // abrir y «atrás»: la hoja compartida (abajo, después de anotar el origen del foco)
    const volver = origen.current;
    return () => {
      // Devolver el foco a la tarjeta (o lo que la abrió) cuando la ficha se desmonta. En el cuadro siguiente:
      // si se hace mientras el <dialog> modal sigue en el DOM, el navegador lo vuelve a mandar al <body>.
      window.setTimeout(() => {
        if (volver instanceof HTMLElement && volver.isConnected) volver.focus({ preventScroll: true });
      }, 0);
    };
  }, [focoEnTalles]);
  // La hoja compartida (ronda 2): abre al montar y «atrás» del celular la cierra.
  useHoja(dialogo, true, alCerrar);
  // Con la hoja ya abierta (el foco no entra en un <dialog> cerrado): directo a los talles si se pidió.
  useLayoutEffect(() => {
    if (focoEnTalles) talles.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [focoEnTalles]);

  return (
    <dialog
      ref={dialogo}
      className="am-hoja am-ficha"
      aria-labelledby="am-ficha-nombre"
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <div className="am-ficha-caja">
        <button type="button" className="am-cerrar am-ficha-cerrar" onClick={alCerrar}>
          Cerrar
        </button>
        <div className="am-ficha-foto">
          <Silueta tipo={v.silueta} marca={v.marca} />
          <span className="am-ilus">Ilustración de la forma · no es foto del producto</span>
        </div>

        <div className="am-ficha-texto">
          {v.marca && <p className="am-kicker">{v.marca}</p>}
          <h2 id="am-ficha-nombre" className="am-ficha-nombre">
            {v.marca ? v.modelo : p.name}
          </h2>
          <BloqueDePrecio precio={p.precio} grande />
          {sinStock && <p className="am-dispo">Sin stock</p>}

          {v.seccion === "palas" &&
            (f ? (
              <>
                <dl className="am-spec">
                  <div>
                    <dt>Forma</dt>
                    <dd>{NOMBRE_FORMA[f.forma]}</dd>
                  </div>
                  <div>
                    <dt>Balance</dt>
                    <dd>{f.balance}</dd>
                  </div>
                  <div>
                    <dt>Peso</dt>
                    <dd className="am-num">{f.peso}</dd>
                  </div>
                  <div>
                    <dt>Núcleo</dt>
                    <dd>{f.nucleo}</dd>
                  </div>
                  <div>
                    <dt>Cara</dt>
                    <dd>{f.cara}</dd>
                  </div>
                  <div>
                    <dt>Nivel</dt>
                    <dd>{NOMBRE_NIVEL[f.nivel]}</dd>
                  </div>
                  <div>
                    <dt>Juego</dt>
                    <dd>{NOMBRE_JUEGO[f.juego]}</dd>
                  </div>
                </dl>
                <p className="am-fuente">
                  Ficha de referencia del modelo {f.modelo} (
                  <a href={f.fuente} target="_blank" rel="noopener noreferrer">
                    fuente
                  </a>
                  ). Confirmá la versión con nosotros antes de pedirla.
                  {f.nota ? ` ${f.nota.replace(/\s*\[CONTRADICTORIO\]/g, "").replace(/\s+/g, " ").trim()}` : ""}
                </p>
              </>
            ) : (
              <p className="am-aviso-ficha">Ficha técnica a confirmar: consultanos antes de pedirla.</p>
            ))}

          {esZapa && (
            <div className="am-talles" ref={talles}>
              <p className="am-sub" id="am-talle-t">
                Tu talle {talle ? <b>· {talle}</b> : <span>· elegí uno</span>}
              </p>
              <div className="am-chips am-chips-wrap" role="group" aria-labelledby="am-talle-t">
                {TALLES.map((t) => (
                  <button key={t} type="button" className="am-chip am-chip-talle am-num" aria-pressed={talle === t} onClick={() => setTalle(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <p className="am-nota">Te confirmamos el talle antes de cobrar.</p>
            </div>
          )}

          {enBolsa > 0 && <p className="am-nota">Ya tenés {enBolsa} en la bolsa.</p>}

          <div className="am-ficha-acciones">
            <div className="am-paso" role="group" aria-label="Cantidad">
              <button type="button" onClick={() => setCantidad((c) => Math.max(1, c - 1))} disabled={cantidad <= 1} aria-label="Uno menos">
                −
              </button>
              <span className="am-num" aria-live="polite">
                {cantidad}
              </span>
              <button type="button" onClick={() => setCantidad((c) => Math.min(10, c + 1))} aria-label="Uno más">
                +
              </button>
            </div>
            <button
              type="button"
              className="am-btn am-btn-p am-ficha-sumar"
              disabled={sinStock || faltaTalle}
              aria-describedby={faltaTalle ? "am-talle-t" : undefined}
              onClick={() => alAgregar(talle, cantidad)}
            >
              {sinStock ? "Sin stock por ahora" : faltaTalle ? "Elegí tu talle" : <>Sumar · <span className="am-num">{plata(p.precio * cantidad)}</span></>}
            </button>
          </div>
          <div className="am-ficha-links">
            {puedeEnfrentar && (
              <button type="button" className="am-link" onClick={alEnfrentar}>
                Enfrentar con otra pala
              </button>
            )}
            {hayWhatsApp && (
              <button type="button" className="am-link" onClick={() => alConsultar(`¡Hola A Dos Manos! Quería consultar por ${p.name}.`)}>
                {sinStock ? "Avisame cuando vuelva" : "Consultanos por WhatsApp"}
              </button>
            )}
          </div>

          {parecidas.length > 0 && (
            <div className="am-parecidas">
              <p className="am-sub">Parecidas por precio</p>
              <ul>
                {parecidas.map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => alAbrir(x.id)}>
                      <span className="am-parecida-sil">
                        <Silueta tipo={x.vista.silueta} />
                      </span>
                      <span className="am-parecida-nombre">{x.name}</span>
                      <span className="am-num am-parecida-precio">{plata(x.precio)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
