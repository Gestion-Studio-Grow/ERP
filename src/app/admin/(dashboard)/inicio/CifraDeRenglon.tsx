// ============================================================================
// El número de una app en la página de un espacio («Números del negocio», «Ventas»...): la cifra
// con su palabra («$ 120.000 · Cerrada · el efectivo va al libro, sin turno») o el motivo si no hay.
// ============================================================================
//
// Separado de InicioRenglon (que carga el número en el servidor) para poder medirlo en un navegador
// de verdad sin servidor: cifra-de-renglon-celular.test.ts.
//
// En el celular la columna de la cifra es `auto` (public/diseno/renglon.css, @media max-width
// 1023px) y se agranda hasta el largo de la frase: con «Cerrada · el efectivo va al libro, sin
// turno» se comía 215 de 358 px y el nombre de la app quedaba en 127 («Rep…», «Ingres…», recorrido
// del 25/09). Tope en el celular: la frase se parte en dos líneas y el nombre conserva más de la
// mitad del renglón. En la PC manda la columna de 17rem de la página, como siempre.

import type { ResultadoKpi } from "@/apps/kpis/nucleo.server";
import { Plata } from "@/components/ui/Plata";
import { Marca } from "@/components/ui/Marca";
import { montoANumero } from "./bandeja-core";

/** Tope de la cifra en el celular: deja al nombre de la app al menos la mitad del renglón a 390 px. */
const TOPE_MOVIL = "max-lg:max-w-40 max-lg:text-balance";

export function CifraDeRenglon({ r }: { r: ResultadoKpi }) {
  if (r.estado !== "ok") return <span className={`text-[13px] text-muted max-lg:block ${TOPE_MOVIL}`}>{r.motivo}</span>;
  const monto = montoANumero(r.monto) ?? montoANumero(r.valor);
  return (
    <span className={`grid justify-items-end ${TOPE_MOVIL}`}>
      {monto !== null ? <Plata valor={monto} sinCentavos tono={monto < 0 ? "peligro" : undefined} /> : <span data-ui="plata">{r.valor}</span>}
      {r.alerta ? (
        <Marca tipo="atencion">{r.alerta.texto}</Marca>
      ) : (
        r.detalle && <span className="text-[12px] text-muted">{r.detalle}</span>
      )}
    </span>
  );
}
