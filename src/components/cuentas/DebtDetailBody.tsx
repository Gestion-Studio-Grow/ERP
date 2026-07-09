"use client";

import {
  DataTable,
  dateColumn,
  moneyColumn,
  textColumn,
  Badge,
  fmtMoneyARS,
  type DataTableColumn,
} from "@/components/ui";
import { fmtShortDate } from "@/lib/datetime";
import type { DebtAccountDetail, CollectionEntry } from "@/lib/cuentas/types";
import type { Aging } from "@/lib/cuentas/aging";
import { RegisterCollectionForm } from "./RegisterCollectionForm";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-strong">{value}</p>
    </div>
  );
}

// Cuerpo del detalle de una cuenta de deuda: settlement (total / saldado / saldo /
// estado) + (a pagar) cheque diferido + historial de cobros/pagos + registrar parcial.
// El semáforo de aging es la única excepción al canal neutro (ADR-059 D5).
export function DebtDetailBody({
  detail,
  aging,
  kind,
  action,
}: {
  detail: DebtAccountDetail;
  aging: Aging;
  kind: "cobrar" | "pagar";
  action: (formData: FormData) => void | Promise<void>;
}) {
  const saldadoLabel = kind === "cobrar" ? "Cobrado" : "Pagado";
  const historialCols: DataTableColumn<CollectionEntry>[] = [
    dateColumn<CollectionEntry>("fecha", "Fecha", (r) => r.fecha),
    moneyColumn<CollectionEntry>("monto", "Monto", (r) => r.monto),
    textColumn<CollectionEntry>("metodo", "Método", (r) => r.metodo),
    textColumn<CollectionEntry>("nota", "Nota", (r) => r.nota ?? "—"),
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total" value={fmtMoneyARS(detail.total)} />
        <Stat label={saldadoLabel} value={fmtMoneyARS(detail.saldado)} />
        <Stat label="Saldo" value={fmtMoneyARS(detail.saldo)} />
        <div className="rounded-lg border border-line p-4">
          <p className="text-sm text-muted">Estado</p>
          <div className="mt-2">
            <Badge tone={aging.tone}>{aging.label}</Badge>
          </div>
        </div>
      </div>

      {detail.cheques && detail.cheques.length > 0 && (
        <section>
          <h3 className="mb-2 font-medium text-strong">Cheques diferidos</h3>
          <div className="space-y-2">
            {detail.cheques.map((ch, i) => (
              <div key={`${ch.numero}-${i}`} className="rounded-lg border border-line p-4">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
                  <div><dt className="text-muted">N°</dt><dd className="font-medium">{ch.numero}</dd></div>
                  <div><dt className="text-muted">Banco</dt><dd className="font-medium">{ch.banco}</dd></div>
                  <div><dt className="text-muted">Monto</dt><dd className="font-medium tabular-nums">{fmtMoneyARS(ch.monto)}</dd></div>
                  <div><dt className="text-muted">Se deposita</dt><dd className="font-medium">{ch.fechaDiferida ? fmtShortDate(ch.fechaDiferida) : "—"}</dd></div>
                  <div><dt className="text-muted">Estado</dt><dd className="font-medium">{ch.estado}</dd></div>
                </dl>
                {ch.endosadoA && <p className="mt-1 text-xs text-muted">Endosado a {ch.endosadoA}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-3 font-medium text-strong">Historial de {kind === "cobrar" ? "cobros" : "pagos"}</h3>
        <DataTable
          caption={`Historial de ${kind === "cobrar" ? "cobros" : "pagos"} de la cuenta`}
          columns={historialCols}
          rows={detail.historial}
          rowKey={(r) => r.id}
          emptyState={<p className="px-4 py-6 text-sm text-muted">Todavía no se registró ningún {kind === "cobrar" ? "cobro" : "pago"}.</p>}
        />
      </section>

      {detail.saldo > 0 && (
        <RegisterCollectionForm accountId={detail.id} saldo={detail.saldo} kind={kind} action={action} />
      )}
    </div>
  );
}
