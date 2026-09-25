// FLUJO DE FONDOS — la plata de hoy, lo que va a entrar y lo que va a salir, semana por semana.
//
// "¿Me alcanza para el cheque del 15?". Arranca con el saldo del libro de caja, suma el fiado
// que vence en el período y resta lo que hay que pagar a proveedores y los cheques por su
// fecha. La cuenta vive en src/lib/reports/flujo.ts (pura, probada contra una suma a mano) y
// la lectura en flujo-lectura.ts. El botón del Inicio muestra la primera tarjeta ("Plata hoy"),
// con la misma consulta. Del lado prudente: lo que no se sabe cuándo entra (fiado vencido o
// sin fecha) no se cuenta, pero se muestra; cada cheque sale entero, que es lo que debita el banco.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { todayInBusinessTz } from "@/lib/datetime";
import { diaLegible } from "@/lib/libros/fecha-fiscal";
import { HORIZONTES, leerHorizonte, type MovimientoDeFlujo } from "@/lib/reports/flujo";
import { leerFlujo } from "@/lib/reports/flujo-lectura";
import { appsQuePuedeAbrir } from "@/lib/reports/apps-a-mano.server";
import { AvisoError, PageHeader, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { DosColumnas, Franja, LineaDeEstado, Marca, Plata, Renglon, chipLinkAtributos } from "@/components/ui";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { LineaDeCuenta } from "@/components/ui/LineaDeCuenta";

export const dynamic = "force-dynamic";

const RUTA = "/admin/flujo";
const money = (n: number) => fmtMoneyARS(n, 0);
const corto = (dia: string) => diaLegible(dia).slice(0, 5);

const QUE: Record<MovimientoDeFlujo["tipo"], string> = {
  cobro: "Cobro de fiado",
  pago: "Pago a proveedor",
  cheque: "Cheque a debitar",
};

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

export default async function FlujoPage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const user = await requireApp("flujo-de-fondos");
  const { h } = await searchParams;
  const horizonte = leerHorizonte(h);
  const tenantId = await getCurrentTenantId();
  const hoy = todayInBusinessTz();
  const [{ flujo: f, sinCuentasCorrientes }, abribles] = await Promise.all([
    leerFlujo(prisma, tenantId, hoy, horizonte),
    appsQuePuedeAbrir(user.role, ["cuentas-a-cobrar", "cuentas-a-pagar", "libro-de-caja"]),
  ]);
  const ajustada = f.semanaMasAjustada;
  const ajustada_ = (numero: number) => ajustada?.numero === numero && f.semanas.length > 1;
  const rojo = f.primeraEnRojo;
  const fuera = [
    { texto: "Fiado vencido", n: f.fuera.fiadoVencidoCuentas, monto: f.fuera.fiadoVencido, porque: "ya pasó la fecha y no se sabe cuándo entra", href: "/admin/cuentas-a-cobrar", app: "cuentas-a-cobrar" },
    { texto: "Fiado sin fecha", n: f.fuera.fiadoSinFechaCuentas, monto: f.fuera.fiadoSinFecha, porque: "no tiene vencimiento", href: "/admin/cuentas-a-cobrar", app: "cuentas-a-cobrar" },
    { texto: "Deudas sin vencimiento", n: f.fuera.deudasSinFechaCuentas, monto: f.fuera.deudasSinFecha, porque: "no tienen fecha de pago ni cheque", href: "/admin/cuentas-a-pagar", app: "cuentas-a-pagar" },
    { texto: "A cobrar más adelante", n: null, monto: f.fuera.cobrosMasAdelante, porque: `vence después del ${diaLegible(f.hasta)}`, href: "/admin/cuentas-a-cobrar", app: "cuentas-a-cobrar" },
    { texto: "A pagar más adelante", n: null, monto: f.fuera.pagosMasAdelante, porque: `vence después del ${diaLegible(f.hasta)}`, href: "/admin/cuentas-a-pagar", app: "cuentas-a-pagar" },
  ].filter((x) => x.monto > 0);

  // DISEÑO NUEVO («Renglón»): la plata semana por semana como un libro. Cada semana es un renglón con
  // lo que entra, lo que sale y cómo queda, y una barra dentro del renglón con ese saldo (proporción
  // del saldo más grande del período; en rojo si queda debajo de cero). La semana más ajustada, con
  // su marca. Adentro, los movimientos. Mismos números (`leerFlujo`).
  if (await disenoNuevo()) {
    const tope = Math.max(1, ...f.semanas.map((s) => Math.abs(s.saldoAlCierre)), Math.abs(f.saldoInicial));
    return (
      <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
        <header data-ui="page-header" className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-strong">Flujo de fondos</h1>
            <LineaDeEstado
              datos={[
                <span key="h">
                  <strong>Plata hoy</strong> <Plata valor={f.saldoInicial} sinCentavos />
                </span>,
                <span key="e">
                  entra <Plata valor={f.totalEntra} sinCentavos />
                </span>,
                <span key="s">
                  sale <Plata valor={f.totalSale} sinCentavos />
                </span>,
                <span key="f">
                  al {corto(f.hasta)} <Plata valor={f.saldoFinal} sinCentavos tono={f.saldoFinal < 0 ? "peligro" : undefined} />
                </span>,
              ]}
            />
          </div>
          <nav aria-label="Hasta cuándo" className="flex flex-wrap gap-1.5">
            {HORIZONTES.map((d) => (
              <Link key={d} href={`${RUTA}?h=${d}`} {...chipLinkAtributos(d === horizonte)}>
                {d} días
              </Link>
            ))}
          </nav>
        </header>
        {sinCuentasCorrientes && (
          <Franja className="mb-4">Por ahora el flujo muestra sólo el saldo del libro de caja: el fiado y las cuentas a pagar todavía no están listos en tu negocio.</Franja>
        )}
        {rojo && (
          <Franja tono="peligro" className="mb-4">
            La semana del {corto(rojo.desde)} al {corto(rojo.hasta)} quedás en {money(rojo.saldoAlCierre)}. Antes de esa fecha: cobrá un fiado, conseguí la
            plata o hablá con el proveedor para mover un pago o un cheque.{" "}
            {abribles.has("cuentas-a-pagar") && <Link href="/admin/cuentas-a-pagar">Ver cuentas a pagar</Link>}
          </Franja>
        )}
        <DosColumnas>
          <section aria-labelledby="semanas" className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 border-b border-line-strong pb-2">
              <h2 id="semanas" className="text-[15px] font-semibold text-strong">
                Semana por semana
              </h2>
              <span className="text-[13px] text-muted">lo vencido se cuenta hoy</span>
            </div>
            <LineaDeCuenta concepto="Plata hoy" detalle="El saldo del libro de caja, todos los medios" importe={<Plata valor={f.saldoInicial} sinCentavos />} />
            {f.semanas.map((s) => {
              const ajustada = ajustada_(s.numero);
              const enRojo = s.saldoAlCierre < 0;
              return (
                <details key={s.numero} className="group border-b border-line">
                  <summary className="grid min-h-12 cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-2.5">
                    <span className="min-w-0">
                      <span className="font-medium text-strong">
                        {corto(s.desde)} al {corto(s.hasta)}
                      </span>
                      {ajustada && (
                        <Marca tipo="atencion" className="ml-2">
                          la más ajustada
                        </Marca>
                      )}
                      <span className="block text-[13px] text-muted">
                        entra {money(s.entra)} · sale {money(s.sale)}
                      </span>
                    </span>
                    <span className="text-right font-semibold">
                      <Plata valor={s.saldoAlCierre} sinCentavos tono={enRojo ? "peligro" : undefined} />
                    </span>
                    {/* La barra: el saldo al cierre de la semana, en proporción al más grande del período. */}
                    <span aria-hidden className="col-span-2 block h-1.5 bg-surface-sunken">
                      <span
                        className={`block h-full ${enRojo ? "bg-danger" : "bg-accent"}`}
                        style={{ width: `${Math.max(2, Math.round((Math.abs(s.saldoAlCierre) / tope) * 100))}%` }}
                      />
                    </span>
                  </summary>
                  {s.movimientos.length === 0 ? (
                    <p className="pb-3 text-sm text-muted">No entra ni sale nada esta semana.</p>
                  ) : (
                    <div className="pb-2">
                      {s.movimientos.map((m, i) => (
                        <Renglon
                          key={`${m.cuentaId}-${m.tipo}-${i}`}
                          folio={corto(m.dia)}
                          titulo={<span className="font-normal">{m.quien}</span>}
                          detalle={`${QUE[m.tipo]}${m.vencidoDesde ? ` · vencido desde el ${corto(m.vencidoDesde)}, se cuenta hoy` : ""}`}
                          plata={<Plata valor={m.tipo === "cobro" ? m.monto : -m.monto} sinCentavos />}
                        />
                      ))}
                    </div>
                  )}
                </details>
              );
            })}
            <LineaDeCuenta total concepto={`Plata al ${corto(f.hasta)}`} importe={<Plata valor={f.saldoFinal} sinCentavos tono={f.saldoFinal < 0 ? "peligro" : undefined} />} />
          </section>
          {fuera.length > 0 && (
            <aside aria-labelledby="fuera" className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 border-b border-line-strong pb-2">
                <h2 id="fuera" className="text-[15px] font-semibold text-strong">
                  Lo que no entra en la cuenta
                </h2>
                <span className="text-[13px] text-muted">no se sabe cuándo se mueve</span>
              </div>
              {fuera.map((x) => (
                <LineaDeCuenta
                  key={x.texto}
                  concepto={
                    abribles.has(x.app) ? (
                      <Link href={x.href} className="hover:underline">
                        {x.texto}
                        {x.n !== null ? ` (${x.n})` : ""}
                      </Link>
                    ) : (
                      `${x.texto}${x.n !== null ? ` (${x.n})` : ""}`
                    )
                  }
                  detalle={x.porque}
                  importe={<Plata valor={x.monto} sinCentavos />}
                />
              ))}
            </aside>
          )}
        </DosColumnas>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Flujo de fondos"
        description="La plata de hoy según el libro de caja, más el fiado que vence y menos lo que hay que pagar a proveedores y los cheques, semana por semana."
      />

      <nav aria-label="Hasta cuándo" className="mb-6 flex flex-wrap items-center gap-2">
        {HORIZONTES.map((d) => (
          <Link
            key={d}
            href={`${RUTA}?h=${d}`}
            aria-current={d === horizonte ? "page" : undefined}
            className={`inline-flex h-11 items-center rounded-md border px-4 text-sm transition-colors ${
              d === horizonte ? "border-line-strong bg-surface-raised font-medium text-strong" : "border-line text-muted hover:border-line-strong"
            }`}
          >
            {d} días
          </Link>
        ))}
      </nav>

      {sinCuentasCorrientes && (
        <AvisoError
          tono="aviso"
          className="mb-6"
          titulo="Las cuentas corrientes todavía no están listas en tu negocio"
          comoSeguir="Por ahora el flujo muestra sólo el saldo del libro de caja. Escribinos a Gestión Studio Grow para preparar el fiado y las cuentas a pagar."
        />
      )}

      {rojo && (
        <AvisoError
          className="mb-6"
          titulo={`La semana del ${corto(rojo.desde)} al ${corto(rojo.hasta)} quedás en ${money(rojo.saldoAlCierre)}`}
          comoSeguir="Antes de esa fecha: cobrá un fiado, conseguí la plata o hablá con el proveedor para mover un pago o un cheque."
          accion={
            abribles.has("cuentas-a-pagar") ? (
              <Link href="/admin/cuentas-a-pagar" className={buttonClasses("outline", "md")}>
                Ver cuentas a pagar
              </Link>
            ) : undefined
          }
        />
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tarjeta label="Plata hoy" value={money(f.saldoInicial)} hint="Saldo del libro de caja, todos los medios" />
        <Tarjeta label="Entra" value={money(f.totalEntra)} hint="Fiado que vence en el período" />
        <Tarjeta label="Sale" value={money(f.totalSale)} hint="Proveedores y cheques, con lo vencido hoy" />
        <Tarjeta
          label={`Plata al ${corto(f.hasta)}`}
          value={money(f.saldoFinal)}
          hint={ajustada ? `Semana más ajustada: ${money(ajustada.saldoAlCierre)}` : undefined}
          tono={f.saldoFinal < 0 ? "danger" : undefined}
        />
      </div>

      <section aria-labelledby="semanas-titulo" className="mb-8">
        <h2 id="semanas-titulo" className="mb-3 text-base font-semibold text-strong">
          Semana por semana
        </h2>
        <ol className="space-y-2">
          {f.semanas.map((s) => {
            const esLaMasAjustada = ajustada?.numero === s.numero && f.semanas.length > 1;
            const enRojo = s.saldoAlCierre < 0;
            return (
              <li
                key={s.numero}
                className={`rounded-lg border ${enRojo ? "border-danger/30 bg-danger-soft/40" : esLaMasAjustada ? "border-warning/30 bg-warning-soft/40" : "border-line"}`}
              >
                <details>
                  <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
                    <span className="text-sm">
                      <span className="font-medium text-strong">
                        {corto(s.desde)} al {corto(s.hasta)}
                      </span>
                      {esLaMasAjustada && <span className="ml-2 text-xs text-warning">la más ajustada</span>}
                      <span className="block text-xs text-muted">
                        entra {money(s.entra)} · sale {money(s.sale)}
                      </span>
                    </span>
                    <span className={`tabular-nums font-semibold ${enRojo ? "text-danger" : "text-strong"}`}>{money(s.saldoAlCierre)}</span>
                  </summary>
                  {s.movimientos.length === 0 ? (
                    <p className="border-t border-line px-4 py-3 text-sm text-muted">No entra ni sale nada esta semana.</p>
                  ) : (
                    <ul className="divide-y divide-line border-t border-line">
                      {s.movimientos.map((m, i) => (
                        <li key={`${m.cuentaId}-${m.tipo}-${i}`} className="flex items-baseline justify-between gap-3 px-4 py-2 text-sm">
                          <span className="min-w-0">
                            <span className="text-strong">{QUE[m.tipo]}</span> · {m.quien}
                            <span className="block text-xs text-muted">
                              {corto(m.dia)}
                              {m.vencidoDesde ? ` · vencido desde el ${corto(m.vencidoDesde)}, se cuenta hoy` : ""}
                            </span>
                          </span>
                          <span className={`whitespace-nowrap tabular-nums ${m.tipo === "cobro" ? "text-success" : "text-body"}`}>
                            {m.tipo === "cobro" ? "+" : "−"}
                            {money(m.monto)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              </li>
            );
          })}
        </ol>
      </section>

      {fuera.length > 0 && (
        <section aria-labelledby="fuera-titulo">
          <h2 id="fuera-titulo" className="mb-1 text-base font-semibold text-strong">
            Lo que no entra en la cuenta
          </h2>
          <p className="mb-3 text-sm text-muted">Es plata tuya o que debés, pero no se sabe cuándo se mueve (o se mueve después).</p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {fuera.map((x) => (
              <li key={x.texto}>
                {abribles.has(x.app) ? (
                  <Link href={x.href} className="flex min-h-11 items-baseline justify-between gap-3 px-4 py-3 text-sm hover:bg-surface-sunken">
                    <span className="min-w-0">
                      <span className="text-strong">{x.texto}</span>
                      {x.n !== null && ` (${x.n})`}
                      <span className="block text-xs text-muted">{x.porque}</span>
                    </span>
                    <span className="whitespace-nowrap tabular-nums text-body">{money(x.monto)}</span>
                  </Link>
                ) : (
                  <div className="flex items-baseline justify-between gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="text-strong">{x.texto}</span>
                      {x.n !== null && ` (${x.n})`}
                      <span className="block text-xs text-muted">{x.porque}</span>
                    </span>
                    <span className="whitespace-nowrap tabular-nums text-body">{money(x.monto)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
