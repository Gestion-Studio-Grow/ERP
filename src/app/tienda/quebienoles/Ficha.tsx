"use client";

// LA FICHA DE UN PERFUME — `<dialog>` nativo: foco atrapado, Escape y fondo inerte los pone el
// navegador (nada de trampas de foco a mano). Se abre en `useLayoutEffect` para que la transición de
// vista (el frasco que vuela desde la tarjeta) la tome en el mismo cuadro.
//
// Rediseño 29/10 — la tirita de papel:
//   · «Olelo en el tiempo»: la pirámide (salida, corazón, fondo) contada como lo que te pasa con la
//     tirita en la mano —recién rociado, a los 20 minutos, horas después—, con un selector. No es un
//     cronómetro: son las tres capas de la ficha pública, con su fuente a la vista.
//   · «Ponelo al lado»: dos tiritas sobre el mostrador. Tocar un parecido NO navega: abre la comparación
//     capa por capa; desde ahí se pasa a esa ficha o se suman las dos.
// Sin pirámide no se inventa: se ofrece preguntar por Instagram (y no hay tiempo ni comparación).

import Image from "next/image";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { parecidosPorPrecio, plata } from "../vidriera/catalogo-core";
import { etiquetaDeDisponibilidad } from "../reglas-tienda";
import { FAMILIA_POR_ID } from "./perfumes";
import { mensajeDirecto, seccionPorId, type Pieza } from "./vitrina";
import { FotoDeFrasco, IconoCerrar, IconoFamilia, IconoInstagram, Tirita, altDeFrasco } from "./Iconos";
import { ORO } from "./tokens";

/** Las tres capas de la pirámide, dichas como momentos de la tirita (salida / corazón / fondo). */
const MOMENTOS = [
  { id: "salida", nombre: "Recién rociado", capa: "Salida" },
  { id: "corazon", nombre: "A los 20 minutos", capa: "Corazón" },
  { id: "fondo", nombre: "Horas después", capa: "Fondo" },
] as const;

/** El teléfono: la ficha es una hoja a pantalla completa y se cierra arrastrando la foto hacia abajo. */
const CELULAR = "(max-width: 819px)";

