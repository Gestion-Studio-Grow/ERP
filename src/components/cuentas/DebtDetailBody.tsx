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
import type { DebtAccountDetail, CollectionEntry } from "@/lib/cuentas/types";
import type { Aging } from "@/lib/cuentas/aging";
import type { EstadoFormularioCuenta } from "@/lib/debts/formularios";
import { RegisterCollectionForm } from "./RegisterCollectionForm";
import { ChequesDeLaDeuda, type AccionCheque, type ChequeVista } from "./ChequesDeLaDeuda";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-strong">{value}</p>
    </div>
  );
}

type AccionFormulario = (prev: EstadoFormularioCuenta, formData: FormData) => Promise<EstadoFormularioCuenta>;

// Cuerpo del detalle de una cuenta de deuda: settlement (total / saldado / saldo /
// estado) + registrar parcial + (a pagar) los cheques propios con su alta y su cambio de
// estado + historial de cobros/pagos. El semáforo de aging es la única excepción al canal
// neutro (ADR-059 D5).
//
// El formulario de cobro/pago se monta SIEMPRE (aunque la cuenta quede saldada): si se
// desmontara al llegar a saldo 0, el mensaje "quedó saldada" desaparecería junto con él.
export function DebtDetailBody({
  detail,
  aging,
  kind,
  action,
  asientaEnLibro,
  cheques,
  anulada = false,
}: {
  detail: DebtAccountDetail;
  aging: Aging;
  kind: "cobrar" | "pagar";
  action: AccionFormulario;
  /** ¿El cobro/pago entra solo al libro de caja? (CUENTAS_CORRIENTES_ENABLED). */
  asientaEnLibro: boolean;
  /** Sólo cuentas a pagar: los cheques propios, lo que falta cubrir y sus acciones. */
  cheques?: { lista: ChequeVista[]; libre: number; agregar: AccionCheque; cambiarEstado: AccionCheque };
  /** La cuenta está anulada: se ve su historia, sin formulario. */
  anulada?: boolean;
}) {
  const saldadoLabel = kind === "cobrar" ? "Cobrado" : "Pagado";
  const historialCols: DataTableColumn<CollectionEntry>[] = [
    dateColumn<CollectionEntry>("fecha", "Fecha", (r) => r.fecha),
    moneyColumn<CollectionEntry>("monto", "Monto", (r) => r.monto),
    textColumn<CollectionEntry>("metodo", "Medio", (r) => r.metodo),
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

      <RegisterCollectionForm
        accountId={detail.id}
        saldo={detail.saldo}
        kind={kind}
        action={action}
        asientaEnLibro={asientaEnLibro}
        anulada={anulada}
        tope={cheques?.libre}
      />

      {cheques && !anulada && (
        <ChequesDeLaDeuda
          cuentaId={detail.id}
          cheques={cheques.lista}
          libre={cheques.libre}
          agregar={cheques.agregar}
          cambiarEstado={cheques.cambiarEstado}
          asientaEnLibro={asientaEnLibro}
        />
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
    </div>
  );
}
