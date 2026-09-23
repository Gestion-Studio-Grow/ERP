import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { exigirCasa } from "@/lib/multilocal/casa.server";
import { ventasDeLaRedAction } from "@/lib/multilocal/multilocal-actions";
import { elegirLocal, sumarVentas, type Ventas, type VentasDeUnLocal } from "@/lib/multilocal/multilocal-core";
import { CASH_METHODS, CASH_METHOD_LABEL, totalOf } from "@/lib/caja/libro-caja";
import {
  AvisoError,
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageContainer,
  PageHeader,
  Select,
  buttonClasses,
  fmtCuit,
  fmtMoneyARS,
  fmtNumberAR,
} from "@/components/ui";
import { LocalesSinLeer, NoEsCasa, NoSePudoLeer, SinLocales, SolapasLocales, dia } from "../partes";

export const dynamic = "force-dynamic";

// VENTAS POR LOCAL — comparar locales en un rango de fechas, por medio de cobro, y bajar el
// consolidado para la contadora.
//
// "Ventas" con el criterio del libro de caja de cada local: lo cobrado por ventas (mostrador y
// turnos) menos sus anulaciones, en el día en que quedaron asentadas. Es lo mismo que ve cada
// local en su libro, sumado.
//
// El `?local=` de la URL NO se usa para leer: la red se lee entera desde las filas de la casa y
// después se elige el local entre ESOS (`elegirLocal`). Un id ajeno, tecleado o manipulado, da
// error y no muestra nada de ese negocio.

