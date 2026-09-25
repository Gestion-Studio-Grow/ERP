// COMISIONES bajo «Diseño nuevo» («Renglón»): un renglón por profesional con lo que le toca a la
// derecha y la tecla «Pagar», que abre un cajón con cómo se le pagó y la nota. El historial, un
// renglón por liquidación. Postea a la MISMA acción (`settleCommissions`) con los mismos campos
// que ComisionesPendientes; la base de cálculo llega hecha (reports/comisiones.ts).

import Link from "next/link";
import { settleCommissions, type PayoutHistoryRow, type PendingCommission } from "@/lib/commission-actions";
import { fmtShortDate } from "@/lib/datetime";
import SubmitButton from "@/components/SubmitButton";
import { Bloque, Field, Plata, Renglon, Select, Input, buttonClasses, fmtMoneyARS } from "@/components/ui";
import type { VueltaDeLiquidacion } from "@/lib/reports/comisiones";
import CajonPorUrl from "../CajonPorUrl";

const turnos = (n: number) => `${n} ${n === 1 ? "turno" : "turnos"}`;

export default function ComisionesRenglon({
  overview,
  canSettle,
  volver,
}: {
  overview: { pending: PendingCommission[]; history: PayoutHistoryRow[] };
  canSettle: boolean;
  volver: VueltaDeLiquidacion;
}) {
  return (
    <>
      <Bloque titulo="A liquidar" cuenta={overview.pending.length || undefined} className="mt-6">
        {overview.pending.length === 0 ? (
          <p data-ui="vacio" className="border-b border-line py-4 text-sm text-body">
            Nadie tiene comisiones pendientes.
          </p>
        ) : (
          <ul data-sin-folio>
            {overview.pending.map((c) => (
              <Renglon
                key={c.professionalId}
                as="li"
                titulo={c.professionalName}
                detalle={
                  <>
                    {turnos(c.appointmentCount)} · sobre {fmtMoneyARS(c.ingresos, 0)}
                    {c.periodStart && c.periodEnd && ` · ${fmtShortDate(c.periodStart)} a ${fmtShortDate(c.periodEnd)}`}
                  </>
                }
                plata={<Plata valor={c.amount} sinCentavos />}
                tecla={
                  canSettle ? (
                    <Link href={`?pagar=${encodeURIComponent(c.professionalId)}`} scroll={false} className={buttonClasses("outline", "sm")}>
                      Pagar
                    </Link>
                  ) : undefined
                }
              />
            ))}
          </ul>
        )}
      </Bloque>

      {canSettle &&
        overview.pending.map((c) => (
          <CajonPorUrl
            key={c.professionalId}
            parametro="pagar"
            valor={c.professionalId}
            titulo={`Pagarle a ${c.professionalName}`}
            descripcion={`${fmtMoneyARS(c.amount, 0)} por ${turnos(c.appointmentCount)}. Queda congelado y el pago sale del libro de caja.`}
          >
            <form action={settleCommissions} className="flex flex-col gap-4">
              <input type="hidden" name="professionalId" value={c.professionalId} />
              <input type="hidden" name="volver" value={volver} />
              <Field label="Cómo se le pagó" htmlFor={`metodo-${c.professionalId}`}>
                <Select id={`metodo-${c.professionalId}`} name="method" defaultValue="EFECTIVO">
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="MP">Transferencia / MP</option>
                  <option value="TARJETA">Tarjeta</option>
                </Select>
              </Field>
              <Field label="Nota" htmlFor={`nota-${c.professionalId}`} hint="Opcional">
                <Input id={`nota-${c.professionalId}`} name="note" />
              </Field>
              <SubmitButton pendingText="Liquidando…" className={buttonClasses("solid", "md", "self-start")}>
                Marcar pagada {fmtMoneyARS(c.amount, 0)}
              </SubmitButton>
            </form>
          </CajonPorUrl>
        ))}

      <Bloque titulo="Ya pagadas" cuenta={overview.history.length || undefined} className="mt-8">
        {overview.history.length === 0 ? (
          <p data-ui="vacio" className="border-b border-line py-4 text-sm text-body">
            Todavía no se liquidó ninguna.
          </p>
        ) : (
          <ul>
            {overview.history.map((h) => (
              <Renglon
                key={h.id}
                as="li"
                folio={<span className="tabular-nums">{fmtShortDate(h.createdAt)}</span>}
                titulo={h.professionalName}
                detalle={
                  <>
                    {fmtShortDate(h.periodStart)} a {fmtShortDate(h.periodEnd)} · {turnos(h.appointmentCount)}
                    {h.note && ` · ${h.note}`}
                  </>
                }
                plata={<Plata valor={h.amount} sinCentavos />}
              />
            ))}
          </ul>
        )}
      </Bloque>
    </>
  );
}
