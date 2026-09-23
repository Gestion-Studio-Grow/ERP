"use client";

// «Avisar por WhatsApp»: abre el chat del cliente con el mensaje ya escrito ("tu pedido #123
// está listo…"). Antes el local copiaba el teléfono a mano y escribía el mensaje de memoria.
//
// 1 a 1 y desde el WhatsApp del que atiende: el sistema no manda nada solo. Al tocarlo queda
// constancia en la auditoría del pedido (`registrarAvisoWhatsApp`), sin esperarla: si la
// constancia falla, el aviso igual sale.

import { registrarAvisoWhatsApp } from "@/lib/order-actions";

export default function AvisarPorWhatsApp({ orderId, href }: { orderId: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        void registrarAvisoWhatsApp(orderId, "pedido-listo").catch(() => undefined);
      }}
      className="chip-btn text-xs h-11 sm:h-auto w-full sm:w-auto justify-center"
    >
      Avisar por WhatsApp
    </a>
  );
}
