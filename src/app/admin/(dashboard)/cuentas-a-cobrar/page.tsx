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
  const [{ cuentas, faltanTablas }, abribles] = await Promise.all([
    leerCuentasACobrar(prisma, tenantId),
    appsQuePuedeAbrir(user.role, ["vender", "flujo-de-fondos"]),
  ]);
  const ahora = new Date();
  const hoy = todayInBusinessTz();
  const conSaldo = cuentas.filter((c) => c.saldo > 0);
  const saldadas = cuentas.filter((c) => !(c.saldo > 0));
  const fiado = resumirFiado(cuentas, hoy);
  const resumen = summarizeAging(conSaldo.map((c) => ({ saldo: c.saldo, vencimiento: c.dueDate })), ahora);

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
