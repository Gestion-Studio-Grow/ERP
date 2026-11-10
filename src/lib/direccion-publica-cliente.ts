// Client-safe (sin Prisma ni env del servidor): ver direccion-publica.ts.

/**
 * En el navegador: el origen para los links que se comparten (WhatsApp, QR, copiar link). El panel
 * deja `data-origen-publico` en su raíz sólo cuando el host del pedido no es el público (entró por el
 * `.vercel.app`); si no está, el origen de la barra de direcciones ya es el bueno. Client-safe.
 */
export function origenParaCompartir(): string {
  if (typeof window === "undefined") return "";
  const marcado = document.querySelector("[data-origen-publico]")?.getAttribute("data-origen-publico");
  return marcado || window.location.origin;
}
