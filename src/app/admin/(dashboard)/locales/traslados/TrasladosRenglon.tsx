// ============================================================================
// TRASLADOS ENTRE LOCALES — diseño nuevo («Renglón»). Servidor, sin lecturas propias.
// ============================================================================
//
// Los mismos datos y el mismo formulario que la pantalla de siempre (trasladosAction +
// TrasladoForm). Lo de hoy va en una línea bajo el título, no en tres tarjetas; el formulario va
// en su bloque; los últimos 7 días son un libro de remitos: hora y número a la izquierda, de dónde
// a dónde y qué se mandó en el medio, «Ver remito» a la derecha.

import Link from "next/link";
import { textoCantidad, type Remito } from "@/lib/multilocal/traslado-core";
import { fmtDateTimeAr } from "@/lib/datetime";
import { Bloque, Renglon, buttonClasses, fmtNumberAR } from "@/components/ui";

export function CabeceraTraslados({ casa, hoy }: { casa: string; hoy: { cantidad: number; kg: number; unidades: number } }) {
  const partes = [`${fmtNumberAR(hoy.cantidad)} ${hoy.cantidad === 1 ? "traslado" : "traslados"} hoy`];
  if (hoy.kg > 0) partes.push(`${fmtNumberAR(hoy.kg, Number.isInteger(hoy.kg) ? 0 : 1)} kg`);
  if (hoy.unidades > 0) partes.push(`${fmtNumberAR(hoy.unidades)} ${hoy.unidades === 1 ? "unidad" : "unidades"}`);
  return (
    <header data-ui="page-header" className="mb-4">
      <h1 className="text-2xl font-bold text-strong">Traslados entre locales</h1>
      <p className="mt-1 text-sm text-muted">
        {casa}
        {" · "}
        <strong className="text-strong">{partes.join(" · ")}</strong>
      </p>
      <p className="mt-1 text-[13px] text-muted">Sale de un lugar y entra en el otro en el mismo momento, sólo entre lugares del mismo CUIT. No toca ninguna caja.</p>
    </header>
  );
}

export function LibroDeTraslados({ recientes }: { recientes: readonly Remito[] }) {
  return (
    <Bloque titulo="Últimos 7 días" cuenta={recientes.length > 0 ? `${fmtNumberAR(recientes.length)} ${recientes.length === 1 ? "remito" : "remitos"}` : undefined}>
      {recientes.length === 0 ? (
        <p className="py-3 text-sm text-muted">
          {"Todavía no hubo traslados esta semana. Cada uno queda acá con su remito para imprimir. "}
          <Link href="/admin/locales/stock" className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-2">
            Ver el stock de cada local
          </Link>
        </p>
      ) : (
        <ul aria-label="Traslados de los últimos 7 días">
          {recientes.map((t) => (
            <Renglon
              as="li"
              key={t.clave}
              className="py-2.5"
              folio={
                <span className="block w-[7.5rem] tabular-nums">
                  {fmtDateTimeAr(new Date(t.fecha))}
                  <span className="block">{`remito ${t.codigo}`}</span>
                </span>
              }
              titulo={<span className="font-medium break-words">{`${t.origen.nombre} → ${t.destino.nombre}`}</span>}
              detalle={
                <span className="break-words">
                  {t.lineas.map((l) => `${l.nombre} ${textoCantidad(l.cantidad, l.saleUnit, l.unidad)}`).join(" · ")}
                  {t.por ? ` · lo cargó ${t.por}` : ""}
                </span>
              }
              tecla={
                <Link href={`/admin/locales/traslados/${t.clave}`} className={buttonClasses("outline", "md", "min-h-11")}>
                  Ver remito<span className="sr-only"> {t.codigo}</span>
                </Link>
              }
            />
          ))}
        </ul>
      )}
    </Bloque>
  );
}
