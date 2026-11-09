"use client";

// El valor del voucher del negocio (orden del dueño, 09/11/2026): con valor, un voucher cubre hasta ese
// monto y lo que falte del turno se cobra con otro medio. Vacío = cubre lo que falta cobrar. La acción
// (`guardarValorVoucher`) vuelve a mirar que sea la dueña, el interruptor y la columna.

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { guardarValorVoucher } from "@/lib/vouchers/valor-voucher-actions";
import { textoAlCentavo } from "@/lib/dinero/redondeo";

const ROTULO = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted";
const FALLO = "No se pudo guardar. Probá de nuevo; si sigue, avisá.";

export function FormValorVoucher({ valor }: { valor: number | null }) {
  const id = useId();
  const router = useRouter();
  const [error, setError] = useState("");
  const [listo, setListo] = useState("");
  const [pendiente, empezar] = useTransition();
  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pendiente) return;
    const fd = new FormData(e.currentTarget);
    setError("");
    setListo("");
    empezar(async () => {
      try {
        const r = await guardarValorVoucher(fd);
        if (!r.ok) return setError(r.error);
        setListo(r.valor == null ? "Listo: el voucher cubre lo que falta cobrar del turno." : `Listo: cada voucher cubre hasta $ ${textoAlCentavo(r.valor).replace(".", ",")}.`);
        router.refresh();
      } catch {
        setError(FALLO);
      }
    });
  };
  return (
    <form onSubmit={enviar} className="flex flex-wrap items-end gap-3 pt-3" aria-busy={pendiente || undefined} data-testid="valor-voucher">
      <div>
        <label htmlFor={`${id}-valor`} className={ROTULO}>
          Valor de cada voucher
        </label>
        <Input
          id={`${id}-valor`}
          name="valor"
          importe
          inputMode="decimal"
          autoComplete="off"
          defaultValue={valor == null ? "" : textoAlCentavo(valor).replace(".", ",")}
          placeholder="Vacío = lo que falte cobrar"
          aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ""}`}
          className="text-right tabular-nums"
        />
      </div>
      <Button type="submit" variant="outline" disabled={pendiente} estado={pendiente ? "cargando" : undefined}>
        Guardar valor
      </Button>
      <p id={`${id}-ayuda`} className="w-full text-xs text-muted">
        Con un valor, el voucher cubre hasta ese monto y lo que falte del turno se cobra con otro medio. Vacío: cubre todo lo que falta cobrar.
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
      {listo && (
        <p role="status" className="w-full text-sm text-strong">
          {listo}
        </p>
      )}
    </form>
  );
}
