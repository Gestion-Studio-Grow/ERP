import { requireCapability } from "@/lib/authz";
import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

// SHELL navegable de la edición Empresa (J58 · Contabilidad). Se recorre en
// preview detrás de los flags, sin datos reales. "Lista para vivo" recién con su
// lógica: el set validado (S1) arranca por un "Exportar para el contador" antes
// que un libro mayor completo. Cero schema, cero Neon.
export default async function ContabilidadPage() {
  await requireCapability("reports:read");
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader
        title="Contabilidad"
        description="Libro mayor simple y exportable para tu contador (Tango, Colppy y afines), sobre los movimientos ya registrados."
      />
      <EmptyState
        icon={
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 4h11a2 2 0 012 2v14H8a2 2 0 01-2-2z" />
            <path d="M9 8h7M9 12h7M9 16h4" />
          </svg>
        }
        title="En preparación"
        description="Función de la edición Empresa. Todavía no exporta datos reales: la salida para el contador llega con su lógica de datos."
      />
    </main>
  );
}
