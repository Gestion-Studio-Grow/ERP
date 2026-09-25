// ============================================================================
// VENTAS POR LOCAL — diseño nuevo («Renglón»). Servidor.
// ============================================================================
//
// Los mismos números que la pantalla de siempre (ventasDeLaRedAction): un renglón por local con
// la plata a la derecha, los totales por CUIT al pie (así se declaran el IVA y los ingresos
// brutos) y el día por día como libro. Nada de tarjetas: se comparan locales leyendo una columna.

import Link from "next/link";
import { sumarVentas, type Ventas, type VentasDeUnLocal } from "@/lib/multilocal/multilocal-core";
import { CASH_METHODS, CASH_METHOD_LABEL, totalOf } from "@/lib/caja/libro-caja";
import { Button, Input, LineaDeEstado, Plata, Rotulo, Select, buttonClasses, fmtCuit, fmtNumberAR } from "@/components/ui";
import { dia } from "../partes";

type Grupo = { cuit: string; locales: readonly string[]; total: Ventas };

const cobros = (n: number) => `${fmtNumberAR(n)} ${n === 1 ? "cobro" : "cobros"}`;
const plano = (n: number) => `$${fmtNumberAR(Math.round(n))}`;

/** «Efectivo $120.000 · MP $30.000 · anulado $4.000»: sólo los medios que se movieron. */
function detalleDeMedios(v: Ventas) {
  const partes = CASH_METHODS.filter((k) => v.ventas[k] !== 0).map((k) => `${CASH_METHOD_LABEL[k]} ${plano(v.ventas[k])}`);
  const anulado = totalOf(v.anulado);
  if (anulado > 0) partes.push(`anulado ${plano(anulado)}`);
  return partes.length > 0 ? partes.join(" · ") : "sin cobros";
}

export function CabeceraVentas({
  casa,
  desde,
  hasta,
  total,
  elegido,
}: {
  casa: string;
  desde: string;
  hasta: string;
  total: Ventas;
  elegido: string | null;
}) {
  return (
    <header data-ui="page-header" className="mb-4">
      <h1 className="text-2xl font-bold text-strong">Ventas por local</h1>
      <LineaDeEstado
        datos={[
          <span key="c">{casa}</span>,
          <span key="r">{`del ${dia(desde)} al ${dia(hasta)}`}</span>,
          <strong key="t">
            {elegido ? `${elegido}: ` : "La red: "}
            <Plata valor={total.neto} sinCentavos />
          </strong>,
          <span key="n">{cobros(total.cantidad)}</span>,
        ]}
      />
    </header>
  );
}

