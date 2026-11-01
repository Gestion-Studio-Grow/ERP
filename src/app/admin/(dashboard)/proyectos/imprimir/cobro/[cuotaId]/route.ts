// Constancia de un cobro ya registrado. No es un comprobante fiscal: la factura sale de Facturación.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fechaCorta } from "@/lib/proyectos/core";
import { datosDelNegocio } from "@/lib/proyectos/datos.server";
import { exigirVer, filtroDeProyectos } from "@/lib/proyectos/gestion.server";
import { pdfDeConstancia } from "@/lib/proyectos/papel-pdf";
import { requireApp } from "@/lib/require-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ cuotaId: string }> }) {
  await requireApp("proyectos");
  const a = await exigirVer("pagos");
  const { cuotaId } = await params;
  const c = await prisma.proyectoCuota.findFirst({
    where: { id: cuotaId, tenantId: a.tenantId, tipo: "COBRO", anuladoEl: null, pagadoEl: { not: null }, proyecto: filtroDeProyectos(a) },
    select: { id: true, concepto: true, monto: true, moneda: true, pagadoEl: true, medio: true, factura: true, proyecto: { select: { nombre: true, client: { select: { name: true } } } } },
  });
  if (!c?.proyecto) return new NextResponse("No encontrado", { status: 404 });
  const numero = c.id.slice(-8).toUpperCase();
  const negocio = await datosDelNegocio(a.tenantId);
  const bytes = await pdfDeConstancia({ negocio: negocio.nombre, numero, fecha: fechaCorta(c.pagadoEl), cliente: c.proyecto.client.name, proyecto: c.proyecto.nombre, concepto: c.concepto, monto: c.monto, moneda: c.moneda, medio: c.medio, factura: c.factura });
  return new NextResponse(Buffer.from(bytes), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="constancia-de-cobro-${numero}.pdf"`, "cache-control": "no-store" },
  });
}
