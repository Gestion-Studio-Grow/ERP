/**
 * Host → producto (ADR-076 §2: cada producto con su link de venta propio; extensión de ADR-029).
 *
 * La raíz `/` del host de un producto abre su vidriera, sin que el link de venta tenga que llevar
 * la ruta. Es un REWRITE (la barra de direcciones sigue en `/`), no un redirect: el link se
 * comparte limpio y no queda cacheado un 308 en los navegadores si mañana cambia el destino.
 *
 * Lo que NO hace: resolver a qué negocio pertenece el host. Eso sigue siendo `TENANT_HOST_MAP` /
 * `HOSTS_PUBLICADOS` (src/lib/tenant.ts). Para Facturita, el valor esperado en `TENANT_HOST_MAP` es
 * la entrada `facturita-gsg.vercel.app=facturita` sumada al valor vigente, nunca en su lugar (MT-6;
 * docs/runbooks/facturacion/publicacion.md).
 *
 * PURO y sin imports: lo usa el proxy (src/proxy.ts), que no puede arrastrar Prisma.
 */

export const HOSTS_DE_PRODUCTO: Readonly<Record<string, string>> = {
  "facturita-gsg.vercel.app": "/facturita",
};

/** La vidriera a la que va la raíz de este host, o `null` si el host no es de un producto. */
export function vidrieraDelHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const h = host.split(",")[0].trim().toLowerCase().split(":")[0];
  return HOSTS_DE_PRODUCTO[h] ?? null;
}
