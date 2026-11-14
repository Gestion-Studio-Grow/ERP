// VISTA PREVIA DE LA LIQUIDACIÓN (T1, docs/producto/comisiones/LIQUIDACION.md §2 y §5).
//
// Caro elige el período → abre el renglón de una profesional → ve turno por turno (servicio,
// cobrado, %, comisión) → liquida ESE período → manda el comprobante por WhatsApp. El total es el
// que congela `settleCommissions` (mismo cálculo y mismo corte: comisiones/vista-previa.ts); el
// formulario manda la clave del período, así se liquida lo que se vio y nada más.
// Server component: el renglón abre con <details>, el período cambia por link. Controles de 44 px.

import { settleCommissions } from "@/lib/commission-actions";
import { fmtShortDate } from "@/lib/datetime";
import SubmitButton from "@/components/SubmitButton";
import { buttonClasses, fmtMoneyARS } from "@/components/ui";
import { periodoAnterior, periodoQueContiene, periodoSiguiente, type TipoPeriodo } from "@/lib/comisiones/periodo";
import type { VistaPrevia as Vista } from "@/lib/comisiones/vista-previa";
import type { ComprobanteDeLiquidacion } from "@/lib/comisiones/lectura";
import { MEDIO_POR_DEFECTO_LIQUIDACION } from "@/lib/comisiones/medio-por-defecto";

const plata = (cents: number) => fmtMoneyARS(cents / 100, cents % 100 === 0 ? 0 : 2);
const TIPOS: { tipo: TipoPeriodo; texto: string }[] = [
  { tipo: "MES", texto: "Mes" },
  { tipo: "QUINCENA", texto: "Quincena" },
  { tipo: "SEMANA", texto: "Semana" },
];
const link44 = "inline-flex min-h-11 items-center rounded-md px-3 text-sm";

