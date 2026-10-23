// ============================================================================
// EL REPARTO — lo que leen «Armar reparto» y «Rendición del cadete» (servidor).
// ============================================================================
//
// Neon en plan gratuito: TRES lecturas acotadas por el `tenantId` de la sesión, en paralelo donde
// se puede —
//   1. los envíos en curso (con envío a domicilio y sin entregar), con sus renglones;
//   2. las marcas del reparto de esos envíos Y las de hoy (las rendiciones de los que ya se
//      entregaron), en UNA consulta;
//   3. la configuración de Envíos (el orden de las zonas = el recorrido del dueño) y el nombre del
//      negocio.
// No decide nada: lo traduce reparto-core.ts.

import "server-only";
import { prisma } from "@/lib/prisma";
import { businessWallTimeToUtc, todayInBusinessTz } from "@/lib/datetime";
import { ESTADOS_EN_CURSO } from "@/lib/order-anulacion";
import { leerConfigEnvios } from "@/lib/envios/config";
import {
  ACCION_REPARTO,
  envioDelReparto,
  estadoDelReparto,
  leerMarcaDeReparto,
  type EnvioDelReparto,
  type EnvioLeido,
  type MarcaDeReparto,
} from "./reparto-core";

export type Rendido = Extract<MarcaDeReparto, { tipo: "rendido" }> & { id: string; cuando: string };

export type DatosDelReparto = {
  hoy: string;
  negocio: string;
  envios: EnvioDelReparto[];
  ordenDeZonas: string[];
  /** Lo rendido HOY (la última marca de cada pedido, si es una rendición de hoy). */
  rendidosHoy: Rendido[];
};

export async function leerDatosDelReparto(tenantId: string): Promise<DatosDelReparto> {
  const hoy = todayInBusinessTz();
  const desdeHoy = businessWallTimeToUtc(hoy, "00:00");
  const [ordenes, config, tenant] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId, fulfillment: "DELIVERY", status: { in: [...ESTADOS_EN_CURSO] } },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        code: true,
        customerName: true,
        customerPhone: true,
        address: true,
        notes: true,
        scheduledFor: true,
        status: true,
        paid: true,
        total: true,
        items: { select: { productId: true, name: true, saleUnit: true, quantity: true }, orderBy: { id: "asc" } },
      },
    }),
    leerConfigEnvios(prisma, tenantId),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);
  const ids = ordenes.map((o) => o.id);
  const filas = await prisma.auditLog.findMany({
    where: {
      tenantId,
      entity: "Order",
      action: ACCION_REPARTO,
      OR: [...(ids.length ? [{ entityId: { in: ids } }] : []), { createdAt: { gte: desdeHoy } }],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { entityId: true, createdAt: true, changes: true },
  });
  const ultimas = estadoDelReparto(filas);

  const envios = ordenes.map((o) => {
    const leido: EnvioLeido = {
      id: o.id,
      code: o.code,
      cliente: o.customerName,
      telefono: o.customerPhone,
      direccion: o.address,
      notas: o.notes,
      horario: o.scheduledFor ? o.scheduledFor.toISOString() : null,
      status: o.status,
      cobrado: o.paid,
      total: Number(o.total),
      lineas: o.items.map((it) => ({
        productId: it.productId,
        nombre: it.name,
        unidad: it.saleUnit === "WEIGHT" ? "WEIGHT" : "UNIT",
        cantidad: Number(it.quantity),
      })),
    };
    return envioDelReparto(leido, ultimas.get(o.id));
  });

  const rendidosHoy: Rendido[] = [];
  for (const [id, u] of ultimas) {
    if (u.marca.tipo !== "rendido" || u.cuando.getTime() < desdeHoy.getTime()) continue;
    rendidosHoy.push({ ...u.marca, id, cuando: u.cuando.toISOString() });
  }
  rendidosHoy.sort((a, b) => a.cuando.localeCompare(b.cuando));

  return {
    hoy,
    negocio: tenant?.name ?? "el local",
    envios,
    ordenDeZonas: config.zonas.map((z) => z.nombre),
    rendidosHoy,
  };
}

/** Las marcas de UN pedido, la última primero (para las acciones). */
export async function ultimaMarcaDelPedido(tenantId: string, orderId: string): Promise<MarcaDeReparto | null> {
  return (await ultimaMarcaConFecha(tenantId, orderId))?.marca ?? null;
}

/** La última marca y cuándo se grabó (la rendición compara «salió» contra el cobro: O-3). */
export async function ultimaMarcaConFecha(tenantId: string, orderId: string): Promise<{ marca: MarcaDeReparto; en: Date } | null> {
  const fila = await prisma.auditLog.findFirst({
    where: { tenantId, entity: "Order", action: ACCION_REPARTO, entityId: orderId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { changes: true, createdAt: true },
  });
  const marca = fila ? leerMarcaDeReparto(fila.changes) : null;
  return fila && marca ? { marca, en: fila.createdAt } : null;
}
