"use client";

// HOJA «COBRÉ» (M-060 · §2.3): Efectivo · Transferencia · Mercado Pago, y UN toque cobra. Cobra el
// total de la clase: el pago parcial («Otro monto») necesita la columna `pagado` de la Tanda 4 y
// llega en la 5 (M-137); acá no se ofrece algo que todavía no anda. «Mandarle el recibo» es
// opcional: deja listo el WhatsApp «Recibí el pago».
// T5 · Si el alumno tiene un paquete con clases, aparece «Del paquete · quedan N»: la clase se
// descuenta del paquete (cobrarConPaquete) en vez de cobrarse con plata.

import { useEffect, useState } from "react";
import { Icono, Plata, Switch, type NombreIconoPieza } from "@/components/ui";
import { cobrar } from "@/lib/padel/acciones";
import { cobrarConPaquete, paqueteParaCobrar } from "@/lib/padel/acciones-paquetes";
import { textoQuedan } from "@/lib/padel/paquetes-core";
import { MEDIO_LABEL, MEDIOS_COBRO, type MedioCobro } from "@/lib/padel/core";
import { primerNombre } from "../_cola";
import { ErrorAccion, HojaPanel, grande, useAccion } from "./comun";
import type { ClaseAcciones } from "./tipos";

const ICONO: Record<MedioCobro, NombreIconoPieza> = { EFECTIVO: "efectivo", TRANSFERENCIA: "transferencia", MERCADO_PAGO: "qr" };

export function HojaCobrar({ c, onCerrar }: { c: ClaseAcciones; onCerrar: () => void }) {
  const { pendiente, error, correr } = useAccion(c.nombre);
  const [recibo, setRecibo] = useState(false);
  const cobrarCon = (medio: MedioCobro) => correr(() => cobrar(c.id, medio, { recibo }), `Cobrada en ${MEDIO_LABEL[medio].toLowerCase()}`, onCerrar);
  // Cuántas le quedan en paquetes (null mientras se pregunta; 0 = no tiene: no se muestra el botón).
  const [quedan, setQuedan] = useState<number | null>(null);
  useEffect(() => {
    let vivo = true;
    paqueteParaCobrar(c.id)
      .then((r) => vivo && setQuedan(r.disponible ? r.quedan : 0))
      .catch(() => vivo && setQuedan(0));
    return () => {
      vivo = false;
    };
  }, [c.id]);
  const delPaquete = () => correr(() => cobrarConPaquete(c.id, { recibo }), `Descontada del paquete`, onCerrar);

  return (
    <HojaPanel
      onCerrar={onCerrar}
      titulo={`¿Cómo te pagó ${primerNombre(c.nombre)}?`}
      descripcion={
        <>
          La clase entera: <Plata valor={c.precio} sinCentavos />
        </>
      }
    >
      <div className="grid gap-2" role="group" aria-label="Medio de pago" aria-busy={pendiente} data-qa="medios-cobro">
        {MEDIOS_COBRO.map((m) => (
          <button key={m} type="button" disabled={pendiente} onClick={() => cobrarCon(m)} className={grande("outline")} data-qa={`cobrar-${m}`}>
            <Icono nombre={ICONO[m]} className="size-5" />
            {MEDIO_LABEL[m]}
          </button>
        ))}
        {quedan !== null && quedan > 0 && (
          <button type="button" disabled={pendiente} onClick={delPaquete} className={grande("outline")} data-qa="cobrar-PAQUETE">
            Del paquete · {textoQuedan(quedan).toLowerCase()}
          </button>
        )}
      </div>
      <Switch
        etiqueta="Mandarle el recibo por WhatsApp"
        detalle="Queda listo el mensaje «Recibí el pago»."
        checked={recibo}
        onChange={(e) => setRecibo(e.currentTarget.checked)}
        className="mt-4 min-h-12 rounded-xl border border-line px-3"
        data-qa="recibo"
      />
      <ErrorAccion texto={error} className="mt-3" />
    </HojaPanel>
  );
}
