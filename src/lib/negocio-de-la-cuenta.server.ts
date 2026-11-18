// El nombre del negocio de la CUENTA que está entrando (GSG-MIA-076). Sale del `tenantId` del usuario, no del host:
// en un dominio compartido la marca del host puede ser otra, y quien define su contraseña o su PIN tiene que ver de
// qué negocio es esa cuenta. Nunca rechaza: si no se puede leer, devuelve null y la pantalla sigue igual.
import "server-only";
import { prisma } from "@/lib/prisma";

export async function nombreDelNegocioDeLaCuenta(tenantId: string): Promise<string | null> {
  try {
    const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    return t?.name?.trim() || null;
  } catch {
    return null;
  }
}
