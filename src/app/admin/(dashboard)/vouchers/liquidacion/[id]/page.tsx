import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { permisoEfectivo } from "@/lib/capabilities";
import { getCurrentTenantId } from "@/lib/tenant";
import { todayInBusinessTz } from "@/lib/datetime";
import { interruptoresDelNegocio } from "@/cambios/interruptores.server";
import { vouchersPrendidos } from "@/cambios/interruptores";
import { leerLiquidacion } from "@/lib/vouchers/liquidacion-repo";
import { ETIQUETA_MEDIO_ADMINISTRACION, ETIQUETA_RESULTADO, esMedioAdministracion, fechaArgentina, motivoParaNoRechazarCheque } from "@/lib/vouchers/liquidacion-core";
import { AvisoError, Marca, PageHeader, Plata, buttonClasses, atributosBoton } from "@/components/ui";
import { AcreditacionDelPago, ConciliarLiquidacion, DarDeBajaImpago, DescartarLiquidacion, Imprimir } from "../../LiquidacionFormularios";

export const dynamic = "force-dynamic";

// REPORTE DEL LUNES (CH Estética · administración de La Alameda, regla del dueño del 08/11/2026).
//
// La liquidación de una semana: el detalle voucher por voucher (número, vecino, fecha, servicio,
// importe) y el total, para mandarle a la administradora (se imprime o se guarda como PDF desde el
// navegador, o se baja la planilla CSV; el envío lo decide CH, nada se manda solo). Abierta, se
// concilia acá contra el pago; conciliada, muestra el pago, la diferencia y el resultado por voucher.
// Guardia: app «vouchers» + `cash:manage` + interruptor «vouchers» (apagado = 404).

const TH = "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted";
const TD = "whitespace-nowrap px-3 py-2";

