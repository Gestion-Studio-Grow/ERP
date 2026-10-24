import "server-only";

// El link del turnero del profe (https://<su dominio>/clases) y su QR, para Ajustes y la Bienvenida.
// El dominio sale del pedido (como `origen()` de las acciones): cada negocio ve el suyo.

import { headers } from "next/headers";
import { toDataURL } from "qrcode";

export async function linkDelTurnero(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}/clases`;
}

/** PNG (data URL) de 480 px: se ve nítido impreso en una hoja A5 pegada en el club. */
export async function qrDelTurnero(url: string): Promise<string | null> {
  try {
    return await toDataURL(url, { width: 480, margin: 2, errorCorrectionLevel: "M" });
  } catch {
    return null;
  }
}
