"use client";

// El mostrador de un negocio de SERVICIOS (CH) bajo «Diseño nuevo»: la tecla «Cobrar en el
// mostrador» y, al tocarla, el mismo formulario de siempre (Productos / Servicios) en un Cajon, que
// en el celular sube como hoja. La pantalla queda para la bandeja; el cobro, al costado.
// No cambia nada de cómo se cobra: `children` es el MostradorTabs que ya armaba la página.
// `?cobrar=1` la abre de entrada (para llegar desde el buscador o desde otra pantalla).

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Cajon } from "@/components/ui";

export default function MostradorEnCajon({ servicios, children }: { servicios: boolean; children: React.ReactNode }) {
  const params = useSearchParams();
  const [abierto, setAbierto] = useState(params.get("cobrar") === "1");
  return (
    <>
      <Button type="button" onClick={() => setAbierto(true)} className="min-h-11">
        Cobrar en el mostrador
      </Button>
      <Cajon abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Cobrar en el mostrador" descripcion={servicios ? "Un producto, o un servicio sin turno previo." : "Lo que se lleva en el momento."}>
        {children}
      </Cajon>
    </>
  );
}
