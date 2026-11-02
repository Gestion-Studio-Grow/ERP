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
  return (
    <>
      <Button type="button" onClick={() => setAbierto(true)} className="min-h-11">
        {etiqueta}
      </Button>
      <Cajon abierto={abierto} onCerrar={() => setAbierto(false)} titulo={etiqueta} descripcion={servicios ? "Un producto, o un servicio sin turno previo." : "Lo que se lleva en el momento."}>
        {/* «¿Salió mal? Anular la venta» se toca acá adentro y queda en esta misma pantalla, en Cerrados:
            sin esto el cajón seguía abierto, tapando la lista donde se anula. Se mira el toque y no la
            URL: si ya se estaba en Cerrados, la URL no cambia. */}
        <div
          className="contents"
          onClick={(e) => {
            if ((e.target as Element).closest('a[href^="/admin/pedidos"]')) setAbierto(false);
          }}
        >
          {children}
        </div>
      </Cajon>
    </>
  );
}