function una(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function VentasPorLocalPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string | string[]; hasta?: string | string[]; local?: string | string[] }>;
}) {
  const user = await requireApp("ventas-por-local");
  const casa = await exigirCasa("multilocal:manage");
  const titulo = "Ventas por local";
  if (!casa.ok) {
    return (
      <PageContainer>
        <PageHeader title={titulo} />
        <NoEsCasa error={casa.error} noSeLeyo={casa.noSeLeyo} />
      </PageContainer>
    );
  }
  const sp = await searchParams;
  const r = await ventasDeLaRedAction({ desde: una(sp.desde), hasta: una(sp.hasta) });
  if (!r.ok) {
    return (
      <PageContainer>
        <PageHeader title={titulo} />
        <NoSePudoLeer error={r.error} />
      </PageContainer>
    );
  }

  // Un local de la red que no se pudo leer no es "un local ajeno": lo explica el aviso de arriba.
  const pedido = una(sp.local);
  const caido = r.sinLeer.some((l) => l.localTenantId === pedido);
  const eleccion = elegirLocal(
    r.locales.map((l) => l.local),
    caido ? null : pedido,
  );
  const elegido = eleccion.ok ? eleccion.local : null;
  const mostrados = elegido ? r.locales.filter((l) => l.local.localTenantId === elegido.localTenantId) : r.locales;
  const total = elegido ? sumarVentas(mostrados.map((l) => l.total)) : r.total;
  const qs = new URLSearchParams({ desde: r.rango.desde, hasta: r.rango.hasta });
  if (elegido) qs.set("local", elegido.localTenantId);

  return (
    <PageContainer>
      <PageHeader
        title={titulo}
        badge={<Badge tone="accent">{r.casa}</Badge>}
        description={`Del ${dia(r.rango.desde)} al ${dia(r.rango.hasta)}: lo cobrado por ventas en cada local, menos las anulaciones, según la caja de cada uno.`}
      />
      <SolapasLocales activa="ventas-por-local" role={user.role} />

      {!eleccion.ok && (
        <AvisoError
          className="mb-lg"
          titulo={eleccion.error}
          comoSeguir="No se muestra nada de ese negocio. Abajo están todos los locales de tu red."
        />
      )}
      {r.aviso && <AvisoError className="mb-lg" tono="aviso" titulo="No se usó el rango pedido" comoSeguir={r.aviso} />}
      <LocalesSinLeer sinLeer={r.sinLeer} ruta="/admin/locales/ventas" />

      {r.locales.length === 0 ? (
        r.sinLeer.length === 0 && <SinLocales />
      ) : (
        <>
          <form method="get" className="mb-lg grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
            <Field label="Desde" htmlFor="ventas-desde">
              <Input id="ventas-desde" type="date" name="desde" defaultValue={r.rango.desde} />
            </Field>
            <Field label="Hasta" htmlFor="ventas-hasta">
              <Input id="ventas-hasta" type="date" name="hasta" defaultValue={r.rango.hasta} />
            </Field>
            <Field label="Local" htmlFor="ventas-local">
              <Select id="ventas-local" name="local" defaultValue={elegido?.localTenantId ?? ""}>
                <option value="">Todos los locales</option>
                {r.locales.map((l) => (
                  <option key={l.local.localTenantId} value={l.local.localTenantId}>
                    {l.local.alias}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="outline">
              Ver
            </Button>
          </form>

          <div className="mb-lg flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Total{elegido ? ` de ${elegido.alias}` : " de la red"}:{" "}
              <span className="text-lg font-semibold tabular-nums text-strong">{fmtMoneyARS(total.neto)}</span>
              {" · "}
              {fmtNumberAR(total.cantidad)} {total.cantidad === 1 ? "cobro" : "cobros"}
            </p>
            <a href={`/admin/locales/ventas/export?${qs.toString()}`} className={buttonClasses("solid", "md")}>
              Descargar para la contadora
            </a>
          </div>

          <ul className="mb-lg grid grid-cols-1 gap-4 md:grid-cols-2" aria-label="Ventas de cada local">
            {mostrados.map((l) => (
              <li key={l.local.localTenantId}>
                <TarjetaVentas l={l} />
              </li>
            ))}
          </ul>

          {!elegido && r.porCuit.length > 0 && (
            <Card className="mb-lg">
              <h2 className="text-base font-semibold text-strong">Por CUIT</h2>
              <p className="mt-1 text-sm text-muted">
                Los locales que comparten CUIT, sumados: el IVA y los ingresos brutos se declaran por CUIT.
              </p>
              <ul className="mt-3 space-y-2">
                {r.porCuit.map((g) => (
                  <li key={g.cuit} className="rounded-lg border border-line px-3 py-2">
                    <p className="text-sm font-medium text-strong">
                      CUIT {fmtCuit(g.cuit)}: <span className="tabular-nums">{fmtMoneyARS(g.total.neto)}</span>
                    </p>
                    <p className="text-xs text-muted break-words">{g.locales.join(", ")}</p>
                    <PorMedio v={g.total} />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <DiaPorDia locales={mostrados} />
        </>
      )}
    </PageContainer>
  );
}

function PorMedio({ v }: { v: Ventas }) {
  const anulado = totalOf(v.anulado);
  return (
    <p className="mt-1 text-xs text-muted tabular-nums">
      {CASH_METHODS.map((k, i) => `${i > 0 ? " · " : ""}${CASH_METHOD_LABEL[k]} ${fmtMoneyARS(v.ventas[k])}`)}
      {anulado > 0 ? ` · anulado ${fmtMoneyARS(anulado)}` : ""}
    </p>
  );
}

function TarjetaVentas({ l }: { l: VentasDeUnLocal }) {
  return (
    <Card className="h-full">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-strong break-words">{l.local.alias}</h2>
          <p className="text-xs text-muted">
            {l.local.arcaCuit ? `CUIT ${fmtCuit(l.local.arcaCuit)}` : "Sin CUIT cargado"}
            {l.local.arcaPuntoVenta ? ` · punto de venta ${l.local.arcaPuntoVenta}` : ""}
          </p>
        </div>
        <p className="text-xl font-bold tabular-nums text-strong">{fmtMoneyARS(l.total.neto)}</p>
      </div>
      <PorMedio v={l.total} />
      <p className="mt-1 text-xs text-muted">
        {fmtNumberAR(l.total.cantidad)} {l.total.cantidad === 1 ? "cobro" : "cobros"} ·{" "}
        {l.porDia.length} {l.porDia.length === 1 ? "día con movimiento" : "días con movimiento"}
      </p>
    </Card>
  );
}

/** Día por día: una fila por día, con lo de cada local. Sin tabla ancha: se lee en el celular. */
function DiaPorDia({ locales }: { locales: readonly VentasDeUnLocal[] }) {
  const dias = [...new Set(locales.flatMap((l) => l.porDia.map((d) => d.dia)))].sort().reverse();
  if (dias.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">No hubo ventas en estas fechas. Probá con otro rango.</p>
      </Card>
    );
  }
  return (
    <Card>
      <h2 className="text-base font-semibold text-strong">Día por día</h2>
      <ul className="mt-3 divide-y divide-line">
        {dias.map((d) => {
          const delDia = locales.flatMap((l) => {
            const x = l.porDia.find((p) => p.dia === d);
            return x ? [{ alias: l.local.alias, v: x.ventas }] : [];
          });
          const totalDia = sumarVentas(delDia.map((x) => x.v));
          return (
            <li key={d} className="py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-strong">{dia(d)}</p>
                <p className="text-sm font-semibold tabular-nums text-strong">{fmtMoneyARS(totalDia.neto)}</p>
              </div>
              <p className="text-xs text-muted tabular-nums break-words">
                {delDia.map((x, i) => `${i > 0 ? " · " : ""}${x.alias} ${fmtMoneyARS(x.v.neto)}`)}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted">
        ¿Querés ver un local por dentro? Elegilo arriba, o <Link href="/admin/locales" className="underline underline-offset-4">volvé al tablero</Link>.
      </p>
    </Card>
  );
}
