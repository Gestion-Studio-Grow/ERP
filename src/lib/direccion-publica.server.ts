import "server-only";

// El origen público del pedido en curso (ver direccion-publica.ts): para los links que se arman en
// el servidor y salen al cliente (WhatsApp, QR, mails, calendario). `null` fuera de un pedido.
import { headers } from "next/headers";
import { origenPublico } from "./direccion-publica";

export async function origenPublicoDelPedido(): Promise<string | null> {
  try {
    const h = await headers();
    return origenPublico(h.get("x-forwarded-host") ?? h.get("host"));
  } catch {
    return null;
  }
}
