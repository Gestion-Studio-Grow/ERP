// O30 · `GET …/proveedores/iva/csv?mes=AAAA-MM`: el IVA crédito del mes para el contador. Misma consulta que la pantalla.
import { requireApp } from "@/lib/require-app";
import { veLaPlata } from "@/lib/proyectos/datos.server";
import { exigirVer } from "@/lib/proyectos/gestion.server";
import { ivaCreditoDelPeriodo, siHayM1 } from "@/lib/proyectos/comprobantes.server";
import { mesDelParametro } from "@/lib/proyectos/comprobantes-core";
import { csvIvaCredito } from "@/lib/proyectos/iva-credito-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await requireApp("gestion-proveedores");
  const a = await exigirVer("proveedores");
  if (!veLaPlata(a.user)) return new Response("No autorizado.", { status: 403 });
  const mes = mesDelParametro(new URL(request.url).searchParams.get("mes"));
  const datos = await siHayM1(() => ivaCreditoDelPeriodo(a.tenantId, mes));
  if (!datos) return new Response("Falta una actualización de la base.", { status: 409 });
  const csv = csvIvaCredito(mes, datos.renglones.map((r) => ({ fecha: r.fecha, tipo: r.tipo, numero: r.numero, proveedor: r.supplier.name, cuit: r.supplier.taxId, neto: r.neto, iva: r.iva })));
  // BOM para que Excel en Windows abra bien los acentos (mismo criterio que el libro de caja).
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="iva-credito-${mes}.csv"`, "Cache-Control": "no-store" },
  });
}
