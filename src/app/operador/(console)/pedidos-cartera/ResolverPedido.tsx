"use client";

// Cerrar un pedido de la cartera desde la bandeja de Soporte GSG: «Hecho» o «No corresponde» con un
// motivo de la LISTA CERRADA (MOTIVOS_NO_CORRESPONDE): la contadora lee ese texto y nada escrito a
// mano (refutador 26/09). La sesión y CH los vuelve a mirar la acción.

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { Franja } from "@/components/ui/Renglon";
import { MOTIVOS_NO_CORRESPONDE, MOTIVOS_NO_CORRESPONDE_EN_ORDEN } from "@/app/contador/pedido-soporte";
import { resolverPedidoDeCarteraAction, type ResultadoResolver } from "./actions";

export function ResolverPedido({ pedidoId, estudioTenantId }: { pedidoId: string; estudioTenantId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [r, accion, pendiente] = useActionState<ResultadoResolver | null, FormData>(resolverPedidoDeCarteraAction, null);

  if (r?.ok) return <Franja>Listo: el pedido se cerró y la contadora ve la respuesta en la ficha del cliente.</Franja>;
  if (!abierto) {
    return (
      <Button size="md" variant="outline" className="min-h-11" onClick={() => setAbierto(true)}>
        Cerrar pedido
      </Button>
    );
  }
  const idError = `resolver-error-${pedidoId}`;
  return (
    <form action={accion} className="grid gap-3 py-2">
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <input type="hidden" name="estudioTenantId" value={estudioTenantId} />
      <fieldset className="grid gap-1" aria-describedby={r && !r.ok ? idError : undefined}>
        <legend className="text-sm font-medium text-strong">Si no corresponde: qué lee la contadora en la ficha del cliente</legend>
        {MOTIVOS_NO_CORRESPONDE_EN_ORDEN.map((m) => (
          <label key={m} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input type="radio" name="motivo" value={m} className="h-5 w-5 shrink-0" />
            {MOTIVOS_NO_CORRESPONDE[m]}
          </label>
        ))}
      </fieldset>
      {r && !r.ok && (
        <Franja tono="peligro">
          <span id={idError}>{r.error}</span>
        </Franja>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="resultado" value="hecho" size="md" className="min-h-11" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Hecho"}
        </Button>
        <Button type="submit" name="resultado" value="no_corresponde" size="md" variant="outline" className="min-h-11" disabled={pendiente}>
          No corresponde
        </Button>
        <Button type="button" size="md" variant="ghost" className="min-h-11" onClick={() => setAbierto(false)}>
          Volver
        </Button>
      </div>
    </form>
  );
}
