"use client";

// DELIVERY LOCAL en el cajón del pedido: «Mandar al repartidor» (marca la salida una vez y abre el
// WhatsApp armado, sin destinatario: el local elige el chat de su repartidor) y «Mandar seguimiento
// al cliente» (el link público del pedido al teléfono del cliente). Si el navegador frena la
// pestaña nueva, queda el enlace a mano debajo del botón.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useToast } from "../../ToastProvider";
import { mandarAlRepartidor, mandarSeguimientoAlCliente } from "./acciones";
import type { ResultadoDelCajon } from "@/lib/delivery-local/salida";

type Cual = "repartidor" | "seguimiento";

export default function MandarDeliveryLocal({ id, enviable }: { id: string; enviable: boolean }) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [pending, startTransition] = useTransition();
  const [enCurso, setEnCurso] = useState<Cual | null>(null);
  const [abrir, setAbrir] = useState<{ cual: Cual; href: string } | null>(null);

  function correr(cual: Cual) {
    // La pestaña se abre YA (dentro del toque) para que el navegador no la frene; se le pone el
    // destino cuando vuelve la acción, o se cierra si la acción dijo que no.
    const ventana = window.open("about:blank", "_blank");
    if (ventana) ventana.opener = null;
    setEnCurso(cual);
    startTransition(async () => {
      let r: ResultadoDelCajon;
      try {
        r = cual === "repartidor" ? await mandarAlRepartidor(id) : await mandarSeguimientoAlCliente(id);
      } catch {
        r = { ok: false, error: "No hubo respuesta. Revisá la conexión y probá de nuevo." };
      }
      setEnCurso(null);
      if (!r.ok) {
        ventana?.close();
        showError(r.error);
        return;
      }
      if (ventana) ventana.location.href = r.wa;
      setAbrir({ cual, href: r.wa });
      showSuccess(r.mensaje);
      if (cual === "repartidor") router.refresh();
    });
  }

  return (
    <section aria-label="Delivery propio" className="flex flex-col gap-2">
      {enviable ? (
        <Button variant="outline" disabled={pending} estado={enCurso === "repartidor" ? "cargando" : undefined} onClick={() => correr("repartidor")}>
          Mandar al repartidor
        </Button>
      ) : (
        <p className="text-sm text-muted">Cuando esté «Listo», lo mandás al repartidor desde acá.</p>
      )}
      <Button variant="ghost" disabled={pending} estado={enCurso === "seguimiento" ? "cargando" : undefined} onClick={() => correr("seguimiento")}>
        Mandar seguimiento al cliente
      </Button>
      {abrir && (
        <a
          href={abrir.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent-ink underline underline-offset-4"
        >
          {abrir.cual === "repartidor" ? "Abrir el WhatsApp para el repartidor" : "Abrir el WhatsApp del cliente"}
        </a>
      )}
    </section>
  );
}
