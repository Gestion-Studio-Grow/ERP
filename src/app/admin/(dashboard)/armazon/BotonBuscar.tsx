"use client";

// «Buscar /» — el botón que abre el buscador global de clientas y turnos desde una pantalla (en el
// celular no hay tecla «/»). Lo atiende BuscadorGlobal (armazón de siempre) o ArmazonNuevo, que
// escuchan el mismo evento (buscar-global.ts). Si nadie lo escucha (quien no ve la agenda), el
// botón no hace nada: por eso cada pantalla lo pone sólo donde la agenda existe.

import { Button } from "@/components/ui";
import { Icono } from "@/components/ui/Icono";
import { Kbd } from "@/components/ui/Kbd";
import { abrirBuscadorGlobal } from "./buscar-global";

export default function BotonBuscar({ etiqueta = "Buscar clienta" }: { etiqueta?: string }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={abrirBuscadorGlobal} aria-keyshortcuts="/" aria-haspopup="dialog">
      <Icono nombre="buscar" />
      <span className="ml-1.5">{etiqueta}</span>
      <span className="ml-2 max-lg:hidden" aria-hidden>
        <Kbd enBoton>/</Kbd>
      </span>
    </Button>
  );
}
