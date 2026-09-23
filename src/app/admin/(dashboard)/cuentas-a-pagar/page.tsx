import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { todayInBusinessTz } from "@/lib/datetime";
import { agingOf } from "@/lib/cuentas/aging";
import { leerCuentasAPagar } from "@/lib/debts/cuentas-lectura";
import { DIAS_PROXIMOS_A_PAGAR, diaDe, resumirAPagar, salidasDeCuenta } from "@/lib/debts/resumen-cuentas";
import { ETIQUETA_CHEQUE } from "@/lib/debts/cheque";
import { diaLegible } from "@/lib/libros/fecha-fiscal";
import { cuentasCorrientesEnabled } from "@/lib/settlement/asiento-libro";
import { appsQuePuedeAbrir } from "@/lib/reports/apps-a-mano.server";
import { AvisoError, EmptyState, PageHeader, buttonClasses, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { DebtListTable, type DebtRowVM } from "@/components/cuentas/DebtListTable";

export const dynamic = "force-dynamic";

// CUENTAS A PAGAR (ADR-060 D2): lo que se le debe a cada proveedor, cuándo vence y los
// cheques propios que todavía no se debitaron.
//
// La guardia es la de la app (`requireApp`): rol, módulo `cuentas-a-pagar` y edición. Antes la
// página decía "Disponible en la edición Empresa" con el motor de perfiles apagado, o sea
// siempre; en los negocios del piloto manda el módulo asignado.
//
// El alta de la deuda NO es acá: nace al recibir mercadería a cuenta corriente (Recibir
// mercadería), junto con la compra. Acá se paga y se manejan los cheques. Los números de
// arriba ("Vence en 7 días: $X · N cheques a debitar") salen de `leerCuentasAPagar` +
// `resumirAPagar`. El botón del Inicio todavía va sin número, por lo mismo que el fiado (ver
// apps/kpis/finanzas.server.ts); cuando lo tenga, será esta lectura.

function Tarjeta({ label, value, hint, tono }: { label: string; value: string; hint?: string; tono?: "danger" | "warning" }) {
  const borde = tono === "danger" ? "border-danger/25 bg-danger-soft/40" : tono === "warning" ? "border-warning/25 bg-warning-soft/40" : "border-line";
  const texto = tono === "danger" ? "text-danger" : tono === "warning" ? "text-warning" : "text-strong";
  // `min-w-0` y el corte de palabra: en un celular de 412 px dos tarjetas por fila dejan ~150 px
  // de texto, y un monto de siete cifras con centavos no entra en una línea de text-2xl.
  return (
    <div className={`min-w-0 rounded-lg border p-4 ${borde}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-xl font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-2xl ${texto}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default async function CuentasAPagarPage() {
  const user = await requireApp("cuentas-a-pagar");
  const tenantId = await getCurrentTenantId();
  const [{ cuentas, faltanTablas }, abribles] = await Promise.all([
    leerCuentasAPagar(prisma, tenantId),
    appsQuePuedeAbrir(user.role, ["recibir-mercaderia", "flujo-de-fondos"]),
  ]);
  const ahora = new Date();
  const hoy = todayInBusinessTz();
  const r = resumirAPagar(cuentas, hoy);
  const conSaldo = cuentas.filter((c) => c.saldo > 0);
  const saldadas = cuentas.length - conSaldo.length;
  const filas: DebtRowVM[] = conSaldo.map((c) => ({
    id: c.id,
    contraparte: c.proveedor,
    total: c.amount,
    saldado: c.saldado,
    saldo: c.saldo,
    vencimiento: c.dueDate,
    referencia: c.concepto,
    aging: agingOf(c.dueDate, ahora),
  }));
  // Los cheques sin debitar, por fecha: es la agenda del banco. Salen de la misma cuenta que
  // el resumen (`salidasDeCuenta`), por su monto entero (lo que el banco va a debitar), y de
  // todas las cuentas: un cheque sin debitar de una deuda ya saldada también sale del banco.
  const cheques = cuentas
    .flatMap((c) =>
      salidasDeCuenta(c)
        .filter((s) => s.tipo === "cheque")
        .map((s) => {
          const ch = c.cheques.find((x) => x.id === s.chequeId)!;
          return { cuentaId: c.id, proveedor: c.proveedor, monto: s.monto, dia: s.dia ?? diaDe(ch.dueDate) ?? hoy, ch };
        }),
    )
    .sort((a, b) => a.dia.localeCompare(b.dia));

  return (
    <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <PageHeader
        title="Cuentas a pagar"
        description="Lo que le debés a cada proveedor, cuándo vence y los cheques que todavía no se debitaron. Entrá a una cuenta para pagar o cargar un cheque."
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
          titulo="Las cuentas a pagar todavía no están listas en tu negocio"
          comoSeguir="Falta preparar la base para las deudas con proveedores. Escribinos a Gestión Studio Grow y lo dejamos listo."
        />
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tarjeta label="Le debés a proveedores" value={fmtMoneyARS(r.total)} hint={`${fmtNumberAR(r.cuentas)} ${r.cuentas === 1 ? "cuenta" : "cuentas"}`} />
        <Tarjeta
          label={`Vence en ${DIAS_PROXIMOS_A_PAGAR} días`}
          value={fmtMoneyARS(r.venceEn7)}
          hint="Sin contar lo que ya cubre un cheque"
          tono={r.venceEn7 > 0 ? "warning" : undefined}
        />
        <Tarjeta
          label="Vencido"
          value={fmtMoneyARS(r.vencido)}
          hint={r.cuentasVencidas > 0 ? `${fmtNumberAR(r.cuentasVencidas)} ${r.cuentasVencidas === 1 ? "cuenta" : "cuentas"}` : undefined}
          tono={r.vencido > 0 ? "danger" : undefined}
        />
        <Tarjeta
          label="Cheques a debitar"
          value={fmtNumberAR(r.chequesADebitar)}
          hint={r.chequesADebitar > 0 ? `${fmtMoneyARS(r.montoChequesADebitar)} en los próximos ${DIAS_PROXIMOS_A_PAGAR} días` : `en los próximos ${DIAS_PROXIMOS_A_PAGAR} días`}
          tono={r.chequesADebitar > 0 ? "warning" : undefined}
        />
      </div>

      {conSaldo.length === 0 ? (
        <EmptyState
          title={saldadas > 0 ? "No le debés nada a ningún proveedor" : "Todavía no hay deudas con proveedores"}
          description={
            abribles.has("recibir-mercaderia")
              ? "Cuando recibas mercadería y la dejes a cuenta corriente, la deuda aparece acá con su vencimiento. Desde acá la pagás, en partes o con cheque."
              : "Las deudas nacen al recibir mercadería a cuenta corriente. Tu usuario no tiene Recibir mercadería: pedíselo a la dueña o al dueño."
          }
          action={
            abribles.has("recibir-mercaderia") ? (
              <Link href="/admin/compras" className={buttonClasses("solid", "md")}>
                Ir a Recibir mercadería
              </Link>
            ) : undefined
          }
        />
      ) : (
        <DebtListTable rows={filas} contraparteLabel="Proveedor" detailBase="/admin/cuentas-a-pagar" caption="Deudas con proveedores" />
      )}

      {cheques.length > 0 && (
        <section aria-labelledby="cheques-a-debitar" className="mt-8">
          <h2 id="cheques-a-debitar" className="mb-1 text-lg font-semibold text-strong">
            Cheques sin debitar
          </h2>
          <p className="mb-3 text-sm text-muted">
            Por fecha. Cuando el banco lo debite, entrá a la cuenta y marcalo: ahí se registra el pago.
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {cheques.map((c) => (
              <li key={c.ch.id}>
                <Link
                  href={`/admin/cuentas-a-pagar/${c.cuentaId}`}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-sunken"
                >
                  <span className="min-w-0">
                    <span className={`tabular-nums font-medium ${c.dia < hoy ? "text-danger" : "text-strong"}`}>{diaLegible(c.dia)}</span>
                    <span className="text-body"> · {c.proveedor}</span>
                    <span className="block text-xs text-muted">
                      N° {c.ch.chequeNumber} · {c.ch.bank} · {ETIQUETA_CHEQUE[c.ch.status]}
                      {c.dia < hoy ? " · la fecha ya pasó: ¿se debitó?" : ""}
                    </span>
                  </span>
                  <span className="tabular-nums font-semibold text-strong">{fmtMoneyARS(c.monto)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!cuentasCorrientesEnabled() && conSaldo.length > 0 && (
        <p className="mt-6 text-sm text-muted">
          Los pagos quedan en cada cuenta, pero todavía no pasan solos al libro de caja: si pagás en efectivo, anotalo
          también en el libro.
        </p>
      )}
    </main>
  );
}
