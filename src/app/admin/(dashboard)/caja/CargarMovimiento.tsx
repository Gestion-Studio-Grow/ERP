"use client";

// «Cargar un gasto o retiro» (diseño nuevo): la tecla de la Caja que abre, en un cajón, el
// formulario de SIEMPRE del libro (AddLibroEntryForm → `addLibroEntry`), que es el único camino de
// escritura manual de la plata: medio de pago, fecha contable, guarda de día congelado y guarda de
// duplicado contra lo que el sistema ya asentó. Acá sólo cambia dónde vive: arriba, a mano, y no
// al pie de la pantalla.
//
// También sirve para cerrar el turno de cajero (CloseCajaForm, con su confirmación): mismo cajón.

import { useState } from "react";
import { Cajon } from "@/components/ui/Cajon";
import { Button } from "@/components/ui";
import { AddLibroEntryForm } from "./libro/LibroForms";
import { CloseCajaForm } from "./CajaForms";

export function CargarMovimiento({
  dia,
  mes,
  variante = "outline",
}: {
  /** La fecha que propone el alta (un día abierto). */
  dia: string;
  /** El mes que se está mirando (el libro avisa si la fecha cae afuera). Por defecto, el de `dia`. */
  mes?: string;
  variante?: "solid" | "outline";
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button variant={variante} onClick={() => setAbierto(true)}>
        Cargar un gasto o retiro
      </Button>
      {abierto && (
        <Cajon
          abierto
          onCerrar={() => setAbierto(false)}
          titulo="Cargar un gasto, retiro o ingreso"
          descripcion="Lo que no viene de una venta. Los cobros del mostrador y de los turnos ya entran solos: no los cargues acá."
        >
          <AddLibroEntryForm defaultDate={dia} viewMonth={mes ?? dia.slice(0, 7)} />
        </Cajon>
      )}
    </>
  );
}

export function CerrarTurno({ esperado }: { esperado: number }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        Cerrar el turno
      </Button>
      {abierto && (
        <Cajon
          abierto
          onCerrar={() => setAbierto(false)}
          titulo="Cerrar el turno de cajero"
          descripcion="Contá el efectivo del cajón: se compara con lo esperado y la diferencia queda asentada."
        >
          <CloseCajaForm expected={esperado} />
        </Cajon>
      )}
    </>
  );
}
