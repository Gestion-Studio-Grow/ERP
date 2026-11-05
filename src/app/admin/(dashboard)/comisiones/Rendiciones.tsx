// Pestaña «Rendiciones» de /admin/comisiones (NAIL-ARTIST.md §5): lo que cada profesional del box le
// rinde al salón en el mes — cobrado, %, alquiler, a rendir y si ya se recibió — con «Registrar
// rendición» y el comprobante por WhatsApp. Sólo se monta con el interruptor `nail-artist` prendido.

import Link from "next/link";
import { Bloque, fmtMoneyARS } from "@/components/ui";
import { mesAnterior, nombreDelMes, type PeriodoMensual } from "@/lib/reports/rendiciones";
import type { ProfesionalConRendicion } from "@/lib/reports/rendiciones-lectura";
import type { FilaDeRendicion } from "./rendiciones.server";
import { ConfigDeRendicion, RegistrarRendicion } from "./RendicionesFormularios";

const pesos = (n: number) => fmtMoneyARS(n, 2);
const MEDIO: Record<string, string> = { EFECTIVO: "efectivo", MP: "Mercado Pago", TARJETA: "tarjeta", TRANSFERENCIA: "transferencia" };

function mesSiguiente(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

export default function Rendiciones({
  periodo,
  mesActual,
  filas,
  config,
  canSettle,
}: {
  periodo: PeriodoMensual;
  mesActual: string;
  filas: FilaDeRendicion[];
  config: ProfesionalConRendicion[];
  canSettle: boolean;
}) {
  const href = (mes: string) => `/admin/comisiones?vista=rendiciones&mes=${mes}`;
  return (
    <>
      <nav aria-label="Mes" className="mb-4 flex items-center gap-3 text-sm">
        <Link href={href(mesAnterior(periodo.mes))} className="underline-offset-2 hover:underline">
          ← {nombreDelMes(mesAnterior(periodo.mes))}
        </Link>
        <strong className="text-strong">{nombreDelMes(periodo.mes)}</strong>
        {periodo.mes < mesActual && (
          <Link href={href(mesSiguiente(periodo.mes))} className="underline-offset-2 hover:underline">
            {nombreDelMes(mesSiguiente(periodo.mes))} →
          </Link>
        )}
      </nav>
      <p className="mb-4 text-sm text-muted">
        Lo que cobra la profesional por sus servicios es de ella; acá se registra lo que le rinde al salón: un % de lo cobrado y el alquiler del box. Período mensual (provisional a confirmar).
      </p>

      <Bloque titulo="A rendir" cuenta={filas.length || undefined}>
        {filas.length === 0 ? (
          <p data-ui="vacio" className="border-b border-line py-4 text-sm text-body">
            Ninguna profesional tiene alquiler ni porcentaje cargado. Cargalo abajo.
          </p>
        ) : (
          <ul>
            {filas.map((f) => (
              <li key={f.professionalId} className="border-b border-line py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-strong">{f.nombre}</p>
                  <p className="tabular-nums text-strong">
                    <span className="text-muted">a rendir </span>
                    <strong>{pesos(f.amount)}</strong>
                  </p>
                </div>
                <p className="mt-1 text-sm tabular-nums text-body">
                  Cobró {pesos(f.collectedTotal)} en {f.appointmentCount} {f.appointmentCount === 1 ? "turno" : "turnos"}
                  {f.percentAmount > 0 || f.rentPercent > 0 ? ` · ${f.rentPercent} % = ${pesos(f.percentAmount)}` : ""}
                  {f.rentAmount > 0 ? ` · alquiler ${pesos(f.rentAmount)}` : ""}
                </p>
                {f.recibida ? (
                  <p className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                    <span className="rounded-sm bg-success-soft px-2 py-0.5 text-success">
                      Recibida el {f.recibida.el}
                      {f.recibida.metodo ? ` por ${MEDIO[f.recibida.metodo] ?? f.recibida.metodo}` : ""}
                    </span>
                    {f.recibida.comprobante && (
                      <a href={f.recibida.comprobante} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                        Mandarle el comprobante por WhatsApp
                      </a>
                    )}
                  </p>
                ) : (
                  <div className="mt-2">
                    <p className="mb-2 text-sm text-muted">Pendiente</p>
                    {canSettle && f.amount > 0 && <RegistrarRendicion professionalId={f.professionalId} mes={periodo.mes} nombre={f.nombre} />}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Bloque>

      {canSettle && (
        <Bloque titulo="Alquiler y porcentaje de cada profesional" className="mt-8">
          <p className="py-2 text-sm text-muted">
            Vacío o cero en los dos = no rinde y sigue en comisiones como siempre. Con algo cargado, no aparece en las comisiones a pagar.
          </p>
          {config.map((p) => (
            <ConfigDeRendicion key={p.id} professionalId={p.id} nombre={p.name} boxRentAmount={p.boxRentAmount} rentPercent={p.rentPercent} />
          ))}
        </Bloque>
      )}
    </>
  );
}