export default async function LiquidacionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("vouchers");
  // `cash:manage` guarda la página entera: quien llega acá puede conciliar y dar de baja un impago.
  const user = await requireCapability("cash:manage");
  const puedeDarDeBaja = permisoEfectivo(user, "cash:manage");
  // Marcar un cheque rechazado: sólo el dueño (orden del 08/11/2026). La acción lo vuelve a exigir.
  const puedeRechazarCheque = motivoParaNoRechazarCheque(user) === null;
  if (!vouchersPrendidos(await interruptoresDelNegocio())) notFound();
  const { id } = await params;
  const l = await leerLiquidacion(await getCurrentTenantId(), id);
  if (!l) notFound();
  const conciliada = l.estado === "CONCILIADA";
  const titulo = `Liquidación de vouchers del ${fechaArgentina(l.desde)} al ${fechaArgentina(l.hasta)}`;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title={titulo}
        description={`${l.negocio} · administración del country La Alameda. ${conciliada ? "Conciliada con el pago de la administración." : "Esperando el pago de la administración."}`}
        estado={[`${l.cantidad} ${l.cantidad === 1 ? "voucher" : "vouchers"}`, <Plata key="t" valor={l.total} sinCentavos={Number.isInteger(l.total)} />]}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Imprimir />
            <a href={`/admin/vouchers/liquidacion/${l.id}/csv`} download className={buttonClasses("outline", "md")} {...atributosBoton("outline", "md")}>
              Bajar la planilla
            </a>
          </div>
        }
      />

      <div className="overflow-x-auto rounded-md border border-line" role="region" aria-label="Vouchers de la liquidación" tabIndex={0}>
        <table className="w-full text-sm">
          <caption className="sr-only">Vouchers usados en la semana, con vecino, fecha, servicio e importe</caption>
          <thead className="border-b border-line-strong bg-surface-raised">
            <tr>
              <th scope="col" className={TH}>Número</th>
              <th scope="col" className={TH}>Vecino</th>
              <th scope="col" className={TH}>Fecha</th>
              <th scope="col" className={TH}>Servicio</th>
              <th scope="col" className={`${TH} text-right`}>Importe</th>
              {conciliada && <th scope="col" className={TH}>Resultado</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {l.renglones.map((r) => (
              <tr key={r.id}>
                <th scope="row" className={`${TD} text-left font-mono font-semibold text-strong`}>{r.numero}</th>
                <td className={TD}>{r.vecino}</td>
                <td className={`${TD} tabular-nums`}>{fechaArgentina(r.fecha)}</td>
                <td className={TD}>{r.servicio ?? "—"}</td>
                <td className={`${TD} text-right`}>
                  <Plata valor={r.valor} sinCentavos={Number.isInteger(r.valor)} />
                </td>
                {conciliada && (
                  <td className={TD}>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.baja === "dada" ? (
                        <Marca tipo="atencion">Dado de baja</Marca>
                      ) : r.resultado ? (
                        <Marca tipo={r.resultado === "PAGADO" ? "hecho" : "atencion"}>{ETIQUETA_RESULTADO[r.resultado]}</Marca>
                      ) : (
                        "—"
                      )}
                      {/* Junto a cada impago: la baja con motivo y confirmación (bajaDeImpago). */}
                      {puedeDarDeBaja && r.baja === "pendiente" && (
                        <span className="print:hidden">
                          <DarDeBajaImpago numero={r.numero} />
                        </span>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line-strong">
            <tr>
              <th scope="row" colSpan={4} className={`${TD} text-left font-semibold text-strong`}>
                Total
              </th>
              <td className={`${TD} text-right font-semibold`}>
                <Plata valor={l.total} sinCentavos={Number.isInteger(l.total)} />
              </td>
              {conciliada && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {conciliada ? (
        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Pagó la administración</dt>
            <dd className="text-strong">
              {l.pagado == null ? "—" : <Plata valor={l.pagado} sinCentavos={Number.isInteger(l.pagado)} />}
              {l.pagoFecha && ` el ${fechaArgentina(l.pagoFecha)}`}
              {l.pagoMedio && esMedioAdministracion(l.pagoMedio) && ` · ${ETIQUETA_MEDIO_ADMINISTRACION[l.pagoMedio]}`}
              {l.pagoReferencia && ` · ${l.pagoReferencia}`}
            </dd>
          </div>
          {l.pago && (
            <div className="sm:col-span-2 print:hidden">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Conciliación con Mercado Pago</dt>
              <dd className="mt-1">
                <AcreditacionDelPago pagoId={l.pago.id} liquidacionId={l.id} estado={l.pago.acreditacion} puedeRechazarCheque={puedeRechazarCheque} />
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Diferencia (pagado − aceptado)</dt>
            <dd className="text-strong" data-testid="diferencia-liquidacion">
              {l.diferencia ? (
                <Marca tipo="atencion">
                  <Plata valor={l.diferencia} sinCentavos={Number.isInteger(l.diferencia)} />{" "}
                  {l.diferencia > 0 ? "de más" : "de menos: sigue en el saldo a cobrar"}
                </Marca>
              ) : (
                "Cuadra"
              )}
            </dd>
          </div>
        </dl>
      ) : (
        <section aria-labelledby="conciliar-titulo" className="mt-8 space-y-4 rounded-md border border-line px-4 py-4 print:hidden">
          <h2 id="conciliar-titulo" className="text-base font-semibold text-strong">
            Conciliar con el pago de la administración
          </h2>
          <ConciliarLiquidacion liquidacionId={l.id} total={String(l.total)} hoy={todayInBusinessTz()} />
          <DescartarLiquidacion liquidacionId={l.id} />
        </section>
      )}

      {conciliada && l.renglones.length === 0 && (
        <AvisoError className="mt-6" tono="aviso" titulo="Sin vouchers" comoSeguir="Esta liquidación no tiene vouchers." />
      )}

      <p className="mt-8 print:hidden">
        <Link href="/admin/vouchers#liquidacion" className="inline-flex min-h-11 items-center text-sm text-accent-ink hover:underline">
          ← Volver a Vouchers
        </Link>
      </p>
    </main>
  );
}
