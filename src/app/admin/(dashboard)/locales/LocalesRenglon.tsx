// ============================================================================
// MIS LOCALES — la pantalla del diseño nuevo («Renglón»). Servidor.
// ============================================================================
//
// Los mismos números que la pantalla de siempre (redDeLaCasaAction, una lectura por local), en
// el orden en que la dueña los mira: arriba, la red en una línea; abajo, un renglón por local
// con su caja, lo que cobró hoy, el efectivo del cajón y el stock, y UNA tecla: abrir su caja.
//
// Criterio de la plata (el mismo que Caja del día): sólo el efectivo tiene un «hay ahora» que se
// pueda contar. El saldo acumulado de MP, transferencias y tarjeta crece para siempre porque nadie
// anota el pase al banco ($42 millones de MP en Canning con $111 mil en el cajón), así que acá no
// se muestra ni se suma: de esos medios va lo que entró hoy.

import Link from "next/link";
import { cambioRelativo, contarStock, direccionDelLocal, type LocalConPasada, type ResumenRed } from "@/lib/multilocal/multilocal-core";
import { CASH_METHODS, CASH_METHOD_LABEL, totalOf } from "@/lib/caja/libro-caja";
import { LineaDeEstado, Marca, Plata, Rotulo, fmtNumberAR } from "@/components/ui";
import { AbrirLocal, dia, type ruteoDeLocales } from "./partes";

type Ruteo = ReturnType<typeof ruteoDeLocales>;

export function CabeceraLocales({ casa, hoy, resumen, red, veStock }: { casa: string; hoy: string; resumen: ResumenRed; red: readonly LocalConPasada[]; veStock: boolean }) {
  const { semana } = resumen;
  const cambio = cambioRelativo(semana.actual, semana.anterior);
  const stock = contarStock(red.map((x) => x.dato.stock));
  const enlace = "font-medium text-accent-ink underline underline-offset-2";
  return (
    <header data-ui="page-header" className="mb-4">
      <h1 className="text-2xl font-bold text-strong">Mis locales</h1>
      <LineaDeEstado
        datos={[
          <span key="h">{`${casa} · hoy, ${dia(hoy)}`}</span>,
          <strong key="c">
            Cobrado hoy <Plata valor={resumen.cobradoHoy} sinCentavos />
          </strong>,
          <Link key="cj" href="/admin/locales/cajas" className={enlace}>
            {resumen.cajasSinCerrar === 0
              ? "Cajas cerradas hasta ayer"
              : `${fmtNumberAR(resumen.cajasSinCerrar)} ${resumen.cajasSinCerrar === 1 ? "caja" : "cajas"} sin cerrar${resumen.pendienteMasViejo ? `, desde el ${dia(resumen.pendienteMasViejo)}` : ""}`}
          </Link>,
          stock.stockBajo.productos > 0 ? (
            veStock ? (
              <Link key="s" href="/admin/locales/stock" className={enlace}>
                {`${fmtNumberAR(stock.stockBajo.productos)} productos bajo el mínimo`}
              </Link>
            ) : (
              <span key="s">{`${fmtNumberAR(stock.stockBajo.productos)} productos bajo el mínimo`}</span>
            )
          ) : null,
          <Link key="sem" href="/admin/locales/ventas" className={enlace}>
            Esta semana <Plata valor={semana.actual} sinCentavos />
            {cambio === null ? "" : ` (${cambio >= 0 ? "+" : "−"}${fmtNumberAR(Math.round(porcentajeDeCambio(cambio)))} %)`}
          </Link>,
        ]}
      />
    </header>
  );
}

function EstadoCaja({ x }: { x: LocalConPasada }) {
  const c = x.dato.caja;
  if (c.estado === "cerrada-hoy") return <Marca tipo="hecho">Cerró hoy</Marca>;
  if (c.pendienteDesde) return <Marca tipo="atencion">{`Sin cerrar desde el ${dia(c.pendienteDesde)}`}</Marca>;
  return <Marca tipo="info">Al día</Marca>;
}

function Stock({ x }: { x: LocalConPasada }) {
  const s = contarStock([x.dato.stock]);
  if (s.stockBajo.productos === 0 && s.stockNegativo.productos === 0) return <span className="text-muted">Nada bajo el mínimo</span>;
  return (
    <span>
      {s.stockBajo.productos > 0 && `${fmtNumberAR(s.stockBajo.productos)} bajo el mínimo`}
      {s.stockNegativo.productos > 0 && (
        <span className="text-danger">{`${s.stockBajo.productos > 0 ? " · " : ""}${fmtNumberAR(s.stockNegativo.productos)} en negativo`}</span>
      )}
    </span>
  );
}

