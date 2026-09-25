// MARGEN — cuánto te deja cada producto. Dos preguntas, separadas:
//
//   1. HOY: ¿algún producto se vende por debajo de lo que cuesta? Precio de lista contra el
//      costo vigente (el mismo de Stock y el Catálogo). Es el número del botón del Inicio y
//      se corrige cambiando un precio.
//   2. LO VENDIDO en el mes: al precio al que se vendió y con el costo GUARDADO en cada venta
//      (el que tenía ese día, no el de hoy). Sale de la misma lectura que el Resultado del mes,
//      así los dos cierran entre sí.
//
// Para un Responsable Inscripto, los precios van SIN IVA: el IVA no es suyo. Sin productos con
// precio y costo no hay margen que calcular: la pantalla dice qué cargar y dónde.
//
// El número del botón del Inicio es el de los que tienen el PRECIO DE LISTA por debajo del
// costo (una consulta, sin condición fiscal: margen-lectura.ts). Para un monotributista es el
// mismo de la tarjeta roja; a un inscripto la tarjeta le suma los que pierden al sacar el IVA
// y lo dice, así el número del botón aparece acá tal cual.
//
// Las palabras son las del rubro ("cortes" en la carnicería), como en el botón.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { leerCostosDelCatalogo } from "@/lib/inventory/inventory-loader";
import { esMesKey, etiquetaDelMes, mesDelNegocio, mesVecino } from "@/lib/libros/fecha-fiscal";
import { leerMargenDeHoy } from "@/lib/reports/margen-lectura";
import { leerResultadoDelMes } from "@/lib/reports/resultado-lectura";
import { margenDeLoVendido } from "@/lib/reports/margin";
import { cantidadLegible } from "@/lib/reports/ventas-mostrador";
import { appsQuePuedeAbrir } from "@/lib/reports/apps-a-mano.server";
import { negocioActual } from "@/apps/kpis/negocio.server";
import { pluralDe } from "@/apps/kpis/nucleo.server";
import { EmptyState, PageHeader, buttonClasses, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { Bloque, DosColumnas, Franja, Marca, PageContainer, Plata, Renglon, atributosBoton } from "@/components/ui";
import { LineaDeCuenta } from "@/components/ui/LineaDeCuenta";
import { PasoDePeriodo } from "@/components/ui/PasoDePeriodo";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { mesLargo, nombreMes } from "../../caja/_renglon/fechas";

export const dynamic = "force-dynamic";

const RUTA = "/admin/reportes/margen";
const money = (n: number) => fmtMoneyARS(n, 0);
const pct = (n: number) => `${(n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
/** Cuántos con margen positivo se listan (los que venden a pérdida van todos). */
const TOPE_CON_MARGEN = 30;

/**
 * DISEÑO NUEVO: el precio partido como en la etiqueta de la balanza. La raya entera es el precio;
 * la parte gris es lo que cuesta y la de color lo que queda. Si el costo pasa el precio, la raya va
 * entera en rojo. Es decorativa (aria-hidden): los números están escritos al lado.
 */
function RayaDelPrecio({ precio, costo }: { precio: number; costo: number }) {
  if (!(precio > 0)) return null;
  const perdida = costo > precio;
  const parteCosto = Math.max(0, Math.min(1, costo / precio)) * 100;
  return (
    <span aria-hidden data-ui="raya-precio" className="mt-1.5 flex h-1 w-full max-w-48 overflow-hidden bg-surface-sunken">
      {perdida ? (
        <span className="h-full w-full bg-danger" />
      ) : (
        <>
          <span className="h-full bg-line-strong" style={{ width: `${parteCosto}%` }} />
          <span className="h-full flex-1 bg-accent" />
        </>
      )}
    </span>
  );
}

function Tarjeta({ label, value, hint, tono }: { label: string; value: string; hint?: string; tono?: "danger" | "success" }) {
  const color = tono === "danger" ? "text-danger" : tono === "success" ? "text-success" : "text-strong";
  return (
    // `min-w-0` y el corte: en 412 px, dos tarjetas por fila y un monto de siete cifras no entran en text-2xl.
    <div className="min-w-0 rounded-lg border border-line p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-xl font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-2xl ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default async function MargenPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireApp("margen");
  const actual = mesDelNegocio();
  const { mes: pedido } = await searchParams;
  const mes = esMesKey(pedido) && pedido <= actual ? pedido : actual;
  const tenantId = await getCurrentTenantId();
  const [costosDelCatalogo, abribles, negocio] = await Promise.all([
    leerCostosDelCatalogo(tenantId),
    appsQuePuedeAbrir(user.role, ["catalogo", "recibir-mercaderia", "actualizar-precios", "resultado-del-mes"]),
    negocioActual(),
  ]);
  const uno = negocio.rubro?.wording.itemNoun?.trim() || "producto";
  const varios = pluralDe(uno);
  const deN = (n: number, singular: string, plural: string) => `${fmtNumberAR(n)} ${n === 1 ? singular : plural}`;
  const [hoy, resultado] = await Promise.all([
    leerMargenDeHoy(prisma, tenantId, { costosDelCatalogo, comercio: negocio.isRetail }),
    leerResultadoDelMes(prisma, tenantId, mes, { costosDelCatalogo, comercio: negocio.isRetail }),
  ]);
  const vendido = margenDeLoVendido(resultado.lineas, { sinIva: resultado.sinIva });
  const aPerdida = hoy.rows.filter((r) => r.margin < 0);
  const conMargen = hoy.rows.filter((r) => r.margin >= 0).sort((a, b) => b.marginPct - a.marginPct);
  const etiqueta = etiquetaDelMes(mes);
  const totalVentas = vendido.reduce((s, r) => s + r.ventas, 0);
  const totalCosto = vendido.reduce((s, r) => s + r.costo, 0);
  const sinCostoVendido = vendido.filter((r) => r.margen === null).length;
  const anterior = mesVecino(mes, -1);
  const siguiente = mesVecino(mes, 1);
  const iva = hoy.sinIva
    ? " Precios sin IVA (21%), porque tu negocio es Responsable Inscripto."
    : hoy.ivaIncluidoSinAlicuota
      ? " Precios con IVA incluido: el neto depende de la alícuota de cada producto, que el sistema todavía no guarda, así que el margen real es menor."
      : "";

  const botonCostos = abribles.has("catalogo") ? (
    <Link href="/admin/catalogo" className={buttonClasses("solid", "md")}>
      Cargar costos en el Catálogo
    </Link>
  ) : abribles.has("recibir-mercaderia") ? (
    <Link href="/admin/compras" className={buttonClasses("solid", "md")}>
      Ir a Recibir mercadería
    </Link>
  ) : undefined;

  // DISEÑO NUEVO («Renglón»): el dueño a la noche, con el celular, se pregunta «¿en qué estoy
  // perdiendo?». Arriba la respuesta en una línea; cada producto es un renglón con su porcentaje en
  // el folio, lo que deja por kilo o unidad en la columna de plata y el precio partido en una raya
  // (costo | lo que queda). Lo vendido del mes es una cuenta (vendido − costo = dejó), no tres
  // tarjetas. Las mismas lecturas y los mismos números; la explicación, plegada al pie.
  if (await disenoNuevo()) {
    const listados = [...aPerdida, ...conMargen.slice(0, TOPE_CON_MARGEN)];
    const dejo = totalVentas - totalCosto;
    return (
      <PageContainer>
        <PageHeader
          title="Margen"
          estado={
            hoy.summary.count === 0
              ? [`Sin ${varios} con precio y costo`]
              : [
                  <strong key="p">promedio {pct(hoy.summary.avgMarginPct)} sobre el precio</strong>,
                  aPerdida.length > 0 ? (
                    <Marca key="a" tipo="atencion">
                      {deN(aPerdida.length, `${uno} se vende`, `${varios} se venden`)} por debajo del costo
                    </Marca>
                  ) : (
                    <span key="a">ninguno por debajo del costo</span>
                  ),
                  hoy.sinIva ? "sin IVA" : null,
                ]
          }
          actions={
            aPerdida.length > 0 && abribles.has("actualizar-precios") ? (
              <Link href="/admin/catalogo/precios" className={buttonClasses("solid", "md")} {...atributosBoton("solid", "md")}>
                Actualizar precios
              </Link>
            ) : undefined
          }
        />
        {hoy.ivaIncluidoSinAlicuota && (
          <Franja tono="atencion" className="mb-5">
            Precios con IVA incluido: el neto depende de la alícuota de cada {uno}, que el sistema todavía no guarda. El margen real es menor que el que ves.
          </Franja>
        )}
        <DosColumnas>
          <Bloque id="hoy" titulo="Hoy: precio contra costo" cuenta={hoy.summary.count > 0 ? fmtNumberAR(hoy.summary.count) : undefined} nota="% · deja por unidad" className="min-w-0">
            {hoy.summary.count === 0 ? (
              <p data-ui="vacio" className="flex flex-wrap items-center gap-3 border-b border-line py-4 text-sm text-body">
                {hoy.sinCosto > 0
                  ? `Hay ${deN(hoy.sinCosto, uno, varios)} con precio y sin costo. El costo sale de la última compra o del que cargues en el Catálogo.`
                  : `El margen sale del precio y del costo: cargá los dos y acá ves cuánto deja cada ${uno}.`}
                {botonCostos}
              </p>
            ) : (
              <>
                <ul>
                  {listados.map((r) => (
                    <Renglon
                      key={r.id}
                      as="li"
                      folio={<span className={r.margin < 0 ? "font-semibold text-danger" : "font-semibold text-strong"}>{pct(r.marginPct)}</span>}
                      titulo={r.name}
                      detalle={
                        <>
                          {r.margin < 0 ? <Marca tipo="atencion">a pérdida</Marca> : null} {money(r.price)} − {money(r.cost)} por {r.unitLabel}
                          <RayaDelPrecio precio={r.price} costo={r.cost} />
                        </>
                      }
                      plata={
                        <span className="whitespace-nowrap">
                          <Plata valor={r.margin} sinCentavos />
                          <span className="text-[13px] text-muted">/{r.unitLabel}</span>
                        </span>
                      }
                    />
                  ))}
                </ul>
                {(hoy.sinCosto > 0 || conMargen.length > TOPE_CON_MARGEN || (hoy.sinIva && aPerdida.length > hoy.precioDeListaBajoCosto)) && (
                  <p className="mt-2 text-[13px] text-muted">
                    {hoy.sinIva && aPerdida.length > hoy.precioDeListaBajoCosto
                      ? `${deN(hoy.precioDeListaBajoCosto, "tiene", "tienen")} el precio de lista por debajo del costo y ${fmtNumberAR(aPerdida.length - hoy.precioDeListaBajoCosto)} más pierden al sacar el IVA. `
                      : ""}
                    {conMargen.length > TOPE_CON_MARGEN ? `Van los que pierden y los ${TOPE_CON_MARGEN} que más dejan, de ${fmtNumberAR(conMargen.length)}. ` : ""}
                    {hoy.sinCosto > 0 ? `${deN(hoy.sinCosto, `${uno} tiene`, `${varios} tienen`)} precio y no costo: no entran.` : ""}
                  </p>
                )}
              </>
            )}
          </Bloque>

          <Bloque id="vendido" titulo={`Lo que vendiste en ${nombreMes(mes)}`} nota={mes === actual ? "hasta hoy" : undefined} className="min-w-0">
            <PasoDePeriodo
              etiqueta="Mes"
              className="border-b border-line py-1"
              actual={mesLargo(mes)}
              anterior={{ href: `${RUTA}?mes=${anterior}`, texto: nombreMes(anterior) }}
              siguiente={siguiente <= actual ? { href: `${RUTA}?mes=${siguiente}`, texto: nombreMes(siguiente) } : null}
            />
            {vendido.length === 0 ? (
              <p data-ui="vacio" className="border-b border-line py-4 text-sm text-body">
                Sin ventas de {varios} en {etiqueta}. Acá aparece cada {uno} vendido, con lo que costó y lo que dejó.
              </p>
            ) : (
              <>
                <LineaDeCuenta concepto="Vendido" detalle={hoy.sinIva ? "sin IVA" : undefined} importe={<Plata valor={totalVentas} sinCentavos />} />
                <LineaDeCuenta concepto="Lo que costó" importe={<Plata valor={-totalCosto} sinCentavos />} />
                <LineaDeCuenta
                  total
                  concepto={dejo >= 0 ? "Dejó" : "Perdió"}
                  detalle={totalVentas > 0 ? `${pct(dejo / totalVentas)} de lo vendido` : undefined}
                  importe={<Plata valor={dejo} sinCentavos tono={dejo < 0 ? "peligro" : "cobrado"} />}
                />
                {sinCostoVendido > 0 && (
                  <p className="mt-3 text-[13px] text-body">
                    <Marca tipo="atencion">
                      {deN(sinCostoVendido, `${uno} vendido no tiene`, `${varios} vendidos no tienen`)} costo
                    </Marca>
                    : no se resta arriba y su margen va sin calcular.
                  </p>
                )}
                <ul className="mt-4 border-t border-line-strong">
                  {vendido.map((r) => (
                    <Renglon
                      key={r.clave}
                      as="li"
                      folio={r.margenPct !== null ? <span className={r.margenPct < 0 ? "text-danger" : undefined}>{pct(r.margenPct)}</span> : "—"}
                      titulo={r.nombre}
                      detalle={
                        <>
                          {cantidadLegible(r.cantidad, r.porKilo)} · vendido {money(r.ventas)} · costo {money(r.costo)}
                          {r.conCostoDeHoy ? " · parte con el costo de hoy" : ""}
                        </>
                      }
                      plata={r.margen === null ? <span className="text-[13px] text-muted">sin costo</span> : <Plata valor={r.margen} sinCentavos />}
                    />
                  ))}
                </ul>
              </>
            )}
            {abribles.has("resultado-del-mes") && (
              <p className="mt-4">
                <Link href={`/admin/resultado?mes=${mes}`} className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
                  Ver el resultado de {nombreMes(mes)}
                </Link>
              </p>
            )}
          </Bloque>
        </DosColumnas>
        <details className="mt-8 max-w-2xl border-t border-line pt-3 text-sm text-body">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium text-strong">¿Cómo se calcula?</summary>
          <p className="mt-2">
            Hoy: el precio de lista contra el costo vigente, el mismo que ves en Stock y en el Catálogo. Lo vendido: al precio al que se vendió
            (antes del descuento de la venta) y con el costo que se guardó en cada venta, el de ese día.
            {hoy.sinIva ? " Los precios van sin IVA (21 %), porque tu negocio es Responsable Inscripto: ese IVA no es tuyo." : ""}
          </p>
        </details>
      </PageContainer>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Margen"
        description={`Cuánto te deja cada ${uno}: hoy, con el precio y el costo de hoy, y en lo que vendiste, con el costo de cada venta.${iva}`}
      />

      <section aria-labelledby="hoy-titulo" className="mb-10">
        <h2 id="hoy-titulo" className="mb-1 text-lg font-semibold text-strong">
          Hoy: precio contra costo
        </h2>
        <p className="mb-4 text-sm text-muted">El precio de lista y el costo vigente (el mismo que ves en Stock y en el Catálogo).</p>

        {hoy.summary.count === 0 ? (
          <EmptyState
            title={`Todavía no hay ${varios} con precio y costo`}
            description={
              hoy.sinCosto > 0
                ? `Hay ${deN(hoy.sinCosto, uno, varios)} con precio y sin costo. El costo se toma de la última compra o del que cargues en el Catálogo.`
                : "El margen sale del precio de venta y del costo. Cargá los dos y acá vas a ver cuánto deja cada uno."
            }
            action={botonCostos}
          />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Tarjeta
                label={`${varios.charAt(0).toUpperCase()}${varios.slice(1)} con margen`}
                value={fmtNumberAR(hoy.summary.count)}
                hint={hoy.sinCosto > 0 ? `${fmtNumberAR(hoy.sinCosto)} con precio y sin costo` : "con precio y costo"}
              />
              <Tarjeta label="Margen promedio" value={pct(hoy.summary.avgMarginPct)} hint="sobre el precio" />
              <Tarjeta
                label="Se venden por debajo del costo"
                value={fmtNumberAR(aPerdida.length)}
                tono={aPerdida.length > 0 ? "danger" : "success"}
                hint={
                  hoy.sinIva && aPerdida.length > hoy.precioDeListaBajoCosto
                    ? `${deN(hoy.precioDeListaBajoCosto, "con el precio de lista", "con el precio de lista")} por debajo del costo y ${fmtNumberAR(aPerdida.length - hoy.precioDeListaBajoCosto)} más al sacar el IVA`
                    : aPerdida.length > 0
                      ? "cada venta pierde plata"
                      : "ninguno"
                }
              />
            </div>
            {aPerdida.length > 0 && abribles.has("actualizar-precios") && (
              <p className="mb-4">
                <Link href="/admin/catalogo/precios" className={buttonClasses("outline", "md")}>
                  Actualizar precios
                </Link>
              </p>
            )}
            <ul className="divide-y divide-line rounded-lg border border-line">
              {[...aPerdida, ...conMargen.slice(0, TOPE_CON_MARGEN)].map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-strong">{r.name}</span>
                    <span className="block text-xs text-muted">
                      {money(r.price)} − {money(r.cost)} por {r.unitLabel}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-right">
                    <span className={`font-semibold tabular-nums ${r.margin < 0 ? "text-danger" : "text-strong"}`}>{pct(r.marginPct)}</span>
                    <span className="block text-xs tabular-nums text-muted">{money(r.margin)}/{r.unitLabel}</span>
                  </span>
                </li>
              ))}
            </ul>
            {conMargen.length > TOPE_CON_MARGEN && (
              <p className="mt-2 text-xs text-muted">
                Se muestran los que venden a pérdida y los {TOPE_CON_MARGEN} con más margen de {fmtNumberAR(conMargen.length)}.
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="vendido-titulo">
        <h2 id="vendido-titulo" className="mb-1 text-lg font-semibold text-strong">
          Lo que vendiste en {etiqueta}
          {mes === actual ? " (hasta hoy)" : ""}
        </h2>
        <p className="mb-4 text-sm text-muted">
          Al precio al que se vendió (antes del descuento de la venta) y con el costo que se guardó en cada venta.
        </p>
        <nav aria-label="Mes" className="mb-4 flex flex-wrap items-center gap-3">
          <Link href={`${RUTA}?mes=${anterior}`} rel="prev" className={buttonClasses("outline", "md")}>
            <span className="capitalize">← {etiquetaDelMes(anterior)}</span>
          </Link>
          {siguiente <= actual && (
            <Link href={`${RUTA}?mes=${siguiente}`} rel="next" className={buttonClasses("outline", "md")}>
              <span className="capitalize">{etiquetaDelMes(siguiente)} →</span>
            </Link>
          )}
        </nav>

        {vendido.length === 0 ? (
          <EmptyState
            title={`Sin ventas de ${varios} en ${etiqueta}`}
            description={`Acá aparece cada ${uno} que se vendió en el mes, con lo que costó y lo que dejó.`}
          />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Tarjeta label="Vendido" value={money(totalVentas)} hint={hoy.sinIva ? "sin IVA" : undefined} />
              <Tarjeta label="Costo" value={money(totalCosto)} />
              <Tarjeta
                label="Dejó"
                value={money(totalVentas - totalCosto)}
                hint={totalVentas > 0 ? `${pct((totalVentas - totalCosto) / totalVentas)} de lo vendido` : undefined}
                tono={totalVentas - totalCosto < 0 ? "danger" : undefined}
              />
            </div>
            {sinCostoVendido > 0 && (
              <p className="mb-4 rounded-lg border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-body">
                De lo que vendiste, {deN(sinCostoVendido, `${uno} no tiene`, `${varios} no tienen`)} costo: su
                margen va sin calcular y lo que costaron no se resta arriba.
              </p>
            )}
            <ul className="divide-y divide-line rounded-lg border border-line">
              {vendido.map((r) => (
                <li key={r.clave} className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-strong">{r.nombre}</span>
                    <span className="block text-xs text-muted">
                      {cantidadLegible(r.cantidad, r.porKilo)} · vendido {money(r.ventas)} · costo {money(r.costo)}
                      {r.conCostoDeHoy ? " · parte con el costo de hoy" : ""}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-right">
                    {r.margen === null ? (
                      <span className="text-xs text-muted">sin costo</span>
                    ) : (
                      <>
                        <span className={`font-semibold tabular-nums ${r.margen < 0 ? "text-danger" : "text-strong"}`}>{money(r.margen)}</span>
                        {r.margenPct !== null && <span className="block text-xs tabular-nums text-muted">{pct(r.margenPct)}</span>}
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {abribles.has("resultado-del-mes") && (
          <p className="mt-6">
            <Link href={`/admin/resultado?mes=${mes}`} className={buttonClasses("outline", "md")}>
              Ver el resultado de {etiqueta}
            </Link>
          </p>
        )}
      </section>
    </main>
  );
}
