"use client";

// La parte «cable» de Balanza y lector: el asistente paso a paso (conectar, ver lo que llega,
// detectar el protocolo, guardar en esta PC). Lo que guarda es de ESTA computadora, no del
// negocio: otra PC del local tiene su propio cable y su propio puerto.

import { ProbarBalanzaPorCable } from "@/components/balanza/ProbarBalanzaPorCable";

export default function BalanzaPorCable({ tenantId }: { tenantId: string }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-body">
        Si tu balanza no imprime etiquetas pero tiene un cable para la computadora, el mostrador puede leer el peso solo:
        en Vender y en Pedidos aparece «Tomar peso». Funciona en Chrome o Edge de una computadora.
      </p>
      <ProbarBalanzaPorCable negocio={tenantId} />
    </div>
  );
}
