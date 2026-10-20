"use client";

// «Tomar peso» en un ticket (Vender y Pedidos): UNA balanza por pantalla (dos ganchos chocarían
// por el puerto), que completa el peso del último renglón que se vende por kilo — el que se
// acaba de elegir. Sin Web Serial (celular, Safari, Firefox) no aparece nada y el peso se escribe
// a mano como siempre.

import { useState } from "react";
import { TomarPesoDeBalanza, formatearKilos } from "./TomarPesoDeBalanza";
import { formatearCantidad } from "@/lib/pos-peso";

export interface RenglonParaPesar {
  key: number;
  productId: string;
}

export default function TomarPesoParaElTicket({
  negocio,
  renglones,
  porKilo,
  nombreDe,
  alPoner,
}: {
  negocio: string;
  renglones: readonly RenglonParaPesar[];
  /** ¿El producto se vende por kilo? */
  porKilo: (productId: string) => boolean;
  nombreDe: (productId: string) => string;
  /** Escribe el peso en el campo del renglón (con coma, como lo escribiría la persona). */
  alPoner: (key: number, qtyText: string) => void;
}) {
  const [aviso, setAviso] = useState("");
  const destino = [...renglones].reverse().find((r) => r.productId && porKilo(r.productId));
  return (
    <div data-vender="balanza-cable" className="space-y-1">
      <TomarPesoDeBalanza
        negocio={negocio}
        alTomar={(kg) => {
          if (!destino) {
            setAviso("Elegí primero el corte que vas a pesar.");
            return;
          }
          alPoner(destino.key, formatearCantidad(kg));
          setAviso(`${nombreDe(destino.productId)}: ${formatearKilos(kg)}.`);
        }}
      />
      <p role="status" className="min-h-5 text-sm text-muted">
        {aviso}
      </p>
    </div>
  );
}
