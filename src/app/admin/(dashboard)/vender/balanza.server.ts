// ¿Esta pantalla (Vender o Pedidos) ofrece el campo de la etiqueta de la balanza? Lo deciden el
// catálogo (algo que se pese o que tenga código) y el formato guardado del negocio.
import "server-only";
import { prisma } from "@/lib/prisma";
import { leerConfigCaja } from "@/lib/supermercado/config-repo";
import { logger } from "@/lib/logger";
import { roleHasCapability, type Role } from "@/lib/capabilities";
import { puedeAbrirApp } from "./puede-abrir";
import type { BalanzaDeVender } from "./CampoEtiqueta";

/**
 * El campo «Etiqueta de la balanza o código», sólo en un negocio de mostrador que vende por kilo o
 * tiene códigos cargados (CH, de servicios, no lo ve). El formato es el mismo que lee la caja con
 * lector (config-repo.ts); cambiarlo se ofrece sólo a quien puede abrir esa configuración.
 */
export async function balanzaDeVender(
  tenantId: string,
  products: { saleUnit: string; codigo: string | null }[],
  role: Role,
): Promise<BalanzaDeVender | null> {
  if (!products.some((p) => p.saleUnit === "WEIGHT" || p.codigo)) return null;
  // Si la configuración no se puede leer, Vender sigue sin el campo: cobrar no depende de esto.
  const config = await leerConfigCaja(prisma, tenantId).catch((e) => {
    logger.error("vender.balanza", "no se pudo leer el formato de la balanza: Vender sigue sin el campo", e);
    return null;
  });
  if (!config) return null;
  // Sin el formato de la balanza del negocio, el campo no se muestra: leer una etiqueta con un
  // formato supuesto puede cargar un peso equivocado, y en un negocio en marcha no se muestra nada a
  // medio confirmar. Se prende cuando se guarda el formato real (Balanza y lector, o Caja con lector).
  if (config.porDefecto) return null;
  const puedeBalanza = await puedeAbrirApp("balanza");
  const configurar = puedeBalanza && roleHasCapability(role, "catalog:manage") ? "/admin/balanza" : null;
  return { formato: config.formato, porDefecto: config.porDefecto, configurar };
}
