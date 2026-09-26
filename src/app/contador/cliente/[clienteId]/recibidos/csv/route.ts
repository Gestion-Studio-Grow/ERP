// Listado exportable de las compras con factura de un mes de un cliente de la cartera.
// El estudio y el permiso salen de la sesión; el cliente se verifica contra la cartera.

import { tenantTransaction } from "@/lib/rls";
import { esMesKey } from "@/lib/libros/fecha-fiscal";
import { cabecerasCsv } from "@/lib/libros/csv-ar";
import { MES_DEMASIADO_GRANDE, accesoAClienteDeCartera, leerComprasConFactura } from "@/lib/contador/recibidos-db";
import { csvComprasConFactura } from "@/lib/contador/recibidos-export";

export async function GET(req: Request, ctx: { params: Promise<{ clienteId: string }> }) {
  const { clienteId } = await ctx.params;
  const mes = new URL(req.url).searchParams.get("mes");
  if (!esMesKey(mes)) return new Response("Elegí un mes (AAAA-MM).", { status: 400 });
  const acceso = await accesoAClienteDeCartera(clienteId, false);
  if (!acceso.ok) return new Response(acceso.error, { status: 404 });
  const { compras, completa } = await tenantTransaction((tx) => leerComprasConFactura(tx, acceso.cliente.id, mes), {
    tenantId: acceso.cliente.id,
  });
  // Nunca un archivo recortado: para el libro de IVA compras, una lista incompleta es un error.
  if (!completa) return new Response(MES_DEMASIADO_GRANDE, { status: 413 });
  const nombre = `compras-${acceso.cliente.alias}-${mes}.csv`;
  return new Response(csvComprasConFactura(compras), { headers: cabecerasCsv(nombre) });
}
