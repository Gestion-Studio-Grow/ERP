// ============================================================================
// El LIBRO IVA DE UN CUIT con varios locales — la casa y sus locales del mismo CUIT. SERVIDOR.
// ============================================================================
//
// QA vuelta 6, bloqueante 2: una PyME con dos locales (mismo CUIT, puntos de venta 3 y 4) le mandaba
// a la contadora sólo las ventas de la casa. El IVA se declara por CUIT: el libro de la casa suma
// cada local del MISMO CUIT de su red, cada comprobante con su punto de venta. Nunca uno de otro CUIT
// (`localesDelMismoCuit`), aunque haya quedado un vínculo viejo.
//
// Cada negocio se lee en SU `tenantTransaction` (el GUC de RLS de ese negocio); las filas de la red,
// con el GUC de la casa. El negocio lo decide quien llama (la dueña: el del request; la contadora:
// un cliente ya verificado de su cartera). Sin "use server": recibe un tenantId.

import "server-only";
import { basePrisma } from "@/lib/prisma-base";
import { tenantTransaction } from "@/lib/rls";
import { localesDelMismoCuit } from "@/lib/multilocal/multilocal-core";
import type { MesKey } from "./fecha-fiscal";
import { armarLibroIva, condicionDelNegocio, unirFilasDelCuit, whereComprobantesDelMes, type LibroIva } from "./libro-iva";
import { leerFilasLibroIva } from "./libro-iva-loader";

/**
 * `corte`: el instante del congelado. El paquete FINAL lee con él y queda fijo (libro-iva.ts,
 * `whereAutorizadosHasta`); la pantalla lee sin corte, lo que hay hoy.
 */
export async function leerLibroIvaDelCuit(tenantId: string, mes: MesKey, opts: { corte?: Date | null } = {}): Promise<LibroIva> {
  const corte = opts.corte ?? null;
  // Tenant está fuera de RLS por diseño; se lee con el id que ya decidió quien llama.
  const casa = await basePrisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, arcaCuit: true, arcaPuntoVenta: true, modules: true },
  });
  const propias = await tenantTransaction((tx) => leerFilasLibroIva(tx, tenantId, mes, corte), { tenantId });
  const locales = casa && casa.modules.includes("multilocal") ? await localesDeLaCasa(tenantId, casa) : [];
  const partes = [propias];
  for (const l of locales) {
    partes.push(await tenantTransaction((tx) => leerFilasLibroIva(tx, l.id, mes, corte), { tenantId: l.id }));
  }
  const f = unirFilasDelCuit(partes);
  return armarLibroIva({
    ...f,
    condicion: condicionDelNegocio(f.condicionCargada, f.tiposEmitidos),
    negocios: [
      { nombre: casa?.name ?? "", puntoVenta: casa?.arcaPuntoVenta ?? null },
      ...locales.map((l) => ({ nombre: l.name, puntoVenta: l.arcaPuntoVenta })),
    ],
  });
}

/**
 * Los locales del MISMO CUIT que suma el libro de la casa: los mismos que entran al paquete. Vacío si el
 * negocio no es casa de una red. El cierre del mes los mira antes de congelar (cierre-mes/lectura.ts).
 */
export async function localesDelCuitDeLaCasa(casaId: string): Promise<{ id: string; name: string; arcaPuntoVenta: number | null }[]> {
  const casa = await basePrisma.tenant.findUnique({ where: { id: casaId }, select: { arcaCuit: true, modules: true } });
  return casa && casa.modules.includes("multilocal") ? localesDeLaCasa(casaId, casa) : [];
}

/**
 * El IVA de los comprobantes del mes de cada local del mismo CUIT, por tipo: lo que el botón del Libro
 * IVA del Inicio le suma a la casa, con el MISMO where que la pantalla (refutador, vuelta 4). Vacío si
 * no es casa de una red. Cada local en SU transacción.
 */
export async function ivaDeLosLocalesDelCuit(casaId: string, mes: MesKey): Promise<{ tipoComprobante: number | null; iva: number }[]> {
  const out: { tipoComprobante: number | null; iva: number }[] = [];
  for (const l of await localesDelCuitDeLaCasa(casaId)) {
    const grupos = await tenantTransaction(
      (tx) => tx.invoice.groupBy({ by: ["tipoComprobante"], where: whereComprobantesDelMes(l.id, mes), _sum: { iva: true } }),
      { tenantId: l.id },
    );
    out.push(...grupos.map((g) => ({ tipoComprobante: g.tipoComprobante, iva: Number(g._sum.iva ?? 0) })));
  }
  return out;
}

async function localesDeLaCasa(casaId: string, casa: { arcaCuit: string | null; modules: string[] }) {
  const filas = await tenantTransaction(
    (tx) => tx.carteraCliente.findMany({ where: { tenantId: casaId, estado: "activa" }, select: { clienteTenantId: true } }),
    { tenantId: casaId },
  );
  const ids = filas.map((f) => f.clienteTenantId).filter((id) => id !== casaId);
  if (ids.length === 0) return [];
  const negocios = await basePrisma.tenant.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, arcaCuit: true, arcaPuntoVenta: true },
    orderBy: [{ arcaPuntoVenta: "asc" }, { name: "asc" }],
  });
  return localesDelMismoCuit(casa, negocios);
}
