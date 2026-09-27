// ============================================================================
// LAS OFERTAS Y LAS SECCIONES QUE VIAJAN A LA VIDRIERA — servidor.
// ============================================================================
//
// La vidriera muestra "Ofertas de la semana", el rótulo de la promo en cada producto y, en la
// bolsa, cuánto se ahorra: con las MISMAS promos que el alta del pedido aplica en el servidor
// (promos-del-negocio.ts). Lo que viaja es la promo tal cual la lee el cliente (nombre, tipo,
// productos, días): sin la versión ni quién la cargó, que son del panel.
//
// Sólo si el negocio tiene el módulo de Ofertas; sin él, null y la vidriera es la de siempre.

import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { todayInBusinessTz } from "@/lib/datetime";
import { leerPromociones } from "./config-repo";
import { gondolasEnTx } from "./caja-lectura";
import { negocioConOfertas } from "./promos-del-negocio";
import { diaDeLaSemana, vigentesEnLaSemana, type Promocion } from "./promociones";

export type OfertasDeLaVidriera = {
  /** Las que valen algún día de estos siete, por prioridad. */
  promos: Promocion[];
  /** AAAA-MM-DD de hoy en el negocio, y su día de la semana (0 = domingo). */
  hoy: string;
  diaSemana: number;
};

/** Lo público de una promo: lo que la vidriera necesita para mostrarla y estimar el ahorro. */
export function promoPublica(p: Promocion): Promocion {
  return {
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    productos: p.productos,
    secciones: p.secciones,
    ...(p.lleva != null ? { lleva: p.lleva } : {}),
    ...(p.paga != null ? { paga: p.paga } : {}),
    ...(p.porcentaje != null ? { porcentaje: p.porcentaje } : {}),
    ...(p.medios ? { medios: p.medios } : {}),
    ...(p.combo ? { combo: p.combo } : {}),
    dias: p.dias,
    desde: p.desde ?? null,
    hasta: p.hasta ?? null,
    prioridad: p.prioridad,
    acumulable: p.acumulable,
    activa: p.activa,
  };
}

export async function ofertasDeLaVidriera(tenantId: string): Promise<OfertasDeLaVidriera | null> {
  if (!(await negocioConOfertas(tenantId))) return null;
  const hoy = todayInBusinessTz();
  const diaSemana = diaDeLaSemana(hoy);
  const promos = vigentesEnLaSemana(await leerPromociones(prisma, tenantId), hoy, diaSemana).map(promoPublica);
  return { promos, hoy, diaSemana };
}

/** La sección explícita de cada producto que la tiene (la columna de góndola, si existe). */
export async function gondolasDeLaVidriera(tenantId: string): Promise<Record<string, string>> {
  const m = await tenantTransaction((tx) => gondolasEnTx(tx, tenantId), { tenantId });
  return Object.fromEntries(m);
}
