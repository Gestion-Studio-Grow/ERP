"use client";

// DELIVERY LOCAL en el lote de la bandeja: «Mandar juntos al repartidor». Con 2+ pedidos Listos con
// envío elegidos, UN WhatsApp con cada parada y el total de efectivo; cada pedido queda salido una
// vez. Como el de a uno: la pestaña se abre dentro del toque y, si el navegador la frena, queda el
// enlace a mano (la selección no se limpia hasta que se abre).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useToast } from "../../ToastProvider";
import { mandarJuntosAlRepartidor } from "./acciones";
import type { ResultadoDelCajon } from "@/lib/delivery-local/salida";

export default function MandarViaje({ ids, onHecho }: { ids: string[]; onHecho: () => void }) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [pending, startTransition] = useTransition();
  const [aMano, setAMano] = useState<string | null>(null);

  function mandar() {
    const ventana = window.open("about:blank", "_blank");
    if (ventana) ventana.opener = null;
    startTransition(async () => {
      let r: ResultadoDelCajon;
      try {
        r = await mandarJuntosAlRepartidor(ids);
      } catch {
        r = { ok: false, error: "No hubo respuesta. Revisá la conexión y probá de nuevo." };
      }
      if (!r.ok) {
        ventana?.close();
        showError(r.error);
        return;
      }
      showSuccess(r.mensaje);
      router.refresh();
      if (ventana) {
        ventana.location.href = r.wa;
        onHecho();
      } else {
        setAMano(r.wa);
      }
    });
  }

  if (aMano) {
    return (
      <a
        href={aMano}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onHecho()}
        className="inline-flex min-h-11 items-center text-sm font-medium text-accent-ink underline underline-offset-4"
      >
        Abrir el WhatsApp del viaje
      </a>
    );
  }
  return (
    <Button size="sm" variant="outline" disabled={pending} estado={pending ? "cargando" : undefined} onClick={mandar}>
      Mandar juntos al repartidor · {ids.length}
    </Button>
  );
}
