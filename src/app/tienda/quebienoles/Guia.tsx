"use client";

// «¿NO SABÉS CUÁL ELEGIR?» — la frase de la marca ("Escribinos y te ayudamos a encontrar el indicado")
// hecha tres preguntas. Las opciones son radios de verdad (teclado, lector de pantalla); la respuesta
// aparece recién con las tres contestadas y cambia en vivo si se cambia una. Siempre queda la salida
// humana: escribirles por Instagram.

import Image from "next/image";
import { useMemo, useState, type CSSProperties } from "react";
import { plata } from "../vidriera/catalogo-core";
import { FAMILIA_POR_ID } from "./perfumes";
import { PREGUNTAS, recomendar, type Respuestas } from "./recomendador";
import { mensajeDirecto, type Pieza } from "./vitrina";

type Parcial = Partial<Respuestas>;
const ORDEN = ["ocasion", "estilo", "para"] as const;

export default function Guia({
  piezas,
  instagram,
  alVer,
  alSumar,
  cantidadDe,
}: {
  piezas: readonly Pieza[];
  instagram: string;
  alVer: (id: string) => void;
  alSumar: (p: Pieza, el: HTMLElement | null) => void;
  cantidadDe: (id: string) => number;
}) {
  const [r, setR] = useState<Parcial>({});
  const completa = ORDEN.every((k) => r[k]);
  const porId = useMemo(() => new Map(piezas.map((p) => [p.id, p])), [piezas]);
  const recs = useMemo(() => {
    if (!completa) return [];
    const candidatos = piezas.map((p) => ({ id: p.id, name: p.name, price: p.price, disponibilidad: p.disponibilidad, perfume: p.perfume }));
    return recomendar(candidatos, r as Respuestas);
  }, [completa, piezas, r]);
  const clave = ORDEN.map((k) => r[k] ?? "").join("|");

  return (
    <section id="guia" className="qb-guia" aria-labelledby="qb-guia-titulo">
      <div className="qb-encabezado qb-revela">
        <p className="qb-antetitulo">Te ayudamos</p>
        <h2 id="qb-guia-titulo" className="qb-h2">
          ¿No sabés <em className="qb-oro">cuál elegir?</em>
        </h2>
        <p className="qb-lead">Tres preguntas y te decimos por dónde arrancar.</p>
      </div>

      <div className="qb-preguntas">
        {ORDEN.map((k, i) => {
          const pregunta = PREGUNTAS[k];
          return (
            <fieldset key={k} className="qb-pregunta" data-contestada={Boolean(r[k])}>
              <legend>
                <span className="qb-pregunta-num">{i + 1}</span> {pregunta.titulo}
              </legend>
              <div className="qb-opciones">
                {pregunta.opciones.map((o) => (
                  <label key={o.id} className="qb-opcion">
                    <input
                      type="radio"
                      name={`qb-${k}`}
                      value={o.id}
                      checked={r[k] === o.id}
                      onChange={() => setR((prev) => ({ ...prev, [k]: o.id }))}
                    />
                    <span>{o.texto}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="qb-respuesta" aria-live="polite">
        {completa && recs.length > 0 ? (
          <>
            <p className="qb-respuesta-titulo">Para vos, arrancaríamos por estos:</p>
            <ol key={clave} className="qb-recs">
              {recs.map((x, i) => {
                const p = porId.get(x.id);
                if (!p) return null;
                const familia = p.familia ? FAMILIA_POR_ID[p.familia] : null;
                return (
                  <li key={x.id} className="qb-rec" style={{ "--i": i, "--color-puerta": familia?.color } as CSSProperties}>
                    <button type="button" className="qb-rec-foto" onClick={() => alVer(p.id)} aria-label={`Ver la ficha de ${p.nombre}`}>
                      {p.foto && <Image src={p.foto} alt="" width={360} height={450} sizes="(max-width: 720px) 36vw, 180px" />}
                    </button>
                    <div className="qb-rec-texto">
                      <p className="qb-rec-orden">{["Primera opción", "Segunda opción", "Tercera opción"][i]}</p>
                      <h3 className="qb-rec-nombre">
                        {p.nombre} {p.casa && <span>{p.casa}</span>}
                      </h3>
                      <p className="qb-rec-porque">{x.porque}</p>
                      <p className="qb-rec-precio">{p.price ? plata(p.price) : ""}</p>
                      <div className="qb-rec-acciones">
                        <button
                          type="button"
                          className="qb-sumar"
                          onClick={(e) => alSumar(p, (e.currentTarget.closest(".qb-rec") as HTMLElement | null)?.querySelector(".qb-rec-foto") as HTMLElement | null)}
                        >
                          {cantidadDe(p.id) > 0 ? `En la bolsa (${cantidadDe(p.id)}) · sumar otro` : "Sumar a la bolsa"}
                        </button>
                        <button type="button" className="qb-enlace" onClick={() => alVer(p.id)}>
                          Ver a qué huele
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        ) : completa ? (
          <p className="qb-tenue">Con esas respuestas no tenemos uno en la vitrina hoy.</p>
        ) : (
          <p className="qb-tenue qb-respuesta-espera">Contestá las tres y te mostramos tres perfumes, con el porqué.</p>
        )}
        <p className="qb-guia-humana">
          ¿Seguís con dudas?{" "}
          <a href={mensajeDirecto(instagram)} target="_blank" rel="noopener noreferrer">
            Escribinos
          </a>{" "}
          y te ayudamos a encontrar el indicado.
        </p>
      </div>
    </section>
  );
}
