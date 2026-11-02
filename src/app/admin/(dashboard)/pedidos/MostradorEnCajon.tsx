"use client";

// El mostrador de un negocio de SERVICIOS (CH) bajo «Diseño nuevo»: la tecla «Cobrar en el
// mostrador» y, al tocarla, el mismo formulario de siempre (Productos / Servicios) en un Cajon, que
// en el celular sube como hoja. La pantalla queda para la bandeja; el cobro, al costado.
// No cambia nada de cómo se cobra: `children` es el MostradorTabs que ya armaba la página.
// `?cobrar=1` la abre de entrada (para llegar desde el buscador o desde otra pantalla).

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Cajon } from "@/components/ui";

export default function MostradorEnCajon({ servicios, etiqueta = "Cobrar en el mostrador", children }: { servicios: boolean; etiqueta?: string; children: React.ReactNode }) {
  const params = useSearchParams();
  const [abierto, setAbierto] = useState(params.get("cobrar") === "1");
  // «¿Salió mal? Anular la venta» se toca adentro del cajón y queda en esta misma pantalla: sin esto
  // el cajón seguía abierto, tapando el formulario de anular que se acaba de pedir.
  const anular = params.get("anular");
  const [anularVisto, setAnularVisto] = useState(anular);
  if (anular !== anularVisto) {
    setAnularVisto(anular);
    if (anular) setAbierto(false);
  }
  return (
    <>
      <Button type="button" onClick={() => setAbierto(true)} className="min-h-11">
        {etiqueta}
      </Button>
      <Cajon abierto={abierto} onCerrar={() => setAbierto(false)} titulo={etiqueta} descripcion={servicios ? "Un producto, o un servicio sin turno previo." : "Lo que se lleva en el momento."}>
        {children}
      </Cajon>
    </>
  );
}
