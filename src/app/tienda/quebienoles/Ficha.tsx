"use client";

// LA FICHA DE UN PERFUME — `<dialog>` nativo: foco atrapado, Escape y fondo inerte los pone el
// navegador (nada de trampas de foco a mano). Se abre en `useLayoutEffect` para que la transición de
// vista (el frasco que vuela desde la tarjeta) la tome en el mismo cuadro.
//
// La pirámide (salida, corazón, fondo) es la de la ficha pública del perfume y lleva su fuente. Sin
// ficha no se inventa: se ofrece preguntar por Instagram.

import Image from "next/image";
import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { parecidosPorPrecio, plata } from "../vidriera/catalogo-core";
import { etiquetaDeDisponibilidad } from "../reglas-tienda";
import { FAMILIA_POR_ID } from "./perfumes";
import { mensajeDirecto, seccionPorId, type Pieza } from "./vitrina";
import { IconoCerrar, IconoFamilia, IconoInstagram } from "./Iconos";
import { ORO } from "./tokens";

const CAPAS = [
  { id: "salida", nombre: "Salida", cuando: "Lo primero que sentís" },
  { id: "corazon", nombre: "Corazón", cuando: "Cuando se asienta en la piel" },
  { id: "fondo", nombre: "Fondo", cuando: "Lo que queda horas después" },
] as const;

export default function Ficha({
  p,
  piezas,
  cantidad,
  instagram,
  alCerrar,
  alSumar,
  alSacar,
  alVer,
}: {
  p: Pieza;
  piezas: readonly Pieza[];
  cantidad: number;
  instagram: string;
  alCerrar: () => void;
  alSumar: (el: HTMLElement | null) => void;
  alSacar: () => void;
  alVer: (id: string) => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const foto = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const d = dialogo.current;
    if (d && !d.open) d.showModal();
  }, []);

  const familia = p.familia ? FAMILIA_POR_ID[p.familia] : null;
  const perfume = p.perfume;
  const parecidos = useMemo(() => parecidosPorPrecio(p, piezas, seccionPorId(piezas), 3), [p, piezas]);
  const sinStock = p.disponibilidad === "sin-stock";
  const etiqueta = etiquetaDeDisponibilidad(p.disponibilidad ?? null);

  return (
    <dialog
      ref={dialogo}
      className="qb-ficha"
      aria-labelledby="qb-ficha-nombre"
      style={{ "--color-puerta": familia?.color ?? ORO } as CSSProperties}
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      onClick={(e) => {
        // Tocar el fondo (fuera de la caja) cierra, como en cualquier hoja modal.
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <div className="qb-ficha-caja">
        <button type="button" className="qb-cerrar" onClick={alCerrar} aria-label="Cerrar la ficha">
          <IconoCerrar />
        </button>

        <div ref={foto} className="qb-ficha-foto">
          {p.foto ? (
            <Image
              src={p.foto}
              alt={`Frasco de ${p.nombre}${p.casa ? ` de ${p.casa}` : ""}`}
              width={720}
              height={900}
              sizes="(max-width: 820px) 80vw, 420px"
              priority
              style={{ viewTransitionName: "qb-frasco-activo" } as CSSProperties}
            />
          ) : (
            <span className="qb-pieza-sinfoto qb-ficha-sinfoto" aria-hidden="true">
              {p.nombre.charAt(0)}
            </span>
          )}
        </div>

        <div className="qb-ficha-texto">
          <p className="qb-ficha-casa">
            {[p.casa, perfume?.concentracion].filter(Boolean).join(" · ") || "Qué Bien Olés"}
          </p>
          <h2 id="qb-ficha-nombre" className="qb-ficha-nombre">
            {p.nombre}
          </h2>
          {familia && (
            <p className="qb-ficha-familia">
              <IconoFamilia icono={familia.icono} className="qb-icono qb-icono-mini" />
              <span>
                {familia.nombre} <em>· {familia.cuando}</em>
              </span>
            </p>
          )}
          <p className="qb-ficha-precio">{p.price ? plata(p.price) : "Consultanos el precio"}</p>
          {etiqueta && <p className="qb-pieza-dispo">{etiqueta}</p>}
          {perfume?.aviso && (
            <p className="qb-aviso" role="note">
              {perfume.aviso}
            </p>
          )}

          <div className="qb-ficha-acciones">
            {cantidad > 0 ? (
              <div className="qb-cantidad qb-cantidad-grande" role="group" aria-label={`${p.nombre} en tu bolsa`}>
                <button type="button" onClick={alSacar} aria-label={`Sacar uno de ${p.nombre}`}>
                  −
                </button>
                <span>{cantidad} en la bolsa</span>
                <button type="button" onClick={() => alSumar(foto.current)} disabled={sinStock} aria-label={`Sumar otro ${p.nombre}`}>
                  +
                </button>
              </div>
            ) : (
              <button type="button" className="qb-boton qb-boton-oro" onClick={() => alSumar(foto.current)} disabled={sinStock || !p.price}>
                {sinStock ? "Sin stock por ahora" : "Sumar a la bolsa"}
              </button>
            )}
            <a className="qb-boton qb-boton-linea" href={mensajeDirecto(instagram)} target="_blank" rel="noopener noreferrer">
              <IconoInstagram className="qb-icono-ig" /> Consultar
            </a>
          </div>

          {perfume?.notas ? (
            <section className="qb-piramide" aria-labelledby="qb-piramide-titulo">
              <h3 id="qb-piramide-titulo" className="qb-ficha-sub">
                A qué huele
              </h3>
              <ol>
                {CAPAS.map((c, i) => (
                  <li key={c.id} className="qb-capa" data-capa={c.id} style={{ "--i": i } as CSSProperties}>
                    <span className="qb-capa-nodo" aria-hidden="true" />
                    <p className="qb-capa-nombre">
                      {c.nombre} <span>{c.cuando}</span>
                    </p>
                    <ul className="qb-notas">
                      {perfume.notas![c.id].map((n, k) => (
                        <li key={n} style={{ "--k": k } as CSSProperties}>
                          {n}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
              {perfume.acordes.length > 0 && (
                <p className="qb-acordes">
                  <span>Acordes:</span> {perfume.acordes.join(" · ")}
                </p>
              )}
              {perfume.fuente && (
                <p className="qb-fuente">
                  Pirámide de la casa, según{" "}
                  <a href={perfume.fuente} target="_blank" rel="noopener noreferrer">
                    su ficha en Fragrantica
                  </a>
                  .
                </p>
              )}
            </section>
          ) : (
            <p className="qb-ficha-sinnotas">
              Todavía no cargamos su pirámide.{" "}
              <a href={mensajeDirecto(instagram)} target="_blank" rel="noopener noreferrer">
                Preguntanos por Instagram
              </a>{" "}
              y te contamos a qué huele.
            </p>
          )}

          {parecidos.length > 0 && (
            <section className="qb-parecidos" aria-labelledby="qb-parecidos-titulo">
              <h3 id="qb-parecidos-titulo" className="qb-ficha-sub">
                Si te gusta, mirá también
              </h3>
              <ul>
                {parecidos.map((x) => (
                  <li key={x.id}>
                    <button type="button" onClick={() => alVer(x.id)}>
                      {x.foto && <Image src={x.foto} alt="" width={160} height={200} sizes="80px" />}
                      <span className="qb-parecido-nombre">{x.nombre}</span>
                      <span className="qb-parecido-precio">{x.price ? plata(x.price) : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </dialog>
  );
}
