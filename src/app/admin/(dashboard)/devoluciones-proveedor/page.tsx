import { requireCapability } from "@/lib/authz";
import { getActiveProfile } from "@/lib/profile-gating";
import { getReturnablePurchases, getReturnsHistory } from "@/lib/devoluciones/loader";
import { PageHeader, EmptyState } from "@/components/ui";
import { ReturnForm } from "@/components/devoluciones/ReturnForm";
import { ReturnHistoryTable } from "@/components/devoluciones/ReturnHistoryTable";
import { registerReturn } from "./actions";

export const dynamic = "force-dynamic";

// Devoluciones a proveedor (ADR-060 D4). perfilMin=enterprise. Al confirmar, el servicio
// de S1 asienta el movimiento de stock (salida DEVOLUCION_PROVEEDOR) + el crédito en la
// cuenta a pagar del proveedor. Datos vía loader (hoy stub de S1) → sin dead-end.
export default async function DevolucionesProveedorPage() {
  await requireCapability("catalog:manage");
  const profile = await getActiveProfile();
  if (profile !== "enterprise") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <PageHeader title="Devoluciones a proveedor" description="Devolución de mercadería a proveedores." />
        <EmptyState title="Disponible en la edición Empresa" description="Las devoluciones a proveedor son parte de la edición Empresa." />
      </main>
    );
  }

  const [purchases, history] = await Promise.all([getReturnablePurchases(), getReturnsHistory()]);

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8 space-y-8">
      <PageHeader
        title="Devoluciones a proveedor"
        description="Devolvé mercadería a un proveedor (falla, vencimiento, error de pedido): se descuenta del stock y genera un crédito en la cuenta a pagar del proveedor."
      />

      <section>
        <h2 className="mb-3 text-lg font-semibold text-strong">Nueva devolución</h2>
        <ReturnForm purchases={purchases} action={registerReturn} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-strong">Historial</h2>
        <ReturnHistoryTable rows={history} />
      </section>
    </main>
  );
}