export default function Ficha({
  p,
  piezas,
  cantidad,
  instagram,
  alCerrar,
  alSumar,
  alSumarOtra,
  alSacar,
  alVer,
}: {
  p: Pieza;
  piezas: readonly Pieza[];
  cantidad: number;
  instagram: string;
  alCerrar: () => void;
  alSumar: (el: HTMLElement | null) => void;
  /** Sumar otro perfume (el de la comparación) sin abrir su ficha. */
  alSumarOtra: (otra: Pieza) => void;
  alSacar: () => void;
  alVer: (id: string) => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const foto = useRef<HTMLDivElement>(null);
  const pestanas = useRef<(HTMLButtonElement | null)[]>([]);
  const arrastre = useRef<{ y0: number; dy: number } | null>(null);

  const [momento, setMomento] = useState(0);
  const [comparando, setComparando] = useState<string | null>(null);
  const [sumadas, setSumadas] = useState(false);
  // Al pasar a otra ficha (desde «Ver esta ficha») se arranca de cero: primer momento, sin comparación.
  const [deId, setDeId] = useState(p.id);
  if (deId !== p.id) {
    setDeId(p.id);
    setMomento(0);
    setComparando(null);
    setSumadas(false);
  }

  useLayoutEffect(() => {
    const d = dialogo.current;
    if (d && !d.open) d.showModal();
  }, []);

  const familia = p.familia ? FAMILIA_POR_ID[p.familia] : null;
  const perfume = p.perfume;
  const parecidos = useMemo(() => parecidosPorPrecio(p, piezas, seccionPorId(piezas), 3), [p, piezas]);
  const sinStock = p.disponibilidad === "sin-stock";
  const etiqueta = etiquetaDeDisponibilidad(p.disponibilidad ?? null);
  const otra = comparando ? piezas.find((x) => x.id === comparando) ?? null : null;
  const sePuede = (x: Pieza) => x.disponibilidad !== "sin-stock" && Boolean(x.price);

  const irAMomento = (i: number) => {
    const n = (i + MOMENTOS.length) % MOMENTOS.length;
    setMomento(n);
    pestanas.current[n]?.focus();
  };
  const teclaPestana = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") irAMomento(momento + 1);
    else if (e.key === "ArrowLeft") irAMomento(momento - 1);
    else if (e.key === "Home") irAMomento(0);
    else if (e.key === "End") irAMomento(MOMENTOS.length - 1);
    else return;
    e.preventDefault();
  };

  // Arrastrar la foto hacia abajo cierra la hoja (sólo en el teléfono y con la hoja arriba de todo).
  // Mueve la caja con `transform`, nada más.
  const empezarArrastre = (e: PointerEvent) => {
    if (e.pointerType !== "touch" || !window.matchMedia(CELULAR).matches || (caja.current?.scrollTop ?? 0) > 0) return;
    arrastre.current = { y0: e.clientY, dy: 0 };
  };
  const moverArrastre = (e: PointerEvent) => {
    const a = arrastre.current;
    const c = caja.current;
    if (!a || !c) return;
    a.dy = Math.max(0, e.clientY - a.y0);
    c.style.transition = "none";
    c.style.transform = `translateY(${a.dy}px)`;
  };
  const soltarArrastre = () => {
    const a = arrastre.current;
    const c = caja.current;
    arrastre.current = null;
    if (!a || !c) return;
    if (a.dy > 110) {
      alCerrar();
      return;
    }
    c.style.transition = "transform .3s cubic-bezier(.2,.8,.2,1)";
    c.style.transform = "";
  };

  const sumarLasDos = () => {
    if (!otra) return;
    alSumar(foto.current);
    // `mover` de useVidriera calcula sobre la bolsa del último render: dos sumas en el mismo tick se pisan
    // (queda 1). La segunda va después del próximo render. (Pedido a estetica-base: actualización funcional.)
    window.setTimeout(() => alSumarOtra(otra), 160);
    setSumadas(true);
    window.setTimeout(() => setSumadas(false), 2400);
  };

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
      <div ref={caja} className="qb-ficha-caja">
        <button type="button" className="qb-cerrar" onClick={alCerrar} aria-label="Cerrar la ficha">
          <IconoCerrar />
        </button>

        {/* La mesa: la tirita con el nombre y el frasco apoyado. La foto se muestra a su tamaño real como
            mucho (son recortes de Instagram de ~300 px): la composición la hace la mesa, no la ampliación. */}
        <div
          ref={foto}
          className="qb-mesa qb-ficha-foto"
          onPointerDown={empezarArrastre}
          onPointerMove={moverArrastre}
          onPointerUp={soltarArrastre}
          onPointerCancel={soltarArrastre}
        >
          <Tirita sinFoto={!p.foto} apagada={sinStock}>
            <span className="qb-tirita-rotulo" aria-hidden="true">
              <span className="qb-tirita-nombre">{p.nombre}</span>
              {p.casa && <span className="qb-tirita-casa">{p.casa}</span>}
            </span>
          </Tirita>
          {p.foto && (
            <span className="qb-mesa-capa">
              <Image
                src={p.foto}
                alt={altDeFrasco(p.nombre, p.casa)}
                width={480}
                height={600}
                sizes="300px"
                priority
                className="qb-mesa-frasco"
                style={{ viewTransitionName: "qb-frasco-activo" } as CSSProperties}
              />
            </span>
          )}
        </div>

        <div className="qb-ficha-texto">
          {otra ? (
            <Comparacion
              p={p}
              otra={otra}
              sumadas={sumadas}
              sePuedenLasDos={sePuede(p) && sePuede(otra)}
              alVolver={() => setComparando(null)}
              alVer={() => alVer(otra.id)}
              alSumarLasDos={sumarLasDos}
            />
          ) : (
            <>
              <p className="qb-ficha-casa">{[p.casa, perfume?.concentracion].filter(Boolean).join(" · ") || "Qué Bien Olés"}</p>
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
              {etiqueta && (
                <p className="qb-pieza-dispo" data-dispo={p.disponibilidad}>
                  {etiqueta}
                </p>
              )}
              {perfume?.aviso && (
                <p className="qb-aviso" role="note">
                  {perfume.aviso}
                </p>
              )}

              {/* Compu: pegajosas arriba de la columna. Teléfono: barra fija al pie de la hoja. */}
              <div className="qb-ficha-acciones qb-ficha-barra">
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
                    {sinStock ? "Sin stock por ahora" : p.price ? "Sumar a la bolsa" : "Consultanos"}
                  </button>
                )}
                <a className="qb-boton qb-boton-linea qb-ficha-consultar" href={mensajeDirecto(instagram)} target="_blank" rel="noopener noreferrer" aria-label="Consultar por Instagram">
                  <IconoInstagram className="qb-icono-ig" /> <span className="qb-ficha-consultar-texto">Consultar</span>
                </a>
              </div>

              {perfume?.notas ? (
                <section className="qb-tiempo" aria-labelledby="qb-tiempo-titulo">
                  <h3 id="qb-tiempo-titulo" className="qb-ficha-sub">
                    Olelo en el tiempo
                  </h3>
                  <div className="qb-tiempo-pestanas" role="tablist" aria-label="Momentos del perfume" onKeyDown={teclaPestana} style={{ "--paso": momento } as CSSProperties}>
                    {MOMENTOS.map((m, i) => (
                      <button
                        key={m.id}
                        ref={(el) => {
                          pestanas.current[i] = el;
                        }}
                        type="button"
                        role="tab"
                        id={`qb-tiempo-${m.id}`}
                        aria-selected={momento === i}
                        aria-controls={`qb-tiempo-panel-${m.id}`}
                        tabIndex={momento === i ? 0 : -1}
                        onClick={() => setMomento(i)}
                      >
                        <span className="qb-tiempo-nombre">{m.nombre}</span>
                        <span className="qb-tiempo-capa">{m.capa}</span>
                      </button>
                    ))}
                    {/* La regla de tiempo: una línea oro con tres nodos; el nodo encendido se desliza. */}
                    <span className="qb-regla" aria-hidden="true">
                      <span className="qb-regla-cursor" />
                    </span>
                  </div>
                  {MOMENTOS.map((m, i) => (
                    <div
                      key={m.id}
                      role="tabpanel"
                      id={`qb-tiempo-panel-${m.id}`}
                      aria-labelledby={`qb-tiempo-${m.id}`}
                      hidden={momento !== i}
                      className="qb-tiempo-panel"
                    >
                      <ul className="qb-notas">
                        {perfume.notas![m.id].map((n, k) => (
                          <li key={n} style={{ "--k": k } as CSSProperties}>
                            {n}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
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
                    {perfume?.notas ? "Ponelo al lado" : "Si te gusta, mirá también"}
                  </h3>
                  {perfume?.notas && <p className="qb-parecidos-bajada">Elegí uno y comparalos capa por capa, como dos tiritas sobre el mostrador.</p>}
                  <ul>
                    {parecidos.map((x, i) => (
                      <li key={x.id} style={{ "--color-puerta": x.familia ? FAMILIA_POR_ID[x.familia].color : ORO } as CSSProperties}>
                        <button
                          type="button"
                          onClick={() => (perfume?.notas ? setComparando(x.id) : alVer(x.id))}
                          aria-label={perfume?.notas ? `Poner ${x.nombre} al lado de ${p.nombre}` : `Ver la ficha de ${x.nombre}`}
                        >
                          <span className="qb-mesa qb-mesa-mini">
                            <Tirita sinFoto={!x.foto} giro={i % 2 ? 1 : -1.5}>
                              <span />
                            </Tirita>
                            {x.foto && (
                              <span className="qb-mesa-capa">
                                <FotoDeFrasco src={x.foto} nombre={x.nombre} casa={x.casa} className="qb-mesa-frasco" />
                              </span>
                            )}
                          </span>
                          <span className="qb-parecido-nombre">{x.nombre}</span>
                          <span className="qb-parecido-precio">{x.price ? plata(x.price) : "Consultanos"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

// ── PONELO AL LADO: dos tiritas, tres capas en paralelo ──────────────────────

function Comparacion({
  p,
  otra,
  sumadas,
  sePuedenLasDos,
  alVolver,
  alVer,
  alSumarLasDos,
}: {
  p: Pieza;
  otra: Pieza;
  sumadas: boolean;
  sePuedenLasDos: boolean;
  alVolver: () => void;
  alVer: () => void;
  alSumarLasDos: () => void;
}) {
  const lados = [p, otra];
  return (
    <section className="qb-comparar" aria-labelledby="qb-ficha-nombre">
      <button type="button" className="qb-volver" onClick={alVolver}>
        ← Volver a la ficha
      </button>
      <p className="qb-ficha-sub">Ponelo al lado</p>
      <h2 id="qb-ficha-nombre" className="qb-sr">
        {p.nombre} al lado de {otra.nombre}
      </h2>
      <div className="qb-comparar-tabla" role="table" aria-label={`${p.nombre} y ${otra.nombre}, capa por capa`}>
        <div role="row" className="qb-comparar-fila qb-comparar-cabeza">
          <span role="columnheader" className="qb-sr">
            Momento
          </span>
          {lados.map((x, i) => (
            <div key={x.id} role="columnheader" className="qb-comparar-col" data-lado={i} style={{ "--color-puerta": x.familia ? FAMILIA_POR_ID[x.familia].color : ORO } as CSSProperties}>
              <span className="qb-comparar-tirita">
                <span className="qb-tirita-nombre">{x.nombre}</span>
                {x.casa && <span className="qb-tirita-casa">{x.casa}</span>}
              </span>
              <span className="qb-comparar-precio">{x.price ? plata(x.price) : "Consultanos"}</span>
            </div>
          ))}
        </div>
        {MOMENTOS.map((m) => (
          <div key={m.id} role="row" className="qb-comparar-fila">
            <span role="rowheader" className="qb-comparar-momento">
              {m.nombre} <small>{m.capa}</small>
            </span>
            {lados.map((x, i) => (
              <span key={x.id} role="cell" className="qb-comparar-col" data-lado={i}>
                {x.perfume?.notas ? x.perfume.notas[m.id].join(" · ") : "Todavía no cargamos su pirámide."}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="qb-comparar-acciones qb-ficha-barra">
        <button type="button" className="qb-boton qb-boton-oro" onClick={alSumarLasDos} disabled={!sePuedenLasDos}>
          {sumadas ? "¡Sumadas a la bolsa!" : "Sumar las dos"}
        </button>
        <button type="button" className="qb-boton qb-boton-linea" onClick={alVer}>
          Ver esta ficha
        </button>
      </div>
    </section>
  );
}
