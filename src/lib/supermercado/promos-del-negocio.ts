// ============================================================================
// LAS PROMOS QUE VALEN EN UNA VENTA DE ESTE NEGOCIO — para la tienda y para "Pesar y ajustar".
// ============================================================================
//
// La caja con lector arma su contexto de promos (caja-actions.ts). La tienda online y el reajuste
// de un pedido (pesarlo al prepararlo) tienen que aplicar LAS MISMAS promos, o el cliente ve una
// oferta en la vidriera que después no se le cobra, o se le cobra en el pedido y se le saca al
// pesarlo. Se aplican sólo si el negocio tiene el módulo de Ofertas asignado: es configuración,
// no un rubro escrito en el código. Sin el módulo, `null`: el alta y el reajuste de siempre.
//
// Servidor (lee la base con el cliente de la app y el negocio ya resuelto). No es "use server".

import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { leerPromociones } from "./config-repo";
import { gondolasEnTx } from "./caja-lectura";
import { seccionDe } from "./secciones";
import { diaDeLaSemana, vigenteEn, type ContextoDePromo, type Promocion } from "./promociones";
import type { MedioDeCobro } from "@/lib/caja/medio-cobro";

export type PromosDeUnaVenta = {
  vigentes: Promocion[];
  contexto: ContextoDePromo;
  seccionPorProducto: Record<string, string>;
};

/** ¿El negocio tiene asignado el módulo de Ofertas? */
export async function negocioConOfertas(tenantId: string): Promise<boolean> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { modules: true } });
  return Boolean(t?.modules.includes("ofertas"));
}

/**
 * Las promos que valen en `fecha` (AAAA-MM-DD, día del negocio) para estos productos, con la
 * sección de cada uno. `null` si el negocio no tiene Ofertas o no hay ninguna que valga.
 */
export async function promosParaUnaVenta(
  tenantId: string,
  productIds: readonly string[],
  fecha: string,
  medio: MedioDeCobro | null,
): Promise<PromosDeUnaVenta | null> {
  if (!(await negocioConOfertas(tenantId))) return null;
  const diaSemana = diaDeLaSemana(fecha);
  const vigentes = (await leerPromociones(prisma, tenantId)).filter((p) => vigenteEn(p, { fecha, diaSemana }));
  if (vigentes.length === 0) return null;
  const ids = [...new Set(productIds)];
  const [productos, gondolas] = await Promise.all([
    prisma.product.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true, saleUnit: true } }),
    tenantTransaction((tx) => gondolasEnTx(tx, tenantId), { tenantId }),
  ]);
  return {
    vigentes,
    contexto: { fecha, diaSemana, medio },
    seccionPorProducto: Object.fromEntries(productos.map((p) => [p.id, seccionDe({ name: p.name, saleUnit: p.saleUnit, category: gondolas.get(p.id) ?? null })])),
  };
}
