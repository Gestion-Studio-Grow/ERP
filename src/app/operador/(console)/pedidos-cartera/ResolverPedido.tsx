"use client";

// Cerrar un pedido de la cartera desde la bandeja de Soporte GSG: «Hecho» o «No corresponde» (con
// el porqué, que la contadora lee en la ficha del cliente). La sesión y CH los vuelve a mirar la acción.

import { useActionState, useState } from "react";
import { Button, Field, Textarea } from "@/components/ui";
import { Franja } from "@/components/ui/Renglon";
import { NOTA_MAX } from "@/app/contador/pedido-soporte";
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
  const idRespuesta = `respuesta-${pedidoId}`;
  return (
    <form action={accion} className="grid gap-3 py-2">
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <input type="hidden" name="estudioTenantId" value={estudioTenantId} />
      <Field label="Respuesta para la contadora" htmlFor={idRespuesta} hint="Obligatoria si no corresponde. La lee en la ficha del cliente.">
        <Textarea id={idRespuesta} name="respuesta" maxLength={NOTA_MAX} rows={2} />
      </Field>
      {r && !r.ok && <Franja tono="peligro">{r.error}</Franja>}
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