export default function VistaPrevia({
  vista,
  comprobantes,
  canSettle,
}: {
  vista: Vista;
  comprobantes: ComprobanteDeLiquidacion[];
  /** Sólo quien tiene commissions:manage ve el botón de liquidar. */
  canSettle: boolean;
}) {
  const p = vista.periodo;
  const href = (clave: string) => `/admin/comisiones?periodo=${encodeURIComponent(clave)}`;
  // Cambiar de mes a quincena o semana sin perder dónde estaba: el período de ese tipo que
  // contiene el último día del elegido.
  const delTipo = (tipo: TipoPeriodo) => (tipo === p.tipo ? p : periodoQueContiene(p.hasta, tipo));
  const anterior = periodoAnterior(p);
  const siguiente = periodoSiguiente(p);

  return (
    <section aria-labelledby="vista-previa-titulo" className="mb-6 rounded-lg border border-line p-4">
      <h2 id="vista-previa-titulo" className="font-medium">
        Liquidar un período
      </h2>
      <p className="mt-1 text-xs text-muted">
        Entran los turnos realizados y saldados hasta el último día del período (hora de Argentina). Lo de
        antes que todavía no se liquidó entra también. Período por defecto: el mes que cerró (provisional a confirmar).
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1" role="group" aria-label="Tipo de período">
        {TIPOS.map((t) => (
          <a
            key={t.tipo}
            href={href(delTipo(t.tipo).clave)}
            aria-current={t.tipo === p.tipo ? "true" : undefined}
            className={`${link44} border ${t.tipo === p.tipo ? "border-accent bg-accent-soft text-strong" : "border-line text-muted"}`}
          >
            {t.texto}
          </a>
        ))}
      </div>

      <nav aria-label="Elegir período" className="mt-2 flex items-center justify-between gap-2">
        <a href={href(anterior.clave)} className={`${link44} border border-line`} aria-label={`Período anterior: ${anterior.etiqueta}`}>
          ‹ Anterior
        </a>
        <p className="text-center text-base font-semibold text-strong" aria-live="polite">
          {p.etiqueta}
        </p>
        <a href={href(siguiente.clave)} className={`${link44} border border-line`} aria-label={`Período siguiente: ${siguiente.etiqueta}`}>
          Siguiente ›
        </a>
      </nav>

      <p className="mt-3 text-sm">
        <strong className="tabular-nums">{plata(vista.totalCents)}</strong> a liquidar en {p.etiqueta.toLowerCase()}
        {vista.profesionales.length > 0 && (
          <> · {vista.profesionales.length} {vista.profesionales.length === 1 ? "profesional" : "profesionales"}</>
        )}
      </p>
      {(vista.esperandoSaldo > 0 || vista.despuesDelCorte > 0) && (
        <p className="mt-1 text-xs text-muted">
          {vista.esperandoSaldo > 0 && <>{vista.esperandoSaldo} {vista.esperandoSaldo === 1 ? "turno espera" : "turnos esperan"} que se cobre el saldo. </>}
          {vista.despuesDelCorte > 0 && <>{vista.despuesDelCorte} {vista.despuesDelCorte === 1 ? "turno es" : "turnos son"} de después: entran en el período siguiente.</>}
        </p>
      )}

      {vista.profesionales.length === 0 && <p className="mt-3 text-sm text-muted">No hay comisiones para liquidar en este período.</p>}

      <ul className="mt-3 space-y-2">
        {vista.profesionales.map((prof) => (
          <li key={prof.professionalId} className="rounded-md border border-line">
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{prof.professionalName}</span>
                  <span className="block text-xs text-muted">
                    {prof.lineas.length} {prof.lineas.length === 1 ? "turno" : "turnos"} · sobre {plata(prof.baseCents)}
                  </span>
                </span>
                <span className="font-semibold tabular-nums text-strong">{plata(prof.totalCents)}</span>
              </summary>
              <div className="border-t border-line px-3 py-2">
                <ul className="divide-y divide-line text-sm" aria-label={`Turnos de ${prof.professionalName}`}>
                  {prof.lineas.map((l) => (
                    <li key={l.id} className="flex items-start justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate">{l.servicio}</span>
                        <span className="block text-xs text-muted">
                          {fmtShortDate(l.startsAt)}
                          {l.clienta && <> · {l.clienta}</>}
                          {l.deAntes && <> · de un período anterior</>}
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
                {!prof.detalleCuadra && (
                  <p role="alert" className="mt-2 rounded-md bg-danger-soft px-2 py-1 text-xs text-danger">
                    El detalle no suma lo mismo que el total. Se liquida el total de arriba; avisá a soporte antes de pagar.
                  </p>
                )}
                {canSettle && (
                  <form action={settleCommissions} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="professionalId" value={prof.professionalId} />
                    <input type="hidden" name="volver" value="/admin/comisiones" />
                    <input type="hidden" name="periodo" value={p.clave} />
                    <select
                      name="method"
                      defaultValue={MEDIO_POR_DEFECTO_LIQUIDACION}
                      aria-label={`Cómo se le paga a ${prof.professionalName}`}
                      className="h-11 rounded-md border border-line-strong bg-surface-raised px-2 text-sm text-strong focus:border-accent"
                    >
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="MP">Mercado Pago</option>
                      <option value="TRANSFERENCIA">Transferencia</option>
                      <option value="TARJETA">Tarjeta</option>
                    </select>
                    <input
                      name="note"
                      placeholder="Nota (opcional)"
                      aria-label="Nota"
                      className="h-11 w-40 rounded-md border border-line-strong bg-surface-raised px-2 text-sm text-strong focus:border-accent"
                    />
                    <SubmitButton pendingText="Liquidando…" className={buttonClasses("solid", "md", "whitespace-nowrap")}>
                      Liquidar y pagar {plata(prof.totalCents)}
                    </SubmitButton>
                  </form>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>

      {comprobantes.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-medium">Comprobantes para mandar</h3>
          <p className="text-xs text-muted">Se abre tu WhatsApp con el texto escrito; lo mandás vos.</p>
          <ul className="mt-2 divide-y divide-line text-sm">
            {comprobantes.map((c) => (
              <li key={c.payoutId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{c.professionalName}</span> · <span className="tabular-nums">{plata(c.amountCents)}</span>
                  <span className="block text-xs text-muted">
                    {c.datos.periodo} · liquidada el {c.datos.fecha}
                  </span>
                </span>
                {c.link ? (
                  <a href={c.link} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md", "whitespace-nowrap")}>
                    Mandar comprobante
                  </a>
                ) : (
                  <a href="/admin/catalogo" className={`${link44} text-muted underline`}>
                    Sin celular: cargalo en Catálogo
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
