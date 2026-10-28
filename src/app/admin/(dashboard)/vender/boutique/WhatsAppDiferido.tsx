"use client";

// «Pedido de WhatsApp», DIFERIDO (Magra · tanda perf, P-2; tanda practicidad, V-1 y V-6).
//
// Cerrado es un atajo de la fila (boutique/FilaDeAtajos): no hace falta bajar las 726 líneas de
// `PedidoDesdeWhatsApp` (lector del chat, propuesta, entrega) para dibujarlo. El componente entero
// se trae con `next/dynamic` al tocarlo (o si se llega con #whatsapp desde la bandeja) y se adelanta
// con el PRIMER toque en la pantalla (antes, con el navegador libre: bajaba igual al entrar).

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

const traer = () => import("../PedidoDesdeWhatsApp");
export const traerPedidoDeWhatsApp = traer;

export const PedidoDeWhatsAppDiferido = dynamic(traer, {
  loading: () => (
    <p role="status" aria-busy="true" className="min-h-11 text-sm text-muted">
      Abriendo el pedido de WhatsApp…
    </p>
  ),
});

function suscribirHash(avisar: () => void): () => void {
  window.addEventListener("hashchange", avisar);
  return () => window.removeEventListener("hashchange", avisar);
}

/** ¿Se llegó con #whatsapp (desde la bandeja)? Entonces el pedido se abre solo. */
export function useLlegoPorWhatsApp(): boolean {
  return useSyncExternalStore(suscribirHash, () => window.location.hash === "#whatsapp", () => false);
}
