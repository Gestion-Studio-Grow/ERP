// FACTOQUE · Mi cuenta → Botón de arrepentimiento / Darme de baja, con la sesión del negocio: se
// procesa en el acto (el plan pago vuelve a Gratis) sin más pasos. Ver src/lib/factoque-tramites.ts.

import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireCapability } from "@/lib/authz";
import { sesionFacturita } from "@/lib/facturita-sesion.server";
import { tenantTransaction } from "@/lib/rls";
import { tramiteDeMiCuentaAction } from "@/lib/factoque-tramites-actions";
import { esTipoTramite, NOMBRE_TRAMITE } from "@/lib/factoque-tramites";
import FormularioTramite from "../../../FormularioTramite";

export const dynamic = "force-dynamic";

const BAJADA = {
  arrepentimiento:
    "Si contrataste Plus o Pro hace 10 días corridos o menos, te arrepentís sin costo y sin explicaciones: volvés a Gratis ahora mismo y te devolvemos lo que pagaste por el mismo medio.",
  baja: "Tu plan pago se da de baja ahora mismo y volvés a Gratis, sin costo: no se te cobra más. Las facturas que emitiste siguen valiendo. Si ya estás en Gratis, queda registrado el pedido de cerrar la cuenta y lo hacemos nosotros.",
} as const;

export default async function TramitePage({ searchParams }: { searchParams: Promise<{ tipo?: string | string[] }> }) {
  const [q, { tenantId }, user] = await Promise.all([searchParams, sesionFacturita(), requireCapability("billing:manage")]);
  const tipo = esTipoTramite(q.tipo) ? q.tipo : "baja";
  const negocio = await tenantTransaction((tx) => tx.tenant.findUnique({ where: { id: tenantId }, select: { arcaCuit: true } }), { tenantId });
  return (
    <>
      <PageHeader title={tipo === "baja" ? "Darme de baja" : NOMBRE_TRAMITE[tipo]} description={BAJADA[tipo]} />
      <div className="max-w-xl">
        <FormularioTramite
          tipo={tipo}
          accion={tramiteDeMiCuentaAction}
          emailInicial={user.email}
          cuitInicial={negocio?.arcaCuit ?? ""}
          boton={tipo === "baja" ? "Darme de baja" : "Me arrepiento"}
        />
        <p className="mt-6 text-sm">
          <Link href="/facturita/app/cuenta" className="font-medium text-strong underline underline-offset-4">
            Volver a Mi cuenta
          </Link>
        </p>
      </div>
    </>
  );
}
