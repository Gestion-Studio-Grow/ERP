"use client";

// Quién es la administración (10/11/2026): los CUIT/CUIL/CBU/CVU desde los que paga. Todo crédito de esos
// pagadores en Mercado Pago o en el extracto va a revisión y no se factura solo. Vacío = se frena por monto
// y fecha. La acción (`guardarPagadoresDeLaAdministracion`) vuelve a mirar que sea la dueña, el
// interruptor y la columna.

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea } from "@/components/ui";
import { guardarPagadoresDeLaAdministracion } from "@/lib/vouchers/pagadores-administracion-actions";

const ROTULO = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted";
const FALLO = "No se pudo guardar. Probá de nuevo; si sigue, avisá.";

/** `pagadores`: ya legibles (CUIT con guiones), los arma la página. */
export function PagadoresDeLaAdministracion({ pagadores }: { pagadores: string[] }) {
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
        const r = await guardarPagadoresDeLaAdministracion(fd);
        if (!r.ok) return setError(r.error);
        setListo(
          r.pagadores.length === 0
            ? "Listo: sin CUIT cargado, se frena sólo lo que coincide en monto y fecha con un pago."
            : "Listo: todo lo que pague la administración queda en revisión y no se factura solo.",
        );
        router.refresh();
      } catch {
        setError(FALLO);
      }
    });
  };
  return (
    <form onSubmit={enviar} className="space-y-3 pt-3" aria-busy={pendiente || undefined} data-testid="pagadores-administracion">
      <div>
        <label htmlFor={`${id}-pagadores`} className={ROTULO}>
          CUIT, CBU o CVU de la administración
        </label>
        <Textarea
          id={`${id}-pagadores`}
          name="pagadores"
          rows={3}
          autoComplete="off"
          spellCheck={false}
          defaultValue={pagadores.join("\n")}
          placeholder="30-71234567-1"
          aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ""}`}
          className="max-w-md font-mono tabular-nums"
        />
      </div>
      <p id={`${id}-ayuda`} className="text-xs text-muted">
        Uno por renglón. Lo que entre desde estas cuentas no se factura solo: queda en revisión para confirmar la acreditación del pago, o aprobarlo si es una venta.
      </p>
      <Button type="submit" variant="outline" disabled={pendiente} estado={pendiente ? "cargando" : undefined}>
        Guardar
      </Button>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {listo && (
        <p role="status" className="text-sm text-strong">
          {listo}
        </p>
      )}
    </form>
  );
}
