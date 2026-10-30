"use client";

// ============================================================================
// ¿CUÁL TE CONVIENE? — tres preguntas en chips y la PAREJA: una pala y una zapatilla, con su porqué.
// ============================================================================
//
// El puntaje es por reglas (recomendador.ts), no «IA». Debajo, si el negocio publicó su WhatsApp,
// «¿Preferís que te asesoremos?» abre el chat con las respuestas ya escritas; sin número, no se dibuja.

import { useMemo, useState } from "react";
import { plata } from "../vidriera/catalogo-core";
import type { Item } from "./catalogo";
import { PREGUNTAS, recomendar, topeDePalas, type NivelDeJuego, type Respuestas, type Tope } from "./recomendador";
import type { Juego } from "./palas";
import { Silueta } from "./Siluetas";

export default function Consejo({
  items,
  hidratado,
  hayWhatsApp,
  alSumar,
  alAbrir,
  alConsultar,
}: {
  items: readonly Item[];
  hidratado: boolean;
  hayWhatsApp: boolean;
  alSumar: (p: Item) => void;
  alAbrir: (id: string, talles?: boolean) => void;
  alConsultar: (mensaje: string) => void;
}) {
  const [nivel, setNivel] = useState<NivelDeJuego | null>(null);
  const [juego, setJuego] = useState<Juego | null>(null);
  const [tope, setTope] = useState<Tope | null>(null);
  const palas = useMemo(() => items.filter((x) => x.vista.seccion === "palas"), [items]);
  const mediana = topeDePalas(palas);
  const r: Respuestas | null = nivel && juego && tope ? { nivel, juego, tope } : null;
  const pareja = useMemo(() => (r ? recomendar(items, r) : null), [items, r?.nivel, r?.juego, r?.tope]); // eslint-disable-line react-hooks/exhaustive-deps
  if (palas.length === 0) return null;

  const textoNivel = PREGUNTAS.nivel.find((x) => x.id === nivel)?.texto.toLowerCase();
  const textoJuego = PREGUNTAS.juego.find((x) => x.id === juego)?.texto.toLowerCase();
  const mensaje = `¡Hola A Dos Manos! Quiero que me asesoren con una pala. Nivel: ${textoNivel ?? "—"}. Juego: ${textoJuego ?? "—"}. Presupuesto: ${
    tope === "hasta" ? `hasta ${plata(mediana)}` : tope === "sin-tope" ? "sin tope" : "—"
  }.`;

  return (
    <section className="am-sec am-consejo" id="consejo" aria-labelledby="am-t-consejo">
      <div className="am-sec-cab">
        <p className="am-kicker">Te armamos la pareja</p>
        <h2 className="am-h2" id="am-t-consejo">
          ¿Cuál te conviene?
        </h2>
        <p className="am-cuerpo">Tres preguntas y te decimos qué pala y qué zapatilla llevarías. Sin vueltas.</p>
      </div>

      <div className="am-consejo-grilla">
        <div className="am-preguntas">
          <fieldset className="am-pregunta">
            <legend>1 · ¿Cuánto jugás?</legend>
            <div className="am-chips am-chips-wrap">
              {PREGUNTAS.nivel.map((o) => (
                <button key={o.id} type="button" className="am-chip" aria-pressed={nivel === o.id} onClick={() => setNivel(o.id)}>
                  {o.texto}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="am-pregunta">
            <legend>2 · ¿Qué buscás en tu juego?</legend>
            <div className="am-chips am-chips-wrap">
              {PREGUNTAS.juego.map((o) => (
                <button key={o.id} type="button" className="am-chip" aria-pressed={juego === o.id} onClick={() => setJuego(o.id)}>
                  {o.texto}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="am-pregunta">
            <legend>3 · ¿Cuánto querés gastar en la pala?</legend>
            <div className="am-chips am-chips-wrap">
              {mediana > 0 && (
                <button type="button" className="am-chip" aria-pressed={tope === "hasta"} onClick={() => setTope("hasta")}>
                  Hasta <span className="am-num">{plata(mediana)}</span>
                </button>
              )}
              <button type="button" className="am-chip" aria-pressed={tope === "sin-tope"} onClick={() => setTope("sin-tope")}>
                Sin tope
              </button>
            </div>
          </fieldset>
        </div>

        <div className="am-pareja" aria-live="polite">
          {!pareja ? (
            <p className="am-pareja-espera">Respondé las tres y te armamos la pareja: una pala y una zapatilla.</p>
          ) : (
            <>
              <p className="am-kicker">Tu pareja</p>
              <ul className="am-pareja-lista">
                {pareja.pala && (
                  <li>
                    <button type="button" className="am-pareja-sil" onClick={() => alAbrir(pareja.pala!.id)} aria-label={`Ver ${pareja.pala.name}`}>
                      <Silueta tipo={pareja.pala.vista.silueta} marca={pareja.pala.vista.marca} />
                    </button>
                    <div>
                      <p className="am-pareja-nombre">{pareja.pala.name}</p>
                      <p className="am-pareja-porque">{pareja.porquePala}</p>
                      <p className="am-precio am-num">{plata(pareja.pala.precio)}</p>
                      {pareja.pala.disponibilidad !== "sin-stock" && (
                        <button type="button" className="am-btn am-btn-p" onClick={() => alSumar(pareja.pala!)} disabled={!hidratado}>
                          Sumar a la bolsa
                        </button>
                      )}
                    </div>
                  </li>
                )}
                {pareja.zapatilla && (
                  <li>
                    <button type="button" className="am-pareja-sil" onClick={() => alAbrir(pareja.zapatilla!.id, true)} aria-label={`Ver ${pareja.zapatilla.name}`}>
                      <Silueta tipo="zapatilla" />
                    </button>
                    <div>
                      <p className="am-pareja-nombre">{pareja.zapatilla.name}</p>
                      <p className="am-pareja-porque">{pareja.porqueZapatilla}</p>
                      <p className="am-precio am-num">{plata(pareja.zapatilla.precio)}</p>
                      <button type="button" className="am-btn am-btn-b" onClick={() => alAbrir(pareja.zapatilla!.id, true)} disabled={!hidratado}>
                        Elegir talle
                      </button>
                    </div>
                  </li>
                )}
              </ul>
            </>
          )}
          {hayWhatsApp && (
            <div className="am-asesor">
              <p>¿Preferís que te asesoremos?</p>
              <button type="button" className="am-btn am-btn-b" onClick={() => alConsultar(mensaje)}>
                Escribinos por WhatsApp
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
