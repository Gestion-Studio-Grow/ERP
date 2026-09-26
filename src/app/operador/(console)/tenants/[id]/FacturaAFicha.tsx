// Bloque de la ficha: la Factura A que asignó ARCA, sólo para un Responsable Inscripto. Servidor.
// Con RLS (la consola está sujeta a RLS en producción): la clase vive en el registro del negocio, que
// se lee parado en él (`enElNegocio`). `Tenant` no tiene RLS y se lee directo.
import { Bloque } from "@/components/ui/Renglon";
import { enElNegocio, operatorPrisma } from "@/lib/operator-db";
import { leerRegimenFacturaAEnTx } from "@/lib/fiscal/regimen-factura-a.server";
import { RegimenFacturaAForm } from "./RegimenFacturaA";

export async function FacturaAFicha({ tenantId }: { tenantId: string }) {
  const t = await operatorPrisma.tenant.findUnique({ where: { id: tenantId }, select: { arcaCondicionIva: true } });
  if ((t?.arcaCondicionIva ?? "").trim() !== "RESPONSABLE_INSCRIPTO") return null;
  const actual = await enElNegocio(tenantId, (tx) => leerRegimenFacturaAEnTx(tx, tenantId));
  return (
    <Bloque titulo="Factura A que le asignó ARCA" id="factura-a">
      <RegimenFacturaAForm tenantId={tenantId} actual={actual} />
    </Bloque>
  );
}
