"use client";

// «Dar de baja» un abono: pide confirmar en el mismo lugar (sin ventana emergente) y avisa el
// resultado en una región viva. Lo ya emitido no se toca: sólo deja de salir en los lotes.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { bajaReglaAction } from "@/lib/cartera-abonos-actions";

export default function BajaRegla({ reglaId, descripcion }: { reglaId: string; descripcion: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  if (!confirmando) {
    return (
      <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setConfirmando(true)} aria-label={`Dar de baja el abono ${descripcion}`}>
        Dar de baja
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="min-h-11"
        disabled={pendiente}
        onClick={() =>
          startTransition(async () => {
            const r = await bajaReglaAction(reglaId);
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
      >
        {pendiente ? "Dando de baja…" : "Sí, que no salga más"}
      </Button>
      <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setConfirmando(false)}>
        No
      </Button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
