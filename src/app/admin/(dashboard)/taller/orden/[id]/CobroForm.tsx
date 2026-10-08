"use client";

// Cobro de la orden: seña, pago parcial o total. Muestra en vivo cuánto pasarle al
// cliente por la tarjeta (el recargo por cuotas se suma arriba del importe del trabajo).

import { useState } from "react";
import { cn, Input } from "@/components/ui";
import { BotonEnviar } from "../../_piezas";
import { registrarPago } from "@/lib/taller/acciones";
import { conRecargo, MEDIOS, MEDIO_LABEL, pesos, recargoPct, type MedioPago, type Recargos } from "@/lib/taller/core";

export default function CobroForm({
  ordenId,
  saldo,
  recargos,
  alias,
  linkMp,
  sinAprobados,
}: {
  ordenId: string;
  saldo: number;
  recargos: Recargos;
  alias: string;
  linkMp: string;
  sinAprobados: boolean;
}) {
  const [medio, setMedio] = useState<MedioPago>("EFECTIVO");
  const [cuotas, setCuotas] = useState(1);
  const [monto, setMonto] = useState(saldo > 0 ? String(saldo).replace(".", ",") : "");
  const importe = Number(monto.replace(/\./g, "").replace(",", ".")) || 0;
  const pct = recargoPct(medio, cuotas, recargos);
  const { recargo, total } = conRecargo(importe, pct);

  return (
    <form action={registrarPago} className="grid grid-cols-1 gap-3">
      <input type="hidden" name="ordenId" value={ordenId} />
      <input type="hidden" name="medio" value={medio} />
      <input type="hidden" name="cuotas" value={cuotas} />

      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-strong">¿Cómo paga?</legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {MEDIOS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={medio === m}
              onClick={() => setMedio(m)}
              className={cn("h-12 rounded-xl border text-sm font-semibold", medio === m ? "border-transparent bg-accent text-on-accent" : "border-line bg-surface text-strong")}
            >
              {MEDIO_LABEL[m]}
            </button>
          ))}
        </div>
      </fieldset>

      {medio === "CREDITO" && (
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-strong">Cuotas</legend>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 3, 6, 12].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={cuotas === n}
                onClick={() => setCuotas(n)}
                className={cn("h-12 rounded-xl border text-sm font-semibold", cuotas === n ? "border-transparent bg-accent text-on-accent" : "border-line bg-surface text-strong")}
              >
                {n === 1 ? "1 pago" : `${n} cuotas`}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {medio === "TRANSFERENCIA" && (
        <p className="rounded-xl bg-surface-sunken p-3 text-sm">{alias ? <>Alias / CBU: <strong className="select-all text-strong">{alias}</strong></> : "Cargá tu alias o CBU en Configuración para tenerlo a mano acá."}</p>
      )}
      {medio === "MERCADO_PAGO" && (
        <p className="rounded-xl bg-surface-sunken p-3 text-sm">
          {linkMp ? <>Link de pago: <a href={linkMp} target="_blank" rel="noopener noreferrer" className="break-all font-semibold underline">{linkMp}</a></> : "Cobrá con tu QR o link de Mercado Pago y anotá acá el importe. Podés dejar tu link fijo en Configuración."}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="monto" className="mb-1 block text-sm font-semibold text-strong">Importe</label>
          <Input id="monto" name="monto" inputMode="decimal" required value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" className="h-12 text-lg" />
        </div>
        <div>
          <label htmlFor="nota" className="mb-1 block text-sm font-semibold text-strong">Nota</label>
          <Input id="nota" name="nota" placeholder="Seña" className="h-12" />
        </div>
      </div>

      {pct > 0 && importe > 0 && (
        <p className="rounded-xl border border-line p-3 text-sm" style={{ background: "var(--info-soft)" }}>
          Recargo {String(pct).replace(".", ",")} %: <strong>{pesos(recargo)}</strong>. Pasale la tarjeta por <strong>{pesos(total)}</strong>.
        </p>
      )}
      {sinAprobados && <p className="text-xs text-muted">El cliente todavía no aprobó nada: lo que cobres ahora queda como seña.</p>}

      <BotonEnviar pendingText="Registrando…" variant="solid" size="lg" className="h-14 justify-center text-base">
        Registrar cobro
      </BotonEnviar>
    </form>
  );
}
