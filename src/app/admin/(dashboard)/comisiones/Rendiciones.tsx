// RENDICIONES — lo que tiene a rendir cada profesional que cobra aparte, y el formulario para
// registrar lo que entrega. Diseño: docs/producto/comisiones/RENDICION.md.
//
// El cobro de la profesional que cobra aparte NO entra al libro de caja (la plata está en su
// bolsillo, no en el cajón); entra acá, cuando la dueña o la recepción registran la rendición.
// Sin las tablas de la rendición (Gate 2 sin aplicar) esta sección no se muestra.
// Formulario sin JavaScript: la clave de idempotencia nace al dibujar la pantalla, así un doble
// clic manda la misma clave y queda una sola rendición.

import { randomUUID } from "node:crypto";
import { registrarRendicion } from "@/lib/comisiones/rendicion-actions";
import type { LecturaRendiciones } from "@/lib/comisiones/rendicion-repo";
import { fmtShortDate } from "@/lib/datetime";
import { textoAlCentavo } from "@/lib/dinero/redondeo";
import SubmitButton from "@/components/SubmitButton";
import { buttonClasses, fmtMoneyARS } from "@/components/ui";

const money = (n: number) => fmtMoneyARS(n, 2);
const MEDIO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  MERCADOPAGO: "Mercado Pago",
  MP: "Mercado Pago",
  TRANSFERENCIA: "Transferencia",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  TARJETA: "Tarjeta",
};
const medio = (m: string) => MEDIO[m] ?? m;
// El monto como se tipea acá ("12500,50"): lo lee `leerImporte` en el servidor.
const montoEditable = (n: number) => textoAlCentavo(n).replace(".", ",");

export default function Rendiciones({
  lectura,
  canRegister,
}: {
  lectura: LecturaRendiciones;
  /** `cash:manage`: registrar la plata que entra. */
  canRegister: boolean;
}) {
  if (!lectura.habilitada) return null;
  const { profesionales, historial } = lectura;
  if (profesionales.length === 0 && historial.length === 0) return null;

  return (
    <section aria-labelledby="rendiciones-titulo" className="mt-8 rounded-lg border border-line p-4">
      <h2 id="rendiciones-titulo" className="font-medium text-strong">
        A rendir por las profesionales que cobran aparte
      </h2>
      <p className="mb-4 text-xs text-muted">
        Lo que cobró cada una en sus turnos y todavía no entregó. No está en el cajón: entra al libro de caja recién cuando
        registrás la rendición.
      </p>

      <div className="space-y-4">
        {profesionales.map((p) => (
          <div key={p.professionalId} className="rounded-md border border-line p-3">
            <p className="font-medium text-strong">
              {p.nombre} · a rendir {money(p.cobradoPendiente)}
              <span className="font-normal text-muted">
                {" "}
                ({p.pendientes.length} {p.pendientes.length === 1 ? "cobro" : "cobros"})
              </span>
            </p>
            {p.pendientes.length > 0 && canRegister && (
              <form action={registrarRendicion} className="mt-3 space-y-3">
                <input type="hidden" name="professionalId" value={p.professionalId} />
                <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                <fieldset>
                  <legend className="sr-only">Cobros que rinde</legend>
                  <ul className="divide-y divide-line text-sm">
                    {p.pendientes.map((c) => (
                      <li key={c.id}>
                        <label className="flex min-h-11 items-center gap-3 py-1">
                          <input type="checkbox" name="cobroId" value={c.id} defaultChecked className="h-5 w-5" />
                          <span className="flex-1">
                            {fmtShortDate(c.startsAt)} · {c.servicio}
                            {c.clienta ? ` — ${c.clienta}` : ""}
                            <span className="text-muted"> · {medio(c.method)}</span>
                          </span>
                          <span className="tabular-nums">{money(c.monto)}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-muted">
                    Entregó
                    <input
                      name="entregado"
                      inputMode="decimal"
                      defaultValue={montoEditable(p.cobradoPendiente)}
                      aria-describedby={`ayuda-${p.professionalId}`}
                      className="mt-1 block h-11 w-36 rounded-md border border-line-strong bg-surface-raised px-2 text-sm tabular-nums text-strong focus:border-accent"
                    />
                  </label>
                  <label className="text-xs text-muted">
                    Cómo lo entregó
                    {/* Efectivo por defecto, como la liquidación de hoy (provisional a confirmar). */}
                    <select
                      name="method"
                      defaultValue="EFECTIVO"
                      className="mt-1 block h-11 rounded-md border border-line-strong bg-surface-raised px-2 text-sm text-strong focus:border-accent"
                    >
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="MP">Mercado Pago</option>
                      <option value="TRANSFERENCIA">Transferencia</option>
                    </select>
                  </label>
                  <label className="text-xs text-muted">
                    Nota
                    <input
                      name="nota"
                      maxLength={200}
                      placeholder="Opcional"
                      className="mt-1 block h-11 w-40 rounded-md border border-line-strong bg-surface-raised px-2 text-sm text-strong focus:border-accent"
                    />
                  </label>
                  <SubmitButton pendingText="Registrando…" className={buttonClasses("solid", "md", "whitespace-nowrap")}>
                    Registrar rendición
                  </SubmitButton>
                </div>
                <p id={`ayuda-${p.professionalId}`} className="text-xs text-muted">
                  Se rinde el total de los cobros tildados: su comisión se paga en la liquidación. Si destildás cobros,
                  ajustá el monto.
                </p>
              </form>
            )}
          </div>
        ))}
      </div>

      {historial.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-medium text-strong">Últimas rendiciones</h3>
          <ul className="divide-y divide-line text-sm">
            {historial.map((h) => (
              <li key={h.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {fmtShortDate(h.createdAt)} · {h.nombre} · {h.cantidad} {h.cantidad === 1 ? "cobro" : "cobros"}
                </span>
                <span className="tabular-nums text-muted">
                  entregó {money(h.entregado)} ({medio(h.method)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
