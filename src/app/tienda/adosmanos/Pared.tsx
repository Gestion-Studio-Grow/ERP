"use client";

// ============================================================================
// LA PARED — el riel de la portada con las palas del catálogo colgadas (el único momento protagonista).
// ============================================================================
//
// Una línea azul cancha con un gancho por pala; de cada gancho cuelga la silueta por su forma real
// (palas.ts). Pasar el mouse, llevar el foco o tocar DESCUELGA la pala (sube y gira 6°) y aparece su
// etiqueta: modelo · forma · precio y «+». Con mouse o teclado, el clic / Enter abre la ficha. Con el
// dedo, el primer toque la descuelga (no hay hover) y el segundo abre la ficha; tocar afuera la cuelga.
// Sin catálogo de palas: tres siluetas grises y «Estamos cargando las palas».

import { useEffect, useRef, useState } from "react";
import { plata } from "../vidriera/catalogo-core";
import type { Item } from "./catalogo";
import { NOMBRE_FORMA } from "./palas";
import { Pala } from "./Siluetas";

export default function Pared({
  palas,
  hidratado,
  alAbrir,
  alSumar,
}: {
  palas: readonly Item[];
  hidratado: boolean;
  alAbrir: (id: string) => void;
  alSumar: (p: Item) => void;
}) {
  const [activa, setActiva] = useState<string | null>(null);
  const tipoDePuntero = useRef<string>("mouse");
  const lista = useRef<HTMLUListElement>(null);

  // Tocar afuera cuelga la pala descolgada.
  useEffect(() => {
    if (!activa) return;
    const fuera = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !lista.current?.contains(e.target)) setActiva(null);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [activa]);

  if (palas.length === 0)
    return (
      <div className="am-pared am-pared-vacia">
        <div className="am-riel" aria-hidden="true" />
        <ul className="am-perchas" aria-hidden="true">
          {(["redonda", "lagrima", "diamante"] as const).map((f, i) => (
            <li key={f} className="am-percha" style={{ ["--i" as string]: i }}>
              <span className="am-gancho" />
              <Pala forma={f} className="am-pala-gris" />
            </li>
          ))}
        </ul>
        <p className="am-vacio">Estamos cargando las palas.</p>
      </div>
    );

  return (
    <div className="am-pared">
      <div className="am-riel" aria-hidden="true" />
      <ul className="am-perchas" ref={lista} aria-label="La pared de palas">
        {palas.map((p, i) => {
          const v = p.vista;
          const forma = v.forma ?? "lagrima";
          const sinStock = p.disponibilidad === "sin-stock";
          return (
            <li key={p.id} className={`am-percha${activa === p.id ? " activa" : ""}${sinStock ? " agotado" : ""}`} style={{ ["--i" as string]: i }}>
              <span className="am-gancho" aria-hidden="true" />
              <button
                type="button"
                className="am-pala-btn"
                aria-label={`${p.name}, forma ${NOMBRE_FORMA[forma].toLowerCase()}${v.formaConFuente ? "" : " (a confirmar)"}, ${plata(p.precio)}. Ver ficha`}
                onPointerDown={(e) => {
                  tipoDePuntero.current = e.pointerType;
                }}
                onClick={() => {
                  if (tipoDePuntero.current === "touch" && activa !== p.id) {
                    setActiva(p.id);
                    return;
                  }
                  tipoDePuntero.current = "mouse";
                  alAbrir(p.id);
                }}
              >
                <Pala forma={forma} marca={v.marca} />
              </button>
              <div className="am-etiqueta">
                <p className="am-etiqueta-modelo">{v.marca ? `${v.marca} ${v.modelo}` : p.name}</p>
                <p className="am-etiqueta-dato">
                  {NOMBRE_FORMA[forma]}
                  {v.formaConFuente ? "" : " · a confirmar"} · <span className="am-num">{plata(p.precio)}</span>
                </p>
                {!sinStock ? (
                  <button type="button" className="am-mas am-mas-chico" onClick={() => alSumar(p)} disabled={!hidratado} aria-label={`Sumar ${p.name} a la bolsa`}>
                    <span aria-hidden="true">+</span>
                  </button>
                ) : (
                  <span className="am-dispo">Sin stock</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="am-pared-pie">
        <span className="am-ilus am-ilus-suelta">Ilustraciones por forma</span> Tocá una pala para descolgarla.
      </p>
    </div>
  );
}
