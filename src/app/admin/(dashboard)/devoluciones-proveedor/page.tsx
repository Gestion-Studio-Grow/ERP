import { requireCapability } from "@/lib/authz";
import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

// SHELL navegable de la edición Empresa (BMK · Devoluciones a proveedor). Se
// recorre en preview detrás de los flags, sin datos reales. "Lista para vivo"
// recién con su lógica (puede terminar siendo sub-pantalla de Compras, S1).
// Cero schema, cero Neon.
export default async function DevolucionesProveedorPage() {
  await requireCapability("catalog:manage");
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader
        title="Devoluciones a proveedor"
        description="Mercadería que se devuelve al proveedor (falla, vencimiento, error de pedido) y descuenta su stock."
      />
      <EmptyState
        icon={
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 14l-4-4 4-4" />
            <path d="M5 10h9a5 5 0 010 10h-2" />
          </svg>
        }
        title="En preparación"
        description="Función de la edición Empresa. Todavía no registra devoluciones reales: llega con su lógica y su modelo de datos."
      />
    </main>
  );
}
