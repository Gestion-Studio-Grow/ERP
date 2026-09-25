import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { todayInBusinessTz } from "@/lib/datetime";
import { agingOf, summarizeAging } from "@/lib/cuentas/aging";
import { leerCuentasACobrar, type CuentaACobrarConSaldo } from "@/lib/debts/cuentas-lectura";
import { DIAS_FIADO_VIEJO, resumirFiado } from "@/lib/debts/resumen-cuentas";
import { cuentasCorrientesEnabled } from "@/lib/settlement/asiento-libro";
import { appsQuePuedeAbrir } from "@/lib/reports/apps-a-mano.server";
import { AvisoError, EmptyState, PageHeader, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { DebtListTable, type DebtRowVM } from "@/components/cuentas/DebtListTable";
import { DebtSummaryCards } from "@/components/cuentas/DebtSummaryCards";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import { diaDe } from "@/lib/debts/resumen-cuentas";
import { LineaDeEstado, Marca, Plata, Renglon, atributosBoton } from "@/components/ui";
import { diaMes } from "../caja/_renglon/fechas";
import { agruparCuentas, type CuentaDeBandeja } from "./bandeja-cuentas";
import { BandejaDeCuentas } from "./CuentasRenglon";

export const dynamic = "force-dynamic";

// FIADO Y CUENTAS DE CLIENTES (ADR-060 D3): quién te debe, cuánto y desde cuándo.
//
// La guardia es la de la app (`requireApp`): rol, módulo `cuentas-a-cobrar` y edición. Antes
// pedía sólo billing:manage y se abría tecleando la URL en cualquier negocio.
//
// El alta del fiado NO es acá: se hace al vender («A cuenta» en Vender), para que la deuda y
// la venta nazcan juntas. Acá se ve y se cobra. Los números de arriba ("Te deben $X · $Y con
// más de 30 días") salen de `leerCuentasACobrar` + `resumirFiado`. El botón del Inicio todavía
// va sin número: el saldo cruza la cuenta y sus cobros (dos lecturas) y la regla de los números
// del Inicio pide una (ver apps/kpis/finanzas.server.ts). Cuando lo tenga, será esta lectura.

function aFila(c: CuentaACobrarConSaldo, ahora: Date): DebtRowVM {
  return {
    id: c.id,
    contraparte: c.cliente,
    total: c.amount,
    saldado: c.saldado,
    saldo: c.saldo,
    vencimiento: c.dueDate,
    referencia: c.concepto,
    aging: agingOf(c.dueDate, ahora),
  };
}

export default async function CuentasACobrarPage() {
  const user = await requireApp("cuentas-a-cobrar");
  const tenantId = await getCurrentTenantId();
  const [{ cuentas, faltanTablas }, abribles, nuevo] = await Promise.all([
    leerCuentasACobrar(prisma, tenantId),
    appsQuePuedeAbrir(user.role, ["vender", "flujo-de-fondos"]),
    disenoNuevo(),
  ]);
  const ahora = new Date();
  const hoy = todayInBusinessTz();
  const conSaldo = cuentas.filter((c) => c.saldo > 0);
  const saldadas = cuentas.filter((c) => !(c.saldo > 0));
  const fiado = resumirFiado(cuentas, hoy);
  const resumen = summarizeAging(conSaldo.map((c) => ({ saldo: c.saldo, vencimiento: c.dueDate })), ahora);

  // DISEÑO NUEVO («Renglón»): la bandeja por prioridad (vencido → esta semana → fiado viejo → al
  // día), con la plata más grande arriba y «Cobrar» en cada renglón. Mismos saldos, misma lectura.
  if (nuevo) {
    const grupos = agruparCuentas(
      cuentas.map(
        (c): CuentaDeBandeja => ({
          id: c.id,
          quien: c.cliente,
          concepto: c.concepto,
          total: c.amount,
          saldo: c.saldo,
          desde: diaDe(c.issueDate) ?? hoy,
          vence: diaDe(c.dueDate),
        }),
      ),
      hoy,
      "cobrar",
    );
    return (
      <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
        <header data-ui="page-header" className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-strong">Fiado y cuentas de clientes</h1>
            <LineaDeEstado
              datos={[
                fiado.cuentas > 0 ? (
                  <strong key="t">
                    Te deben <Plata valor={fiado.total} sinCentavos />
                  </strong>
                ) : (
                  <strong key="t">Nadie te debe nada</strong>
                ),
                fiado.cuentas > 0 ? `${fiado.cuentas} ${fiado.cuentas === 1 ? "cuenta" : "cuentas"}` : null,
                fiado.vencido > 0 ? (
                  <span key="v">
                    <Plata valor={fiado.vencido} sinCentavos tono="peligro" /> vencido
                  </span>
                ) : null,
                fiado.masDe30 > 0 ? (
                  <span key="m">
                    <Plata valor={fiado.masDe30} sinCentavos /> de hace más de {DIAS_FIADO_VIEJO} días
                  </span>
                ) : null,
              ]}
            />
          </div>
          {abribles.has("flujo-de-fondos") && (
            <Link href="/admin/flujo" className={buttonClasses("ghost", "md")} {...atributosBoton("ghost", "md")}>
              Ver el flujo de fondos
            </Link>
          )}
        </header>
        {faltanTablas && (
          <AvisoError
            className="mb-6"
            titulo="Las cuentas de clientes todavía no están listas en tu negocio"
            comoSeguir="Falta preparar la base para el fiado. Escribinos a Gestión Studio Grow y lo dejamos listo."
          />
        )}
        {grupos.length > 0 ? (
          <BandejaDeCuentas grupos={grupos} hoy={hoy} tipo="cobrar" base="/admin/cuentas-a-cobrar" />
        ) : (
          <p className="flex max-w-3xl flex-wrap items-center gap-3 border-y border-line py-4 text-sm text-body">
            {saldadas.length > 0 ? "Nadie te debe nada." : "Todavía no fiaste a nadie."}{" "}
            {abribles.has("vender")
              ? "Para dejar una venta a cuenta, en Vender elegí el cliente y «A cuenta»: la deuda aparece acá."
              : "El fiado se anota al vender, eligiendo «A cuenta»."}
            {abribles.has("vender") && (
              <Link href="/admin/vender" className={buttonClasses("outline", "sm")} {...atributosBoton("outline", "sm")}>
                Ir a Vender
              </Link>
            )}
          </p>
        )}
        {saldadas.length > 0 && (
          <details className="group mt-8 max-w-5xl">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between border-b border-line text-sm font-semibold text-strong">
              Cuentas saldadas ({saldadas.length})
              <span aria-hidden className="text-muted group-open:rotate-90">
                ›
              </span>
            </summary>
            {saldadas.map((c) => (
              <Renglon
                key={c.id}
                className="relative"
                folio={diaMes(diaDe(c.issueDate) ?? hoy)}
                titulo={
                  <Link href={`/admin/cuentas-a-cobrar/${c.id}`} className="after:absolute after:inset-0 hover:underline">
                    {c.cliente}
                  </Link>
                }
                detalle={c.concepto ?? undefined}
                plata={<Marca tipo="hecho">Saldada</Marca>}
              />
            ))}
          </details>
        )}
        {!cuentasCorrientesEnabled() && conSaldo.length > 0 && (
          <p className="mt-6 max-w-3xl text-sm text-muted">
            Los cobros quedan en cada cuenta, pero todavía no pasan solos al libro de caja: si te pagan en efectivo, anotalo también en
            el libro.
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Fiado y cuentas de clientes"
        description="Quién te debe, cuánto y desde cuándo. Entrá a una cuenta para registrar lo que te pagan."
        actions={
          abribles.has("flujo-de-fondos") ? (
            <Link href="/admin/flujo" className={buttonClasses("outline", "md", "whitespace-nowrap")}>
              Ver el flujo de fondos
            </Link>
          ) : undefined
        }
      />

      {faltanTablas && (
        <AvisoError
          className="mb-6"
          titulo="Las cuentas de clientes todavía no están listas en tu negocio"
          comoSeguir="Falta preparar la base para el fiado. Escribinos a Gestión Studio Grow y lo dejamos listo."
        />
      )}

      <DebtSummaryCards resumen={resumen} totalLabel="Te deben" />
      {fiado.masDe30 > 0 && (
        <p className="-mt-3 mb-6 text-sm text-body">
          De eso, <span className="font-semibold tabular-nums text-strong">{fmtMoneyARS(fiado.masDe30)}</span> es fiado de hace
          más de {DIAS_FIADO_VIEJO} días ({fiado.cuentasMasDe30} {fiado.cuentasMasDe30 === 1 ? "cuenta" : "cuentas"}).
        </p>
      )}

      {conSaldo.length === 0 ? (
        <EmptyState
          title={saldadas.length > 0 ? "Nadie te debe nada" : "Todavía no fiaste a nadie"}
          description={
            abribles.has("vender")
              ? "Para dejar una venta a cuenta, en Vender elegí el cliente y «A cuenta». La deuda aparece acá con su saldo, y desde acá registrás lo que te va pagando."
              : "El fiado se anota al vender, eligiendo «A cuenta». Tu usuario no tiene Vender: pedíselo a la dueña o al dueño del negocio."
          }
          action={
            abribles.has("vender") ? (
              <Link href="/admin/vender" className={buttonClasses("solid", "md")}>
                Ir a Vender
              </Link>
            ) : undefined
          }
        />
      ) : (
        <DebtListTable
          rows={conSaldo.map((c) => aFila(c, ahora))}
          contraparteLabel="Cliente"
          detailBase="/admin/cuentas-a-cobrar"
          caption="Cuentas de clientes con saldo"
        />
      )}

      {saldadas.length > 0 && (
        <details className="mt-6 rounded-lg border border-line">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium text-strong">
            Cuentas saldadas ({saldadas.length})
          </summary>
          <div className="p-2">
            <DebtListTable
              rows={saldadas.map((c) => aFila(c, ahora))}
              contraparteLabel="Cliente"
              detailBase="/admin/cuentas-a-cobrar"
              caption="Cuentas de clientes saldadas"
            />
          </div>
        </details>
      )}

      {!cuentasCorrientesEnabled() && conSaldo.length > 0 && (
        <p className="mt-6 text-sm text-muted">
          Los cobros quedan en cada cuenta, pero todavía no pasan solos al libro de caja: si te pagan en efectivo,
          anotalo también en el libro.
        </p>
      )}
    </main>
  );
}
