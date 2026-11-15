// Lo que la tienda usa del lado del servidor para «Pagar ahora con Mercado Pago» (Magra T6a): el
// token del redirect del alta y si el botón se muestra. Las reglas están en `pago-de-la-tienda.ts`
// (puro, con tests); acá sólo se leen el secreto, el entorno y el negocio.
//
// No es "use server": nada de esto se expone como action.

import "server-only";
import { authSecret } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { modoCobrosDesdeEnv } from "@/lib/mercadopago-cobros-dispatch";
import { simuladorDeAvisosEncendido, tieneMercadoPago } from "@/app/admin/(dashboard)/pedidos/link-de-pago";
import { botonDePagoVisible, esNegocioDeComercio, leerPedidoYToken, tokenDelPedido } from "@/lib/cobros/pago-de-la-tienda";

/** El token que va en `&t=` del redirect a Gracias. */
export function tokenParaGracias(tenantId: string, orderId: string): string {
  return tokenDelPedido(authSecret(), tenantId, orderId);
}

/**
 * ¿Gracias muestra el botón? Sólo a un negocio de COMERCIO con Mercado Pago disponible (módulo +
 * conexión, la misma regla que la bandeja) y con número y token en la dirección. Si no, `null`: Gracias queda
 * como siempre. Nunca tira: una falla al leer el negocio también es `null`.
 */
export async function pagoDeLaTiendaParaGracias(
  tenantId: string,
  pedido: unknown,
  token: unknown,
  env: Record<string, string | undefined> = process.env,
): Promise<{ pedido: string; token: string; prueba: boolean } | null> {
  const pedidoYToken = leerPedidoYToken(pedido, token);
  if (!pedidoYToken) return null;
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { modules: true, slug: true, blueprintId: true },
    });
    const modo = modoCobrosDesdeEnv(env);
    const visible = botonDePagoVisible({
      modo,
      simulador: simuladorDeAvisosEncendido(env),
      moduloMercadoPago: tieneMercadoPago(tenant?.modules),
      comercio: tenant ? esNegocioDeComercio(tenant) : false,
      pedidoYToken,
    });
    return visible ? { pedido: String(pedidoYToken.code), token: pedidoYToken.token, prueba: modo !== "real" } : null;
  } catch {
    return null;
  }
}
