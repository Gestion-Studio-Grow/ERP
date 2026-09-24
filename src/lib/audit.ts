"use server";

// Superficie de Server Actions de la auditoría: SÓLO lectura, y con guarda.
//
// Las funciones que escriben (`audit`, `auditAdmin`, `auditPublic`, `requestIp`) viven en
// `@/lib/audit-core`, que a propósito no lleva `"use server"` — ver el comentario de ese
// archivo. Se re-exportan desde acá NO por conveniencia: `"use server"` obliga a que todo
// export sea una función async, y re-exportarlas las volvería a publicar como endpoint.
// Por eso NO se re-exportan. Quien audite, importa de `@/lib/audit-core`.

import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";
import {
  POR_PAGINA,
  leerFiltros,
  paginaValida,
  whereAuditoria,
  type FiltrosAuditoria,
} from "@/app/admin/(dashboard)/auditoria/filtros";

/**
 * Una página de la auditoría con los filtros pedidos (período, quién, qué y sobre qué).
 *
 * Es un endpoint ("use server"): `pedido` llega de afuera y se lee como texto no confiable,
 * igual que la URL de la pantalla (`leerFiltros`). El negocio lo pone el cliente de Prisma
 * del request (candado de tenant + RLS); acá no entra ningún tenantId. Los usuarios se leen
 * acá y no se reciben: un filtro "quién" sólo vale para una persona de ESTE negocio.
 */
export async function getAuditLog(pedido?: unknown) {
  await requireCapability("audit:read");
  const usuarios = await prisma.user.findMany({
    select: { id: true, name: true, active: true },
    orderBy: { name: "asc" },
  });
  const crudo =
    typeof pedido === "object" && pedido !== null && !Array.isArray(pedido)
      ? (pedido as Record<string, string | string[] | undefined>)
      : null;
  const pedidos = leerFiltros(crudo, new Set(usuarios.map((u) => u.id)));
  const where = whereAuditoria(pedidos);
  const total = await prisma.auditLog.count({ where });
  // Una página de más (un link viejo, un filtro que achicó la lista) muestra la última.
  const filtros: FiltrosAuditoria = { ...pedidos, pagina: paginaValida(pedidos.pagina, total) };
  const entradas = await prisma.auditLog.findMany({
    where,
    // El id desempata dos filas del mismo instante: sin él, una fila podría salir en dos
    // páginas o en ninguna.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (filtros.pagina - 1) * POR_PAGINA,
    take: POR_PAGINA,
  });
  return { entradas, total, filtros, usuarios, porPagina: POR_PAGINA };
}
