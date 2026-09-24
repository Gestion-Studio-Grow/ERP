// RESULTADO DEL MES — cuánto dejó el mes: ventas menos lo que costó lo vendido menos los gastos.
//
// Abre por defecto el mes ANTERIOR (el que ya terminó y es el que se mira con la contadora);
// se puede ir al mes en curso, que dice "hasta hoy". La cuenta vive en
// src/lib/reports/resultado.ts (pura, probada con un mes armado a mano) y la lectura en
// resultado-lectura.ts. Acá sólo se pinta. El botón del Inicio va sin número: el resultado
// cruza seis tablas y la regla de los números del Inicio pide una consulta.
//
// Lo que NO es gasto (la compra de mercadería, el pago de una deuda, el retiro del dueño) se
// muestra aparte y con su monto, para que nadie lo reste a mano pensando que falta.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { leerCostosDelCatalogo } from "@/lib/inventory/inventory-loader";
import { esMesKey, etiquetaDelMes, mesDelNegocio, mesVecino } from "@/lib/libros/fecha-fiscal";
import { leerResultadoDelMes } from "@/lib/reports/resultado-lectura";
import { mesSinMovimiento } from "@/lib/reports/resultado";
import { negocioActual } from "@/apps/kpis/negocio.server";
import { appsQuePuedeAbrir } from "@/lib/reports/apps-a-mano.server";
import { AvisoError, EmptyState, PageHeader, buttonClasses, fmtMoneyARS, fmtNumberAR } from "@/components/ui";

export const dynamic = "force-dynamic";

const RUTA = "/admin/resultado";
const money = (n: number) => fmtMoneyARS(n, 0);
const pct = (n: number) => `${(n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;

function Tarjeta({ label, value, hint, tono }: { label: string; value: string; hint?: string; tono?: "success" | "danger" }) {
  const color = tono === "success" ? "text-success" : tono === "danger" ? "text-danger" : "text-strong";
  return (
    // `min-w-0` y el corte: en 412 px, dos tarjetas por fila y un monto de siete cifras no entran en text-2xl.
    <div className="min-w-0 rounded-lg border border-line p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-xl font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-2xl ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Una fila de la cuenta: rótulo a la izquierda, monto con signo a la derecha. */
function Fila({ rotulo, detalle, monto, fuerte }: { rotulo: string; detalle?: React.ReactNode; monto: number; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 text-sm ${fuerte ? "border-t border-line font-semibold text-strong" : "text-body"}`}>
      <span className="min-w-0">
        {rotulo}
        {detalle && <span className="block text-xs font-normal text-muted">{detalle}</span>}
      </span>
      <span className="whitespace-nowrap tabular-nums">{money(monto)}</span>
    </div>
  );
}

