"use client";

// «Mandar los pendientes a ARCA» de un cliente: el reintento. El servidor manda de a tandas
// (autorizar-en-tandas.ts) y contesta el mismo aviso que «Autorizar los pendientes» del negocio.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { mandarPendientesAction, type ResultadoMandar } from "@/lib/cartera-abonos-actions";

export default function ReintentarEnvios({ clienteId, pendientes }: { clienteId: string; pendientes: number }) {
  const router = useRouter();
  const [resultado, setResultado] = useState<ResultadoMandar | null>(null);
  const [pendiente, startTransition] = useTransition();
  const alerta = resultado && (!resultado.ok || resultado.tono === "atencion");

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        className="min-h-11"
        variant="outline"
        disabled={pendientes === 0 || pendiente}
        onClick={() =>
          startTransition(async () => {
            setResultado(await mandarPendientesAction(clienteId));
            router.refresh();
          })
        }
      >
        {pendiente ? "Mandando a ARCA…" : pendientes === 0 ? "No hay pendientes" : `Mandar ${pendientes === 1 ? "el pendiente" : `los ${pendientes.toLocaleString("es-AR")} pendientes`} a ARCA`}
      </Button>
      <p role={alerta ? "alert" : "status"} className={alerta ? "text-sm text-danger" : "text-sm text-muted"}>
        {resultado ? (resultado.ok ? resultado.texto : resultado.error) : ""}
      </p>
    </div>
  );
}
