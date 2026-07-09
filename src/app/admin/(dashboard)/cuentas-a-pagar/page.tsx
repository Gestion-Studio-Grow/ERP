import { requireCapability } from "@/lib/authz";
import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

// SHELL navegable de la edición Empresa (J59 · Cuentas a pagar). Existe y se
// recorre en preview detrás de los flags (nav agrupada + perfil), sin datos
// reales: "lista para vivo" recién cuando tenga su lógica + modelo de datos
// (§C · entidad de cuentas a pagar / cheque diferido). Guard por capability ya
// puesto para el día que se encienda de verdad. Cero schema, cero Neon.
export default async function CuentasAPagarPage() {
  await requireCapability("billing:manage");
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader
        title="Cuentas a pagar"
        description="Órdenes de pago a proveedores, con cheque diferido: fecha, banco y saldo pendiente por proveedor."
      />
      <EmptyState
        icon={
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="6" width="18" height="13" rx="2" />
            <path d="M3 10h18M12 17v-4M10 15l2-2 2 2" />
          </svg>
        }
        title="En preparación"
        description="Función de la edición Empresa. Todavía no gestiona pagos reales: la carga de órdenes y el cheque diferido llegan con su lógica y su modelo de datos."
      />
    </main>
  );
}
