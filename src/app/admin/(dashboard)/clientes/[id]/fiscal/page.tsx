// DATOS PARA FACTURAR de una ficha (R1-F5). Con candado: sólo existe para un negocio Responsable
// Inscripto, que es el que decide la letra con la ficha del cliente. Para los demás (CH factura C)
// la página no existe y nada cambia.
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { canCurrentUser } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { buttonClasses } from "@/components/ui";
import FichaFiscalForm from "../FichaFiscalForm";

export default async function DatosParaFacturarPage({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("clientes");
  const { id } = await params;
  if (!(await canCurrentUser("clients:manage"))) notFound();
  // `Tenant` está fuera de RLS (ADR-018): se lee por el id de la sesión, nunca por parámetro.
  const tenantId = await getCurrentTenantId();
  const negocio = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { arcaCondicionIva: true } });
  if (negocio?.arcaCondicionIva !== "RESPONSABLE_INSCRIPTO") notFound();
  const cliente = await tenantTransaction((tx) =>
    tx.client.findFirst({
      where: { id },
      select: { id: true, name: true, docTipo: true, docNro: true, razonSocial: true, condicionIva: true, domicilio: true },
    }),
  );
  if (!cliente) notFound();
  const { id: clienteId, name, ...ficha } = cliente;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <Link href={`/admin/clientes/${clienteId}`} className={buttonClasses("ghost", "md")}>
        ← Volver a la ficha
      </Link>
      <h1 className="text-xl font-semibold">Datos para facturar a {name}</h1>
      <p className="text-sm text-ink-muted">
        Con estos datos el sistema decide la letra de la factura: A a responsables inscriptos y monotributistas, B a consumidores
        finales y exentos. Si no cargás nada, la venta sale como consumidor final.
      </p>
      <FichaFiscalForm clienteId={clienteId} ficha={ficha} />
    </div>
  );
}
