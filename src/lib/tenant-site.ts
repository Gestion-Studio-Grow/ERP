import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId, slugResueltoDelPedido } from "@/lib/tenant";

// Slug del tenant actual — para resolver su vidriera/branding por tenant (réplica de
// sitio, acento, copy). Se resuelve aparte a propósito, para no acoplar la vidriera a la
// forma de retorno de otros loaders. Cacheado por request (React.cache) para no duplicar
// la query cuando varios resolvers lo piden. Fail-open: sin DB o sin tenant devuelve null
// (la vidriera cae a su modo genérico, nunca rompe el render por esto).
//
// PERFORMANCE (PERFORMANCE-TERMINALES.md, ronda 2): el slug sale de la MISMA lectura que resolvió el
// negocio por el host (`slugResueltoDelPedido`): antes era una segunda consulta por id, con su
// transacción de RLS (BEGIN + set_config + SELECT + COMMIT). Sólo el sandbox, que no trae slug,
// consulta como antes. Mismo fail-open: si el host no resuelve, null y la marca neutra (MT-1).
export const getCurrentTenantSlug = cache(async (): Promise<string | null> => {
  try {
    const resuelto = await slugResueltoDelPedido();
    if (resuelto) return resuelto;
    const t = await prisma.tenant.findUnique({
      where: { id: await getCurrentTenantId() },
      select: { slug: true },
    });
    return t?.slug ?? null;
  } catch {
    return null;
  }
});