export function TablaLocales({ red, ruteo }: { red: readonly LocalConPasada[]; ruteo: Ruteo }) {
  return (
    <section aria-labelledby="locales-red">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line-strong pb-2">
        <h2 id="locales-red" className="text-[15px] font-semibold text-strong">
          Locales de la red
        </h2>
        <span className="text-[13px] text-muted">{`${red.length} ${red.length === 1 ? "local" : "locales"}`}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="max-md:sr-only">
          <tr className="border-b border-line">
            {["Local", "Caja", "Cobrado hoy", "Efectivo en el cajón", "Stock", ""].map((t, i) => (
              <th key={i} scope="col" className={i === 2 || i === 3 ? "py-1.5 pl-3 text-right" : i === 4 ? "py-1.5 pl-4 text-left" : "py-1.5 text-left"}>
                {t ? <Rotulo as="span">{t}</Rotulo> : <span className="sr-only">Abrir</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {red.map((x) => {
            const { local, dato } = x;
            const anulado = totalOf(dato.hoy.anulado);
            const cajon = dato.caja.estado === "abierta" ? dato.caja.porMedio.EFECTIVO.hay : null;
            const porMedio = CASH_METHODS.filter((k) => dato.hoy.ventas[k] > 0).map((k) => `${CASH_METHOD_LABEL[k]} ${fmtPlano(dato.hoy.ventas[k])}`);
            const url = direccionDelLocal(local.subdomain, ruteo, "/admin/caja");
            return (
              <tr key={local.localTenantId} className="border-b border-line align-top max-md:grid max-md:grid-cols-[1fr_auto] max-md:gap-x-3 max-md:py-3">
                <th scope="row" className="py-3 pr-3 text-left font-normal max-md:col-span-2 max-md:py-0">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] font-semibold text-strong break-words">{local.alias}</span>
                    <span className="text-right font-semibold md:hidden">
                      <Plata valor={dato.hoy.neto} />
                    </span>
                  </span>
                  <span className="block text-[13px] text-muted break-words">
                    {local.nombre}
                    {local.arcaPuntoVenta ? ` · punto de venta ${local.arcaPuntoVenta}` : " · sin punto de venta"}
                  </span>
                  <span className="block text-[13px] text-muted">
                    {`${fmtNumberAR(dato.hoy.cantidad)} ${dato.hoy.cantidad === 1 ? "cobro" : "cobros"} hoy`}
                    {porMedio.length > 0 && ` · ${porMedio.join(" · ")}`}
                    {anulado > 0 && ` · anulado ${fmtPlano(anulado)}`}
                  </span>
                </th>
                <td className="py-3 pr-3 max-md:col-span-2 max-md:pt-1.5 max-md:pb-0">
                  <EstadoCaja x={x} />
                  {cajon !== null && (
                    <span className="text-[13px] text-muted md:hidden">
                      {" · "}en el cajón <Plata valor={cajon} sinCentavos />
                    </span>
                  )}
                </td>
                <td className="py-3 text-right font-semibold max-md:hidden">
                  <Plata valor={dato.hoy.neto} />
                </td>
                <td className="py-3 text-right max-md:hidden">{cajon === null ? <span className="text-muted">—</span> : <Plata valor={cajon} />}</td>
                <td className="py-3 pl-4 text-[13px] max-md:self-center max-md:pl-0 max-md:pt-1.5">
                  <Stock x={x} />
                </td>
                <td className="py-2 pl-3 text-right max-md:pt-1.5 max-md:pl-0">
                  <AbrirLocal url={url} etiqueta="Abrir su caja" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="pt-2 text-[13px] text-muted">
        El efectivo es el que tiene que haber en el cajón de cada local desde su último cierre. MP, transferencias y tarjeta van con lo
        cobrado hoy; su saldo acumulado está en el Libro de caja de cada local.
      </p>
    </section>
  );
}

// Para el detalle en palabras (no es una columna de plata): «$27.750».
function fmtPlano(n: number) {
  return `$${fmtNumberAR(Math.round(n))}`;
}

/** Un cambio relativo (0,125) como porcentaje (12,5): es una proporción, no plata. */
function porcentajeDeCambio(cambio: number): number {
  return Math.abs(cambio) * 100;
}
