"use client";

// La barra fija de abajo del celular (DISENO.md §6): «Reservar turno» de 56 px a lo ancho, a un toque desde
// cualquier punto de la home, la carta y la ficha. Se esconde mientras el modal está arriba. En la compu no se
// dibuja (estilos-ch.ts). El pie compartido gana el alto de la barra (`body:has(.chf-barra) footer`) para que
// nada quede tapado al final de la página.
import { useBooking, type PrefillReserva } from "./BookingProvider";

export default function BarraReservar({ texto = "Reservar turno", prefill }: { texto?: string; prefill?: PrefillReserva }) {
  const { open, precargar, abierto } = useBooking();
  return (
    <div className="chf-barra" hidden={abierto}>
      <button type="button" className="chf-btn" onClick={() => open(prefill)} onPointerEnter={precargar} onFocus={precargar}>
        {texto}
      </button>
    </div>
  );
}
