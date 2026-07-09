import { requireCapability } from "@/lib/authz";
import { PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

// SHELL navegable de la edición Empresa (2F3/J60 · Cuentas a cobrar / fiado). Se
// recorre en preview detrás de los flags, sin datos reales. Nota: al vivo el
// fiado es rubro-gated y default-OFF (S1: cultura de comercio de barrio, versión
// light para Comercio); acá es shell Empresa para poder recorrerlo. "Lista para
// vivo" recién con su lógica y su modelo de datos. Cero schema, cero Neon.
export default async function CuentasACobrarPage() {
  await requireCapability("billing:manage");
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader
        title="Cuentas a cobrar"
        description="Fiado y saldos de clientes: quién te debe, cuánto y desde cuándo, con vencimientos y recordatorios."
      />
      <EmptyState
        icon={
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20c0-3.6 3.1-6 7-6 1 0 2 .15 2.8.44M17 14v6M14 17h6" />
          </svg>
        }
        title="En preparación"
        description="Función de la edición Empresa. Todavía no gestiona saldos reales: el fiado, los vencimientos y los recordatorios llegan con su lógica y su modelo de datos."
      />
    </main>
  );
}
