"use client";

// «Anular con nota de crédito» de una factura autorizada. Se abre en el lugar (sin ventana
// emergente): el motivo es obligatorio y el importe, opcional (vacío = todo lo que queda por
// anular). El servidor (`anularFacturaAction`) verifica la cartera y el motor decide: misma letra,
// mismo receptor y nunca más de lo facturado. Dos regiones vivas fijas (`Avisos`). Foco: al
// abrir va al motivo; al cancelar vuelve a «Anular».

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "@/components/ui";
import { anularFacturaAction, type ResultadoAnular } from "@/lib/cartera-abonos-actions";
import Avisos from "../../../Avisos";

export default function AnularFactura({ clienteId, facturaId, numero }: { clienteId: string; facturaId: string; numero: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  const disparador = useRef<HTMLSpanElement>(null);
  const motivo = useRef<HTMLDivElement>(null);
  const yaAbrio = useRef(false);
  useEffect(() => {
    if (abierto) {
      yaAbrio.current = true;
      motivo.current?.querySelector("input")?.focus();
    } else if (yaAbrio.current) {
      disparador.current?.querySelector("button")?.focus();
    }
  }, [abierto]);
  const [estado, enviar, pendiente] = useActionState<ResultadoAnular | null, FormData>(async (prev, fd) => {
    const r = await anularFacturaAction(prev, fd);
    if (r.ok) router.refresh();
    return r;
  }, null);

  if (!abierto) {
    return (
      <span ref={disparador}>
        <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setAbierto(true)} aria-label={`Anular la factura ${numero} con nota de crédito`}>
          Anular
        </Button>
      </span>
    );
  }
  return (
    <form action={enviar} className="flex w-full flex-col gap-3 py-2 sm:w-96" aria-label={`Anular la factura ${numero}`}>
      <input type="hidden" name="clienteTenantId" value={clienteId} />
      <input type="hidden" name="facturaId" value={facturaId} />
      <div ref={motivo}>
      <Field label="Por qué se anula" htmlFor={`${id}-motivo`} required hint="Queda escrito en la nota de crédito.">
        <Input id={`${id}-motivo`} name="motivo" required maxLength={200} autoComplete="off" />
      </Field>
      </div>
      <Field label="Importe a anular (opcional)" htmlFor={`${id}-importe`} hint="Vacío: anula todo lo que queda de la factura.">
        <Input id={`${id}-importe`} name="importe" inputMode="decimal" importe />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11" disabled={pendiente}>
          {pendiente ? "Emitiendo la nota…" : "Emitir la nota de crédito"}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" disabled={pendiente} onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
      <Avisos ok={estado?.ok ? estado.mensaje : undefined} error={estado && !estado.ok ? estado.error : undefined} />
    </form>
  );
}
