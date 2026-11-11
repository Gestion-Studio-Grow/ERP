/**
 * Host → producto (ADR-076 §2: cada producto con su link de venta propio; extensión de ADR-029).
 *
 * La raíz `/` del host de un producto abre su vidriera, sin que el link de venta tenga que llevar
 * la ruta. Es un REWRITE (la barra de direcciones sigue en `/`), no un redirect: el link se
 * comparte limpio y no queda cacheado un 308 en los navegadores si mañana cambia el destino.
 *
 * Lo que NO hace: resolver a qué negocio pertenece el host. Eso sigue siendo `TENANT_HOST_MAP` /
 * `HOSTS_PUBLICADOS` (src/lib/tenant.ts). Para Facturita, el valor esperado en `TENANT_HOST_MAP` es
 * la entrada `facturita-gsg.vercel.app=facturita` sumada al valor vigente, nunca en su lugar; el alias
 * `factoque.gsgapp.com.ar` → `facturita` está en el código (`HOSTS_PUBLICADOS`, src/lib/tenant.ts) (MT-6;
 * docs/runbooks/facturacion/publicacion.md).
 *
 * PURO y sin imports: lo usa el proxy (src/proxy.ts), que no puede arrastrar Prisma.
 */

export const HOSTS_DE_PRODUCTO: Readonly<Record<string, string>> = {
  // El link de venta de Factoque (nombre comercial de Facturita, decisión del dueño 05/11/2026).
  "factoque.gsgapp.com.ar": "/facturita",
  // El link viejo sigue andando: lo que ya se compartió no se rompe.
  "facturita-gsg.vercel.app": "/facturita",
  // ProfeTurnos (app para profes de pádel): su vidriera con el alta sola.
  "profeturnos.gsgapp.com.ar": "/profeturnos",
};

/** La vidriera a la que va la raíz de este host, o `null` si el host no es de un producto. */
export function vidrieraDelHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const h = host.split(",")[0].trim().toLowerCase().split(":")[0];
  // Propia, no heredada: un Host `constructor` o `__proto__` no puede volverse destino de la reescritura.
  return Object.hasOwn(HOSTS_DE_PRODUCTO, h) ? HOSTS_DE_PRODUCTO[h] : null;
}
