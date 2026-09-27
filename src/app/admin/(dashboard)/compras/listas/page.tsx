import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { todayInBusinessTz } from "@/lib/datetime";
import { costosVigentesEnTx } from "@/lib/stock/costo";
import { ButtonLink, PageContainer, PageHeader } from "@/components/ui";
import { leerListasDeProveedor } from "@/lib/supermercado/config-repo";
import ListasDeProveedores from "./ListasDeProveedores";

export const dynamic = "force-dynamic";

// LISTAS DE PROVEEDORES — se pega la lista de precios que mandó el proveedor, se ve qué costo
// cambió y cuánto, y queda guardada como costo de referencia para el precio por margen.
export default async function ListasPage() {
  await requireApp("listas-de-proveedores");
  const tenantId = await getCurrentTenantId();
  const [proveedores, listas, productos] = await Promise.all([
    prisma.supplier.findMany({ where: { tenantId, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    leerListasDeProveedor(prisma, tenantId),
    tenantTransaction(
      async (tx) => {
        const filas = await tx.product.findMany({
          where: { tenantId, deletedAt: null, codigo: { not: null } },
          select: { id: true, name: true, codigo: true },
          orderBy: { name: "asc" },
        });
        const costos = await costosVigentesEnTx(tx, tenantId, filas.map((f) => f.id));
        return filas.map((f) => ({ ...f, costo: costos.get(f.id) ?? null }));
      },
      { tenantId },
    ),
  ]);
  return (
    <PageContainer>
      <PageHeader
        title="Listas de proveedores"
        description="Pegá la lista de precios que te mandó el proveedor: ves qué costo cambió y queda como costo para poner precios por margen."
        actions={
          <>
            <ButtonLink href="/admin/proveedores" variant="outline">
              Proveedores
            </ButtonLink>
            <ButtonLink href="/admin/catalogo/precios" variant="outline">
              Actualizar precios
            </ButtonLink>
          </>
        }
      />
      <ListasDeProveedores
        proveedores={proveedores}
        listas={listas.map((l) => ({ proveedorId: l.proveedorId, cantidad: l.renglones.length, vigenteDesde: l.vigenteDesde, cargada: l.cargada.toISOString(), version: l.version }))}
        productos={productos}
        hoy={todayInBusinessTz()}
      />
    </PageContainer>
  );
}
