"use client";

// Ficha del negocio (Soporte GSG): el tope mensual de IA paga. Sin Prisma: la action hace todo.
import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { guardarTopeIAAction, type ResultadoTopeIA } from "./ia-tope-actions";

export function IaTopeForm({ tenantId, actual }: { tenantId: string; actual: string }) {
  const [r, accion, pendiente] = useActionState<ResultadoTopeIA | null, FormData>(guardarTopeIAAction, null);
  return (
    <form action={accion} className="space-y-2 py-3">
      <input type="hidden" name="tenantId" value={tenantId} />
      <Field label="Tope mensual de IA (US$)" htmlFor="ia-tope" hint="0 = el negocio no usa IA paga. La gratis no cuenta.">
        <Input id="ia-tope" name="tope" inputMode="decimal" defaultValue={actual} className="min-h-11 max-w-40" required />
      </Field>
      {r && !r.ok && <p role="alert" className="text-sm text-danger">{r.error}</p>}
      {r?.ok && <p role="status" className="text-sm">{r.mensaje}</p>}
      <Button type="submit" variant="outline" className="min-h-11" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar tope"}
      </Button>
    </form>
  );
}
