// El bloque de precio de A Dos Manos: precio de lista grande y tabular, el chip «$X por transferencia»
// (apagado por constante: el dueño no cargó ese precio, tokens.ts) y «3 y 12 cuotas sin interés» si la
// promesa sigue prendida. Sin «use client»: lo usan la tarjeta, la ficha y el consejo.

import { plata } from "../vidriera/catalogo-core";
import { PROMESAS, precioTransferencia } from "./tokens";

export function BloqueDePrecio({ precio, grande = false }: { precio: number; grande?: boolean }) {
  const transferencia = precioTransferencia(precio);
  return (
    <div className={`am-precio-b${grande ? " grande" : ""}`}>
      <p className="am-precio am-num">{plata(precio)}</p>
      {transferencia !== null && <p className="am-chip-transf am-num">{plata(transferencia)} por transferencia</p>}
      {PROMESAS.cuotas && <p className="am-cuotas">3 y 12 cuotas sin interés</p>}
    </div>
  );
}
