"use client";

// «Mandar los pendientes a ARCA» de un cliente: el reintento. Lo pide una persona: el servidor
// toma también los que esperaban su próximo intento y revive los detenidos, y manda de a tandas
// (autorizar-en-tandas.ts). El foco queda en el botón; el resultado va a dos regiones vivas fijas.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { mandarPendientesAction, type ResultadoMandar } from "@/lib/cartera-abonos-actions";
import Avisos from "../../../Avisos";

export default function ReintentarEnvios({ clienteId, pendientes }: { clienteId: string; pendientes: number }) {
  const router = useRouter();
  const [resultado, setResultado] = useState<ResultadoMandar | null>(null);
  const [pendiente, startTransition] = useTransition();
  const texto = resultado ? (resultado.ok ? resultado.texto : resultado.error) : undefined;
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
      <Avisos ok={alerta ? undefined : texto} error={alerta ? texto : undefined} />
    </div>
  );
}
