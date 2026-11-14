import "server-only";

// El link del turnero del profe (https://<su dominio>/clases) y su QR, para Ajustes y la Bienvenida.
// El dominio sale del pedido (como `origen()` de las acciones): cada negocio ve el suyo.

import { toDataURL } from "qrcode";
import { origenPublicoDelPedido } from "@/lib/direccion-publica.server";

export async function linkDelTurnero(): Promise<string> {
  // Con dominio propio, el host .vercel.app se reescribe al subdominio de gsgapp (direccion-publica.ts).
  return `${(await origenPublicoDelPedido()) ?? ""}/clases`;
}

/** PNG (data URL) de 480 px: se ve nítido impreso en una hoja A5 pegada en el club. */
export async function qrDelTurnero(url: string): Promise<string | null> {
  try {
    return await toDataURL(url, { width: 480, margin: 2, errorCorrectionLevel: "M" });
  } catch {
    return null;
  }
}
