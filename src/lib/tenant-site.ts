import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";

// Slug del tenant actual — para resolver su vidriera/branding por tenant (réplica de
// sitio, acento, copy). Se resuelve aparte a propósito, para no acoplar la vidriera a la
// forma de retorno de otros loaders. Cacheado por request (React.cache) para no duplicar
// la query cuando varios resolvers lo piden. Fail-open: sin DB o sin tenant devuelve null
// (la vidriera cae a su modo genérico, nunca rompe el render por esto).
export const getCurrentTenantSlug = cache(async (): Promise<string | null> => {
  try {
    const t = await prisma.tenant.findUnique({
      where: { id: await getCurrentTenantId() },
      select: { slug: true },
    });
    return t?.slug ?? null;
  } catch {
    return null;
  }
});
