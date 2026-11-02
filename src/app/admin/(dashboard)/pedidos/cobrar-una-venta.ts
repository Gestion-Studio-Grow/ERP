// «Cobrar una venta» fuera de Pedidos (UAT venta de productos, V.1): la recepcionista trabaja en la
// Agenda y en Caja, y la venta estaba sólo en Pedidos. Es un enlace al mismo cajón de siempre
// (`?cobrar=1`, MostradorEnCajon): no suma ninguna regla de plata. Sólo CH, y para quien puede vender
// (`orders:manage`, la capability de `createOrder`). PURO y client-safe.

import { roleHasCapability, type Role } from "@/lib/capabilities";
import { esEstetica, palabrasDelNegocio } from "@/lib/palabras-del-negocio";

export const HREF_COBRAR_UNA_VENTA = "/admin/pedidos?cobrar=1";

export function enlaceCobrarUnaVenta(slug: string | null | undefined, role: Role): { href: string; etiqueta: string } | null {
  if (!esEstetica(slug) || !roleHasCapability(role, "orders:manage")) return null;
  return { href: HREF_COBRAR_UNA_VENTA, etiqueta: palabrasDelNegocio(slug).cobrarLaVenta };
}
