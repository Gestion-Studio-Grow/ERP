"use client";

// El «+» de cada renglón. Sin nada en la bolsa es UNA tecla («+», 44 px): el renglón no se llena de
// ceros y menos. Con algo, se abre en − cantidad +. La cantidad se dice como en el mostrador
// ("250 g", "1,5 kg", "2"). Sin stock, la tecla queda apagada y el renglón lo dice con palabras.

import s from "./vidriera.module.css";
import { esPorPeso, pasoDe, textoCantidad, type ProductoVidriera } from "./catalogo-core";

export function Paso({
  p,
  q,
  onMover,
  compacto = false,
}: {
  p: ProductoVidriera;
  q: number;
  onMover: (dir: 1 | -1) => void;
  compacto?: boolean;
}) {
  const sinStock = p.disponibilidad === "sin-stock";
  const cuanto = esPorPeso(p) ? `${Math.round(pasoDe(p) * 1000)} g de` : "uno de";
  if (q <= 0) {
    return (
      <span className={s.paso} data-compacto={compacto || undefined}>
        <button
          type="button"
          className={`${s.pasoBtn} ${s.pasoMas}`}
          onClick={() => onMover(1)}
          disabled={sinStock}
          aria-label={sinStock ? `${p.name}: sin stock` : `Sumar ${cuanto} ${p.name}`}
        >
          +
        </button>
      </span>
    );
  }
  return (
    <span className={s.paso} data-compacto={compacto || undefined} role="group" aria-label={`Cantidad de ${p.name}`}>
      <button type="button" className={s.pasoBtn} onClick={() => onMover(-1)} aria-label={`Sacar ${cuanto} ${p.name}`}>
        −
      </button>
      <span className={s.pasoQ}>{esPorPeso(p) ? textoCantidad(p, q) : q}</span>
      <button
        type="button"
        className={`${s.pasoBtn} ${s.pasoMas}`}
        onClick={() => onMover(1)}
        disabled={sinStock}
        aria-label={`Sumar ${cuanto} ${p.name}`}
      >
        +
      </button>
    </span>
  );
}