export function FiltroVentas({
  desde,
  hasta,
  local,
  locales,
  descarga,
}: {
  desde: string;
  hasta: string;
  local: string;
  locales: readonly { id: string; alias: string }[];
  descarga: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-line pb-3">
      <form method="get" className="flex flex-1 flex-wrap items-end gap-x-3 gap-y-2">
        <label className="grid min-w-[9.5rem] flex-1 gap-1 sm:flex-none">
          <Rotulo as="span">Desde</Rotulo>
          <Input type="date" name="desde" defaultValue={desde} />
        </label>
        <label className="grid min-w-[9.5rem] flex-1 gap-1 sm:flex-none">
          <Rotulo as="span">Hasta</Rotulo>
          <Input type="date" name="hasta" defaultValue={hasta} />
        </label>
        <label className="grid min-w-[10rem] flex-1 gap-1 sm:flex-none">
          <Rotulo as="span">Local</Rotulo>
          <Select name="local" defaultValue={local}>
            <option value="">Todos los locales</option>
            {locales.map((l) => (
              <option key={l.id} value={l.id}>
                {l.alias}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="outline" className="min-h-11">
          Ver
        </Button>
      </form>
      <a href={descarga} className={buttonClasses("solid", "md", "min-h-11")}>
        Descargar para la contadora
      </a>
    </div>
  );
}

/** Un renglón por local; al pie, lo que suma cada CUIT y la red. */
export function TablaVentas({ locales, porCuit, total, conPie }: { locales: readonly VentasDeUnLocal[]; porCuit: readonly Grupo[]; total: Ventas; conPie: boolean }) {
  return (
    <section aria-labelledby="ventas-locales" className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line-strong pb-2">
        <h2 id="ventas-locales" className="text-[15px] font-semibold text-strong">
          Lo cobrado en cada local
        </h2>
        <span className="text-[13px] text-muted">menos las anulaciones, según la caja de cada uno</span>
      </div>
      <table className="w-full text-sm">
        <thead className="max-md:sr-only">
          <tr className="border-b border-line">
            <th scope="col" className="py-1.5 text-left">
              <Rotulo as="span">Local</Rotulo>
            </th>
            <th scope="col" className="py-1.5 pl-3 text-right">
              <Rotulo as="span">Cobros</Rotulo>
            </th>
            <th scope="col" className="py-1.5 pl-3 text-right">
              <Rotulo as="span">Vendido</Rotulo>
            </th>
          </tr>
        </thead>
        <tbody>
          {locales.map((l) => (
            <tr key={l.local.localTenantId} className="border-b border-line align-top">
              <th scope="row" className="py-3 pr-3 text-left font-normal">
                <span className="block text-[15px] font-semibold text-strong break-words">{l.local.alias}</span>
                <span className="block text-[13px] text-muted break-words">
                  {l.local.arcaCuit ? `CUIT ${fmtCuit(l.local.arcaCuit)}` : "Sin CUIT cargado"}
                  {l.local.arcaPuntoVenta ? ` · punto de venta ${l.local.arcaPuntoVenta}` : ""}
                </span>
                <span className="block text-[13px] text-muted break-words tabular-nums">{detalleDeMedios(l.total)}</span>
              </th>
              <td className="py-3 pl-3 text-right text-[13px] text-muted tabular-nums whitespace-nowrap">{fmtNumberAR(l.total.cantidad)}</td>
              <td className="py-3 pl-3 text-right text-[15px] font-semibold whitespace-nowrap">
                <Plata valor={l.total.neto} />
              </td>
            </tr>
          ))}
        </tbody>
        {conPie && (
          <tfoot>
            {porCuit.map((g) => (
              <tr key={g.cuit} className="border-b border-line align-top">
                <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                  <span className="block font-medium text-strong">{`Suma del CUIT ${fmtCuit(g.cuit)}`}</span>
                  <span className="block text-[13px] text-muted break-words">{g.locales.join(", ")}</span>
                  <span className="block text-[13px] text-muted break-words tabular-nums">{detalleDeMedios(g.total)}</span>
                </th>
                <td className="py-2.5 pl-3 text-right text-[13px] text-muted tabular-nums">{fmtNumberAR(g.total.cantidad)}</td>
                <td className="py-2.5 pl-3 text-right font-semibold whitespace-nowrap">
                  <Plata valor={g.total.neto} />
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-line-strong">
              <th scope="row" className="py-3 pr-3 text-left text-[15px] font-bold text-strong">
                Toda la red
              </th>
              <td className="py-3 pl-3 text-right text-[13px] text-muted tabular-nums">{fmtNumberAR(total.cantidad)}</td>
              <td className="py-3 pl-3 text-right text-[17px] font-bold whitespace-nowrap">
                <Plata valor={total.neto} />
              </td>
            </tr>
          </tfoot>
        )}
      </table>
      {conPie && porCuit.length > 0 && (
        <p className="pt-2 text-[13px] text-muted">Al pie, los locales que comparten CUIT sumados: el IVA y los ingresos brutos se declaran por CUIT.</p>
      )}
    </section>
  );
}

/** Día por día como libro: una línea por día, lo de cada local en palabras y el total a la derecha. */
export function DiaPorDiaRenglon({ locales }: { locales: readonly VentasDeUnLocal[] }) {
  const dias = [...new Set(locales.flatMap((l) => l.porDia.map((d) => d.dia)))].sort().reverse();
  return (
    <section aria-labelledby="ventas-dias">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line-strong pb-2">
        <h2 id="ventas-dias" className="text-[15px] font-semibold text-strong">
          Día por día
        </h2>
        <span className="text-[13px] text-muted">{`${fmtNumberAR(dias.length)} ${dias.length === 1 ? "día con movimiento" : "días con movimiento"}`}</span>
      </div>
      {dias.length === 0 ? (
        <p className="py-3 text-sm text-muted">No hubo ventas en estas fechas. Probá con otro rango.</p>
      ) : (
        <ul>
          {dias.map((d) => {
            const delDia = locales.flatMap((l) => {
              const x = l.porDia.find((p) => p.dia === d);
              return x ? [{ alias: l.local.alias, v: x.ventas }] : [];
            });
            const totalDia = sumarVentas(delDia.map((x) => x.v));
            return (
              <li key={d} className="flex items-baseline justify-between gap-3 border-b border-line py-2.5">
                <span className="min-w-0">
                  <span className="block font-medium text-strong">{dia(d)}</span>
                  {locales.length > 1 && (
                    <span className="block text-[13px] text-muted break-words tabular-nums">
                      {delDia.map((x) => `${x.alias} ${plano(x.v.neto)}`).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-semibold">
                  <Plata valor={totalDia.neto} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="pt-2 text-[13px] text-muted">
        Para ver un local por dentro, elegilo arriba o{" "}
        <Link href="/admin/locales" className="inline-flex min-h-11 items-center font-medium text-accent-ink underline underline-offset-2">
          volvé a Mis locales
        </Link>
        .
      </p>
    </section>
  );
}
