import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { exigirCasa } from "@/lib/multilocal/casa.server";
import { redDeLaCasaAction } from "@/lib/multilocal/multilocal-actions";
import {
  cambioRelativo,
  contarStock,
  direccionDelLocal,
  type LocalConPasada,
  type ResumenRed,
} from "@/lib/multilocal/multilocal-core";
import { CASH_METHODS, CASH_METHOD_LABEL, totalOf } from "@/lib/caja/libro-caja";
import { Badge, Card, KpiTile, PageContainer, PageHeader, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { appPorId } from "@/apps/registro";
import { appPermitida } from "@/apps/visibles";
import { getNegocioApps } from "@/apps/contexto.server";
import { AbrirLocal, LocalesSinLeer, NoEsCasa, NoSePudoLeer, SinLocales, SolapasLocales, dia, ruteoDeLocales } from "./partes";

export const dynamic = "force-dynamic";

// MIS LOCALES — cómo viene hoy cada local de la red, sin entrar a cada backoffice.
//
// Cada número sale de la caja y el stock de ESE local, leídos en el momento con su propia
// transacción (multilocal-actions.ts). "La caja" de cada tarjeta es exactamente lo que el local
// ve arriba de su pantalla de Caja ("Lo que hay ahora"): el mismo período (desde el último
// cierre), la misma cuenta (`buildCierreDiario`) y los mismos medios. Si la dueña abre la Caja
// del local, tiene que ver los mismos números; si no, uno de los dos miente.
//
// GUARDIA: `requireApp` (rol, y el módulo `multilocal` aun con el gate apagado) y además
// `exigirCasa`, que relee el módulo de la base. La action lo repite: la action es un endpoint.

export default async function MisLocalesPage() {
  const user = await requireApp("mis-locales");
  const casa = await exigirCasa("multilocal:manage");
  if (!casa.ok) {
    return (
      <PageContainer>
        <PageHeader title="Mis locales" />
        <NoEsCasa error={casa.error} noSeLeyo={casa.noSeLeyo} />
      </PageContainer>
    );
  }

  const r = await redDeLaCasaAction();
  const titulo = "Mis locales";
  if (!r.ok) {
    return (
      <PageContainer>
        <PageHeader title={titulo} />
        <NoSePudoLeer error={r.error} />
      </PageContainer>
    );
  }

  const ruteo = ruteoDeLocales();
  // Stock por local es de mostrador: en una red de servicios el número se muestra sin link.
  const veStock = appPermitida(appPorId("stock-por-local"), await getNegocioApps(user.role));
  return (
    <PageContainer>
      <PageHeader
        title={titulo}
        badge={<Badge tone="accent">{r.casa}</Badge>}
        description={`Cómo viene hoy, ${dia(r.hoy)}, cada local de tu red. Cada número sale de la caja y el stock de ese local, en este momento.`}
      />
      <SolapasLocales activa="mis-locales" role={user.role} />
      <LocalesSinLeer sinLeer={r.sinLeer} ruta="/admin/locales" />
      {r.red.length === 0 ? (
        r.sinLeer.length === 0 && <SinLocales />
      ) : (
        <>
          <Resumen resumen={r.resumen} red={r.red} veStock={veStock} />
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Locales de la red">
            {r.red.map((x) => (
              <li key={x.local.localTenantId}>
                <TarjetaLocal
                  x={x}
                  hoy={r.hoy}
                  url={direccionDelLocal(x.local.subdomain, ruteo, "/admin/caja")}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </PageContainer>
  );
}

function Resumen({ resumen, red, veStock }: { resumen: ResumenRed; red: readonly LocalConPasada[]; veStock: boolean }) {
  const { semana } = resumen;
  const cambio = cambioRelativo(semana.actual, semana.anterior);
  const stock = contarStock(red.map((x) => x.dato.stock));
  const tileStock = (
    <KpiTile
      label="Stock bajo el mínimo"
      value={fmtNumberAR(stock.stockBajo.productos)}
      sub={
        stock.stockBajo.productos > 0
          ? `en ${fmtNumberAR(stock.stockBajo.locales)} ${stock.stockBajo.locales === 1 ? "local" : "locales"}`
          : "nada por reponer"
      }
    />
  );
  return (
    <section aria-label="La red hoy" className="mb-lg grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
      <KpiTile
        label="Cobrado hoy"
        value={fmtMoneyARS(resumen.cobradoHoy)}
        sub={`en ${fmtNumberAR(resumen.locales)} ${resumen.locales === 1 ? "local" : "locales"}, menos lo anulado hoy`}
      />
      <Link href="/admin/locales/cajas" className="block rounded-xl focus-visible:outline-2 focus-visible:outline-focus">
        <KpiTile
          label="Cajas sin cerrar"
          value={fmtNumberAR(resumen.cajasSinCerrar)}
          sub={
            resumen.pendienteMasViejo
              ? `la más vieja, desde el ${dia(resumen.pendienteMasViejo)}`
              : "todas cerradas hasta ayer"
          }
        />
      </Link>
      {veStock ? (
        <Link href="/admin/locales/stock" className="block rounded-xl focus-visible:outline-2 focus-visible:outline-focus">
          {tileStock}
        </Link>
      ) : (
        tileStock
      )}
      <Link href="/admin/locales/ventas" className="block rounded-xl focus-visible:outline-2 focus-visible:outline-focus">
        <KpiTile
          label="Esta semana"
          value={fmtMoneyARS(semana.actual, 0)}
          sub={
            cambio === null
              ? "la semana pasada no hubo ventas para comparar"
              : `${cambio >= 0 ? "+" : "−"}${fmtNumberAR(Math.round(Math.abs(cambio) * 100))} % frente a la anterior, hasta el mismo día`
          }
        />
      </Link>
    </section>
  );
}

/** Al día = no quedó ningún día ANTERIOR a hoy con plata sin cerrar (hoy se cierra a la noche). */
function EstadoCaja({ x }: { x: LocalConPasada }) {
  const c = x.dato.caja;
  if (c.estado === "cerrada-hoy") return <Badge tone="neutral" dot>Cerró hoy</Badge>;
  if (c.pendienteDesde) return <Badge tone="warning" dot>Sin cerrar desde el {dia(c.pendienteDesde)}</Badge>;
  return <Badge tone="success" dot>Caja al día</Badge>;
}

function TarjetaLocal({ x, hoy, url }: { x: LocalConPasada; hoy: string; url: string | null }) {
  const { local, dato } = x;
  const bajos = contarStock([dato.stock]);
  const anulado = totalOf(dato.hoy.anulado);
  const caja = dato.caja;
  const periodo =
    caja.estado !== "abierta"
      ? null
      : !caja.desde
        ? "Desde el origen: todavía no hubo ningún cierre"
        : caja.desde === hoy
          ? `Del día ${dia(hoy)}`
          : `Desde el ${dia(caja.desde)}${caja.cerradoHasta ? ` · último cierre: ${dia(caja.cerradoHasta)}` : ""}`;

  return (
    <Card className="h-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-strong break-words">{local.alias}</h2>
          <p className="text-xs text-muted break-words">
            {local.nombre}
            {local.arcaPuntoVenta ? ` · punto de venta ${local.arcaPuntoVenta}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <EstadoCaja x={x} />
          {!local.arcaPuntoVenta && <Badge tone="warning">Sin punto de venta</Badge>}
        </div>
      </div>

      <div>
        <p className="text-xs text-muted">Cobrado hoy</p>
        <p className="text-2xl font-bold tabular-nums text-strong">{fmtMoneyARS(dato.hoy.neto)}</p>
        <p className="text-xs text-muted tabular-nums">
          {fmtNumberAR(dato.hoy.cantidad)} {dato.hoy.cantidad === 1 ? "cobro" : "cobros"}
          {CASH_METHODS.filter((k) => dato.hoy.ventas[k] > 0).map((k) => ` · ${CASH_METHOD_LABEL[k]} ${fmtMoneyARS(dato.hoy.ventas[k])}`)}
          {anulado > 0 ? ` · anulado ${fmtMoneyARS(anulado)}` : ""}
        </p>
      </div>

      <div className="border-t border-line pt-3">
        <p className="text-sm font-medium text-strong">Su caja, como la ve el local</p>
        {caja.estado === "cerrada-hoy" ? (
          <p className="mt-1 text-sm text-muted">El día de hoy ya se cerró: el arqueo quedó guardado en su Caja.</p>
        ) : (
          <>
            <p className="text-xs text-muted">{periodo}</p>
            {/* En el celular, una fila por medio con el monto a la derecha (5 locales se leen de
                corrido); en la PC, las tres cajitas de siempre. */}
            <dl className="mt-2 divide-y divide-line rounded-lg border border-line sm:grid sm:grid-cols-3 sm:gap-2 sm:divide-y-0 sm:rounded-none sm:border-0">
              {CASH_METHODS.map((k) => (
                <div
                  key={k}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 sm:block sm:rounded-lg sm:border sm:border-line"
                >
                  <dt className="text-xs text-muted">{CASH_METHOD_LABEL[k]}</dt>
                  <dd className="text-base font-semibold tabular-nums text-strong">{fmtMoneyARS(caja.porMedio[k].hay)}</dd>
                  <dd className="basis-full text-right text-xs tabular-nums text-muted sm:text-left">
                    <span className="text-success">+ {fmtMoneyARS(caja.porMedio[k].ingresos)}</span>
                    {" · "}
                    <span className="text-danger">− {fmtMoneyARS(caja.porMedio[k].egresos)}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-sm text-muted">
              Total <span className="font-medium tabular-nums text-strong">{fmtMoneyARS(caja.total)}</span>
            </p>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <p className="text-sm text-muted">
          {bajos.stockBajo.productos > 0
            ? `${fmtNumberAR(bajos.stockBajo.productos)} bajo el mínimo`
            : "Nada bajo el mínimo"}
          {bajos.stockNegativo.productos > 0 ? ` · ${fmtNumberAR(bajos.stockNegativo.productos)} en negativo` : ""}
        </p>
        <AbrirLocal url={url} etiqueta="Abrir su caja" />
      </div>
    </Card>
  );
}
