// ============================================================================
// LECTURA del Sugerido de compra — servidor, sin "use server".
// ============================================================================
//
// Lo llama la página después de `requireApp("sugerido-de-compra")`; recibe el negocio ya
// resuelto y no es un endpoint. Lee los productos con el MISMO where y el mismo período que
// el número del Inicio (`whereSugerido`, `selectDemanda`), así la pantalla y el botón dicen lo
// mismo, y le suma a cada producto su proveedor HABITUAL: el de su última compra a un
// proveedor de la lista que siga activo.
//
// Sin costos: el sugerido son cantidades. El encargado (RECEPTION) lo usa sin ver un peso.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  agruparPorProveedor,
  desdeVentaReciente,
  lineasSugeridas,
  selectDemanda,
  textoDelPedido,
  whereSugerido,
  type PedidoSugerido,
  type ProveedorHabitual,
} from "./sugerido";

export type PedidoParaMandar = PedidoSugerido & { texto: string };

export type DatosDelSugerido = {
  pedidos: PedidoParaMandar[];
  /** Productos que controlan stock (para distinguir "no hay nada para pedir" de "no hay productos"). */
  productos: number;
  /** ¿Se pudo leer el proveedor habitual? Si la tabla de proveedores no está, todo va sin proveedor. */
  conProveedores: boolean;
};

const CAMPOS = { id: true, name: true, unit: true, saleUnit: true, stock: true, lowStockAt: true } satisfies Prisma.ProductSelect;

/** La última compra con proveedor activo de la lista, por producto (`supplierRef`: el del maestro). */
const HABITUAL = {
  purchaseItems: {
    where: { purchase: { is: { supplierRef: { is: { active: true } } } } },
    orderBy: { purchase: { createdAt: "desc" } },
    take: 1,
    select: { purchase: { select: { supplierRef: { select: { id: true, name: true, phone: true } } } } },
  },
} satisfies Prisma.ProductSelect;

export async function getSugeridoData(tenantId: string, ahora: Date): Promise<DatosDelSugerido> {
  const desde = desdeVentaReciente(ahora);
  const [tenant, leidos] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    leerProductos(tenantId, desde),
  ]);

  const grupos = agruparPorProveedor(lineasSugeridas(leidos.productos), leidos.habitual);
  const negocio = tenant?.name ?? "";
  return {
    pedidos: grupos.map((g) => ({ ...g, texto: textoDelPedido(negocio, g.proveedor?.nombre ?? null, g.lineas) })),
    productos: leidos.productos.length,
    conProveedores: leidos.conProveedores,
  };
}

// La tabla de proveedores no está medida en todas las bases (compras-loader.ts cuenta lo mismo):
// si no existe, el sugerido sale igual, todo "sin proveedor habitual", en vez de caerse.
async function leerProductos(tenantId: string, desde: Date) {
  const where = whereSugerido(tenantId);
  const demanda = selectDemanda(desde);
  try {
    const productos = await prisma.product.findMany({
      where,
      orderBy: { name: "asc" },
      select: { ...CAMPOS, stockMovements: demanda, ...HABITUAL },
    });
    const habitual = new Map<string, ProveedorHabitual>();
    for (const p of productos) {
      const prov = p.purchaseItems[0]?.purchase.supplierRef;
      if (prov) habitual.set(p.id, { id: prov.id, nombre: prov.name, telefono: prov.phone });
    }
    return { productos, habitual, conProveedores: true };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== "P2021" && code !== "P2022") throw err;
    const productos = await prisma.product.findMany({ where, orderBy: { name: "asc" }, select: { ...CAMPOS, stockMovements: demanda } });
    return { productos, habitual: new Map<string, ProveedorHabitual>(), conProveedores: false };
  }
}
