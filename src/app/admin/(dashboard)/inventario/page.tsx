import { requireCapability } from "@/lib/authz";
import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

// SHELL navegable de la edición Empresa (BMC · Inventario / recuento físico). Se
// recorre en preview detrás de los flags, sin datos reales. Nota: el mínimo
// anti-oversell ya lo cubren Compras + Ajustes sobre el ledger (S1); el recuento
// físico formal es la profundización que llega con su lógica. Su clasificación
// de perfil/rubro vive al vivo (S1: rubro-gated); acá es shell Empresa para poder
// recorrerlo. Cero schema, cero Neon.
export default async function InventarioPage() {
  await requireCapability("catalog:manage");
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader
        title="Inventario"
        description="Recuento físico del stock y su conciliación con el sistema: qué hay en góndola vs. qué dice el sistema, con su diferencia."
      />
      <EmptyState
        icon={
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 7l9-4 9 4-9 4-9-4z" />
            <path d="M3 7v10l9 4 9-4V7M12 11v10" />
          </svg>
        }
        title="En preparación"
        description="Función de la edición Empresa. Todavía no gestiona recuentos reales: llega con su lógica y su modelo de datos."
      />
    </main>
  );
}
