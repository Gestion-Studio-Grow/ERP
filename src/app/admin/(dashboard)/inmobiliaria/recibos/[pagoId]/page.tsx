import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { reciboAdmin } from "@/lib/inmobiliaria/datos.server";
import { origenDelSitio } from "@/lib/inmobiliaria/sitio.server";
import { marcaInmo } from "@/lib/inmobiliaria/marca";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { armarMensaje, nombrePeriodo, pesos } from "@/lib/inmobiliaria/core";
import { configInmo } from "@/lib/inmobiliaria/datos.server";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { Recibo } from "@/components/inmobiliaria/Recibo";
import { AccionesRecibo } from "@/components/inmobiliaria/recibo-piezas";
import { RAIZ } from "../../_vista";

// El recibo de un cobro, para imprimir o mandar. Sólo quien ve la plata.
export const dynamic = "force-dynamic";
export const metadata = { title: "Inmobiliaria · Recibo" };

export default async function ReciboDeCobro({ params }: { params: Promise<{ pagoId: string }> }) {
  await requireApp("inmobiliaria");
  await requireCapability("agenda:manage");
  const { pagoId } = await params;
  const [origen, slug, tenantId] = await Promise.all([origenDelSitio(), getCurrentTenantSlug(), getCurrentTenantId()]);
  const d = await reciboAdmin(pagoId, origen);
  if (!d) notFound();
  const [config, pago] = await Promise.all([
    configInmo(tenantId),
    prisma.inmoPago.findFirst({ where: { id: pagoId, tenantId }, select: { cuota: { select: { contratoId: true, contrato: { select: { inquilino: { select: { phone: true } } } } } } } }),
  ]);
  const mensaje = armarMensaje(config.plantillas.recibo, { nombre: d.inquilino.split(" ")[0], monto: pesos(d.monto), propiedad: d.propiedad, periodo: nombrePeriodo(d.periodo), link: d.link });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <p className="mb-3 text-sm">
        <Link href={pago ? `${RAIZ}/alquileres/${pago.cuota.contratoId}` : `${RAIZ}/alquileres`} className="inline-flex min-h-11 items-center underline">
          ← Volver al contrato
        </Link>
      </p>
      <Recibo d={d} marca={marcaInmo(slug)} />
      <AccionesRecibo link={d.link} telefono={pago?.cuota.contrato.inquilino.phone} mensaje={mensaje} />
    </main>
  );
}
