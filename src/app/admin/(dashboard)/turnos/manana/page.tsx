import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getMananaConfirmar } from "@/lib/actions";
import { PageHeader } from "@/components/ui";
import MananaConfirmar from "../MananaConfirmar";

export const dynamic = "force-dynamic";

// CONFIRMAR TURNOS DE MAÑANA — la misma sección que la agenda muestra en la vista de hoy
// (MananaConfirmar.tsx, `getMananaConfirmar`), como app propia con su botón en Recepción: la
// recepción la abre al final del día sin tener que ir a la agenda. Cada turno de mañana trae su
// WhatsApp con el recordatorio armado y queda "avisada HH:MM".

export default async function ConfirmarMananaPage() {
  await requireApp("confirmar-manana");
  const { dia, turnos } = await getMananaConfirmar();

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Confirmar turnos de mañana"
        description="Un toque por turno: se abre WhatsApp con el recordatorio listo y el turno queda marcado como avisado."
        actions={
          <Link href="/admin/turnos" className="inline-flex min-h-11 items-center text-sm text-muted hover:text-strong hover:underline">
            Ir a la agenda →
          </Link>
        }
      />
      <MananaConfirmar dia={dia} turnos={turnos} />
    </main>
  );
}
