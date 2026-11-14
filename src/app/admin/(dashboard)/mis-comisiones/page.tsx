// MI LIQUIDACIÓN — la profesional ve lo SUYO: lo pendiente estimado y lo que ya le liquidaron.
//
// T1, docs/producto/comisiones/LIQUIDACION.md §2. Capability `commissions:read-own`; el loader
// (`getMiLiquidacion`) acota todo a `User.professionalId` de la sesión y al negocio de la sesión.
// Sin botones de plata: liquidar y pagar sigue siendo de la dueña (Comisiones).

import { requireApp } from "@/lib/require-app";
import { getMiLiquidacion } from "@/lib/comisiones/lectura";
import { fmtShortDate } from "@/lib/datetime";
import { PageHeader, fmtMoneyARS } from "@/components/ui";

export const dynamic = "force-dynamic";

const plata = (cents: number) => fmtMoneyARS(cents / 100, cents % 100 === 0 ? 0 : 2);

export default async function MisComisionesPage() {
  await requireApp("mis-comisiones");
  const mia = await getMiLiquidacion();

  if (mia.tipo === "sin-perfil") {
    return (
      <main data-ui="pagina" className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader title="Mi liquidación" />
        <p className="text-sm text-muted">
          Tu usuario no está asociado a una profesional del equipo, así que no hay comisiones para mostrar. Si atendés turnos, pedile a la
          dueña que te asocie en Usuarios.
        </p>
      </main>
    );
  }

  const p = mia.pendiente;
  return (
    <main data-ui="pagina" className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Mi liquidación" description={`Lo tuyo, ${mia.nombre}: lo que llevás y lo que ya te liquidaron.`} />

      <section aria-labelledby="pendiente-titulo" className="mb-6 rounded-lg border border-line p-4">
        <h2 id="pendiente-titulo" className="text-sm text-muted">
          Pendiente de liquidar (estimado)
        </h2>
        <p className="text-2xl font-semibold tabular-nums text-strong">{plata(p?.totalCents ?? 0)}</p>
        <p className="mt-1 text-xs text-muted">
          {p ? `${p.lineas.length} ${p.lineas.length === 1 ? "turno realizado y cobrado" : "turnos realizados y cobrados"} hasta hoy.` : "Nada pendiente por ahora."}{" "}
          {mia.esperandoSaldo > 0 &&
            `${mia.esperandoSaldo} ${mia.esperandoSaldo === 1 ? "turno espera" : "turnos esperan"} que se cobre el saldo. `}
          Es una estimación: el número final lo fija la liquidación.
        </p>
        {p && p.lineas.length > 0 && (
          <details className="mt-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Ver turno por turno</summary>
            <ul className="divide-y divide-line text-sm">
              {p.lineas.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{l.servicio}</span>
                    <span className="block text-xs text-muted">
                      {fmtShortDate(l.startsAt)}
                      {l.clienta && <> · {l.clienta}</>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="block">{plata(l.comisionCents)}</span>
                    <span className="block text-xs text-muted">
                      {l.pct}% de {plata(l.baseCents)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {p && !p.detalleCuadra && (
          <p role="alert" className="mt-2 rounded-md bg-danger-soft px-2 py-1 text-xs text-danger">
            El detalle no suma lo mismo que el total. Vale el total de arriba; avisale a la dueña para que lo revise.
          </p>
        )}
      </section>

      <section aria-labelledby="liquidadas-titulo" className="rounded-lg border border-line p-4">
        <h2 id="liquidadas-titulo" className="font-medium">
          Lo que ya te liquidaron
        </h2>
        {mia.liquidaciones.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Todavía no tenés liquidaciones.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {mia.liquidaciones.map((c) => (
              <li key={c.payoutId} className="flex items-start justify-between gap-3 py-2">
                <span>
                  <span className="block">{c.datos.periodo}</span>
                  <span className="block text-xs text-muted">
                    {c.datos.turnos} {c.datos.turnos === 1 ? "turno" : "turnos"} · liquidada el {c.datos.fecha}
                    {c.datos.medio && <> · {c.datos.medio}</>}
                  </span>
                </span>
                <span className="font-medium tabular-nums">{plata(c.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