export default async function ResultadoPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireApp("resultado-del-mes");
  const actual = mesDelNegocio();
  const { mes: pedido } = await searchParams;
  // Un ?mes inválido o futuro abre el mes anterior: el que ya terminó.
  const mes = esMesKey(pedido) && pedido <= actual ? pedido : mesVecino(actual, -1);
  const tenantId = await getCurrentTenantId();
  const [costosDelCatalogo, abribles, negocio] = await Promise.all([
    leerCostosDelCatalogo(tenantId),
    appsQuePuedeAbrir(user.role, ["libro-de-caja", "margen", "catalogo", "vender"]),
    negocioActual(),
  ]);
  // Mostrador o servicios: decide si hay UNA alícuota verdadera para sacar el IVA (resultado.ts).
  const r = await leerResultadoDelMes(prisma, tenantId, mes, { costosDelCatalogo, comercio: negocio.isRetail });
  const etiqueta = etiquetaDelMes(mes);
  const enCurso = mes === actual;
  const anterior = mesVecino(mes, -1);
  const siguiente = mesVecino(mes, 1);
  const f = r.fuera;
  const fuera = [
    { rotulo: "Compras de mercadería", monto: f.compras, porque: "entran al costo cuando se venden, no cuando se compran" },
    { rotulo: "Pagos de deudas a proveedores", monto: f.pagosDeDeudas, porque: "la compra ya se contó; el pago sólo salda la deuda" },
    { rotulo: "Retiros del dueño", monto: f.retiros, porque: "es plata del dueño, no un gasto del negocio" },
    { rotulo: "Anulaciones de ventas", monto: f.anulaciones, porque: "la venta anulada ya no suma a las ventas" },
    { rotulo: "Cobros de fiado", monto: f.cobrosDeFiado, porque: "la venta se contó el día que se fió" },
    { rotulo: "Reintegros de proveedores", monto: f.reintegros, porque: "achican una compra, no son una venta" },
    {
      rotulo: `Ingresos cargados a mano (${fmtNumberAR(f.ingresosManualesCantidad)})`,
      monto: f.ingresosManuales,
      porque: "pueden ser un aporte, un préstamo o un cobro que ya se contó por otro lado",
    },
  ].filter((x) => x.monto !== 0);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Resultado del mes"
        description={`Cuánto dejó ${etiqueta}${enCurso ? " hasta hoy" : ""}: lo vendido, menos lo que costó lo vendido, menos los gastos.`}
      />

      <nav aria-label="Mes" className="mb-6 flex flex-wrap items-center gap-3">
        <Link href={`${RUTA}?mes=${anterior}`} rel="prev" className={buttonClasses("outline", "md")}>
          <span className="capitalize">← {etiquetaDelMes(anterior)}</span>
        </Link>
        <span className="text-sm font-medium capitalize text-strong">{etiqueta}</span>
        {siguiente <= actual && (
          <Link href={`${RUTA}?mes=${siguiente}`} rel="next" className={buttonClasses("outline", "md")}>
            <span className="capitalize">{etiquetaDelMes(siguiente)} →</span>
          </Link>
        )}
      </nav>

      {mesSinMovimiento(r) ? (
        <EmptyState
          title={`Sin ventas ni gastos en ${etiqueta}`}
          description="El resultado sale de las ventas cobradas (o dejadas a cuenta), de lo que costó lo vendido y de los gastos del libro de caja. Cuando haya movimiento en el mes, acá vas a ver cuánto dejó."
          action={
            abribles.has("vender") ? (
              <Link href="/admin/vender" className={buttonClasses("solid", "md")}>
                Ir a Vender
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tarjeta label="Ventas" value={money(r.ventas.neto)} hint={r.sinIva ? "Sin IVA" : "Como se cobraron"} />
            <Tarjeta label="Costo de lo vendido" value={money(r.costo.total)} />
            <Tarjeta label="Gastos" value={money(r.gastos.total)} />
            <Tarjeta
              label={r.resultado >= 0 ? "Dejó" : "Perdió"}
              value={money(Math.abs(r.resultado))}
              hint={r.margenSobreVentas === null ? undefined : `${pct(r.margenSobreVentas)} de las ventas`}
              tono={r.resultado >= 0 ? "success" : "danger"}
            />
          </div>

          {r.costo.lineasSinCosto > 0 && (
            <AvisoError
              tono="aviso"
              className="mb-4"
              titulo={`${fmtNumberAR(r.costo.lineasSinCosto)} ${r.costo.lineasSinCosto === 1 ? "línea vendida no tiene" : "líneas vendidas no tienen"} costo`}
              comoSeguir={`Se vendieron ${money(r.costo.vendidoSinCosto)} de productos sin costo cargado: no se restan, así que el resultado sale más alto de lo que es. Cargá el costo en el Catálogo o al recibir la mercadería.`}
              accion={
                abribles.has("catalogo") ? (
                  <Link href="/admin/catalogo" className={buttonClasses("outline", "md")}>
                    Ir al Catálogo
                  </Link>
                ) : undefined
              }
            />
          )}
          {r.ivaIncluidoSinAlicuota && r.ventas.bruto > 0 && (
            <p className="mb-4 rounded-lg border border-line bg-surface-sunken px-4 py-3 text-sm text-body">
              Tus ventas van con el IVA incluido. Como Responsable Inscripto ese IVA no es tuyo, pero cuánto es depende de la
              alícuota de cada producto (la carne, por ejemplo, paga 10,5% y no 21%) y el sistema todavía no la guarda por
              producto: por eso no se descuenta y el resultado real es menor que el que ves.
            </p>
          )}
          {r.condicion === "sin-comprobantes" && r.ventas.bruto > 0 && (
            <p className="mb-4 rounded-lg border border-line bg-surface-sunken px-4 py-3 text-sm text-body">
              Todavía no hay facturas con CAE, así que no se sabe si tu negocio es Responsable Inscripto: las ventas van como
              se cobraron. Si lo sos, el IVA incluido en el precio no es tuyo y el resultado real es menor.
            </p>
          )}

          <section aria-labelledby="cuenta-titulo" className="mb-8 rounded-lg border border-line p-4">
            <h2 id="cuenta-titulo" className="mb-2 text-base font-semibold text-strong">
              Cómo se llega
            </h2>
            {r.ventas.mostrador !== 0 && (
              <Fila rotulo="Ventas del mostrador cobradas" detalle={`${fmtNumberAR(r.ventas.mostradorCantidad)} ventas`} monto={r.ventas.mostrador} />
            )}
            {r.ventas.aCuenta !== 0 && (
              <Fila rotulo="Ventas a cuenta (fiado)" detalle={`${fmtNumberAR(r.ventas.aCuentaCantidad)} ventas a la cuenta del cliente`} monto={r.ventas.aCuenta} />
            )}
            {r.ventas.turnos !== 0 && (
              <Fila rotulo="Turnos cobrados" detalle={`${fmtNumberAR(r.ventas.turnosCantidad)} cobros, por la fecha del cobro`} monto={r.ventas.turnos} />
            )}
            {r.sinIva && r.alicuota != null && (
              <Fila
                rotulo={`Menos el IVA (${pct(r.alicuota)})`}
                detalle="El que cobraste por cuenta de ARCA: no es tuyo. Es la alícuota con la que factura hoy el sistema."
                monto={-(r.ventas.bruto - r.ventas.neto)}
              />
            )}
            <Fila rotulo="Ventas" monto={r.ventas.neto} fuerte />
            {r.costo.mercaderia !== 0 && (
              <Fila
                rotulo="Costo de la mercadería vendida"
                detalle={
                  r.costo.lineasAlCostoDeHoy > 0
                    ? `Con el costo guardado en cada venta; ${fmtNumberAR(r.costo.lineasAlCostoDeHoy)} ${r.costo.lineasAlCostoDeHoy === 1 ? "línea no lo guardó y va" : "líneas no lo guardaron y van"} con el costo de hoy.`
                    : "Con el costo guardado en cada venta."
                }
                monto={-r.costo.mercaderia}
              />
            )}
            {r.costo.insumos !== 0 && <Fila rotulo="Insumos usados en los servicios" monto={-r.costo.insumos} />}
            {r.gastos.comisiones !== 0 && <Fila rotulo="Comisiones pagadas" monto={-r.gastos.comisiones} />}
            {r.gastos.diferenciasDeCaja !== 0 && (
              <Fila
                rotulo={r.gastos.diferenciasDeCaja > 0 ? "Faltantes de caja" : "Sobrantes de caja"}
                detalle="Lo que dejaron los cierres del día, faltantes menos sobrantes."
                monto={-r.gastos.diferenciasDeCaja}
              />
            )}
            {r.gastos.sinCategoria !== 0 && (
              <Fila
                rotulo={`Gastos sin categoría (${fmtNumberAR(r.gastos.sinCategoriaCantidad)})`}
                detalle={
                  abribles.has("libro-de-caja") ? (
                    <>
                      Los egresos cargados a mano en el libro de caja.{" "}
                      <Link href={`/admin/caja/libro?mes=${mes}`} className="inline-flex min-h-11 items-center font-medium text-strong underline underline-offset-4">
                        Verlos en el libro
                      </Link>
                    </>
                  ) : (
                    "Los egresos cargados a mano en el libro de caja."
                  )
                }
                monto={-r.gastos.sinCategoria}
              />
            )}
            <Fila rotulo={r.resultado >= 0 ? "Dejó" : "Perdió"} monto={r.resultado} fuerte />
          </section>

          {fuera.length > 0 && (
            <section aria-labelledby="fuera-titulo" className="mb-8">
              <h2 id="fuera-titulo" className="mb-1 text-base font-semibold text-strong">
                Lo que se movió en la caja y no es resultado
              </h2>
              <p className="mb-3 text-sm text-muted">Está en el libro de caja, pero no suma ni resta acá. Por qué, en cada caso:</p>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {fuera.map((x) => (
                  <li key={x.rotulo} className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="text-strong">{x.rotulo}</span>
                      <span className="block text-xs text-muted">{x.porque}</span>
                    </span>
                    <span className="whitespace-nowrap tabular-nums text-body">{money(x.monto)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {abribles.has("margen") && (
            <Link href={`/admin/reportes/margen?mes=${mes}`} className={buttonClasses("outline", "md")}>
              Ver cuánto dejó cada producto
            </Link>
          )}
        </>
      )}
    </main>
  );
}
