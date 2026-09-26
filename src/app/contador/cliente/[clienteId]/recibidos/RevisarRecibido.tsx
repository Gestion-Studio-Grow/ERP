"use client";

// «Lo revisé: suma al crédito» en un comprobante marcado «A revisar» (refutador 26/09: sin esto, lo
// marcado quedaba afuera del crédito fiscal para siempre). Pide confirmar antes: cambia el IVA del
// mes. La sesión, el estudio y la cartera los vuelve a mirar revisarRecibidoAction.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { revisarRecibidoAction } from "@/lib/contador/recibidos-actions";

export default function RevisarRecibido({ clienteId, compraId }: { clienteId: string; compraId: string }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const revisar = () =>
    empezar(async () => {
      const fd = new FormData();
      fd.set("cliente", clienteId);
      fd.set("compra", compraId);
      const r = await revisarRecibidoAction(fd);
      if (r.ok) {
        setError(null);
        setConfirmando(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });

  return (
    <div className="grid justify-items-end gap-1">
      {confirmando ? (
        <>
          <p className="max-w-xs text-right text-xs">¿Miraste el comprobante original y el IVA es correcto? Su IVA pasa a sumar al crédito fiscal del mes.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" className="min-h-11" disabled={pendiente} onClick={revisar}>
              {pendiente ? "Guardando…" : "Sí, suma al crédito"}
            </Button>
            <Button size="sm" variant="ghost" className="min-h-11" disabled={pendiente} onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
          </div>
        </>
      ) : (
        <Button size="sm" variant="outline" className="min-h-11" onClick={() => setConfirmando(true)}>
          Lo revisé
        </Button>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
