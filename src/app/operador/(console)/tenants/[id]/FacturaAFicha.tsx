// Bloque de la ficha: la Factura A que asignó ARCA, sólo para un Responsable Inscripto. Servidor.
import { Bloque } from "@/components/ui/Renglon";
import { operatorPrisma } from "@/lib/operator-db";
import { ACCION_REGIMEN_FACTURA_A, ENTIDAD_REGIMEN_FACTURA_A, regimenVigente } from "@/lib/fiscal/regimen-factura-a";
import { RegimenFacturaAForm } from "./RegimenFacturaA";

export async function FacturaAFicha({ tenantId }: { tenantId: string }) {
  const t = await operatorPrisma.tenant.findUnique({ where: { id: tenantId }, select: { arcaCondicionIva: true } });
  if ((t?.arcaCondicionIva ?? "").trim() !== "RESPONSABLE_INSCRIPTO") return null;
  const filas = await operatorPrisma.auditLog.findMany({
    where: { tenantId, action: ACCION_REGIMEN_FACTURA_A, entity: ENTIDAD_REGIMEN_FACTURA_A, entityId: tenantId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
    select: { actor: true, changes: true },
  });
  return (
    <Bloque titulo="Factura A que le asignó ARCA" id="factura-a">
      <RegimenFacturaAForm tenantId={tenantId} actual={regimenVigente(filas)} />
    </Bloque>
  );
}
