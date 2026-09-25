import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getMananaConfirmar } from "@/lib/actions";
import { PageContainer, PageHeader, atributosBoton, buttonClasses } from "@/components/ui";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import MananaConfirmar from "../MananaConfirmar";
import { ListaDeManana } from "../_agenda/ParaManana";
import { fechaLarga } from "../agenda-core";

export const dynamic = "force-dynamic";

// CONFIRMAR TURNOS DE MAÑANA — la misma sección que la agenda muestra en la vista de hoy
// (MananaConfirmar.tsx, `getMananaConfirmar`), como app propia con su botón en Recepción: la
// recepción la abre al final del día sin tener que ir a la agenda. Cada turno de mañana trae su
// WhatsApp con el recordatorio armado y queda "avisada HH:MM".
//
// DISEÑO NUEVO («Renglón»): la misma lista, en renglones (ListaDeManana, la que abre «Ver la
// lista» desde el pie de la agenda), con la línea de estado en lugar del párrafo. Mismos datos,
// mismas acciones. Con el interruptor apagado, la pantalla de siempre.

export default async function ConfirmarMananaPage() {
  await requireApp("confirmar-manana");
  const [{ dia, turnos }, nuevo] = await Promise.all([getMananaConfirmar(), disenoNuevo()]);

  if (nuevo) {
    const sinAvisar = turnos.filter((t) => !t.avisadaEl).length;
    const sinConfirmar = turnos.filter((t) => t.status === "PENDING").length;
    return (
      <PageContainer>
        <PageHeader
          title="Confirmar turnos de mañana"
          estado={[
            <strong key="d">{fechaLarga(dia)}</strong>,
            turnos.length === 0 ? "sin turnos" : turnos.length === 1 ? "1 turno" : `${turnos.length} turnos`,
            turnos.length > 0 ? (sinAvisar > 0 ? `${sinAvisar} sin avisar` : "todas avisadas") : null,
            sinConfirmar > 0 ? `${sinConfirmar} sin confirmar` : null,
          ]}
          actions={
            <Link href="/admin/turnos" className={buttonClasses("ghost", "sm")} {...atributosBoton("ghost", "sm")}>
              Ir a la agenda →
            </Link>
          }
        />
        {turnos.length === 0 ? (
          <p className="border-t border-line-strong py-4 text-sm text-muted">
            Mañana no hay turnos. Si alguien llama, dale el turno desde «Dar un turno».
          </p>
        ) : (
          <div data-agenda="manana">
            <ListaDeManana dia={dia} turnos={turnos} />
          </div>
        )}
      </PageContainer>
    );
  }

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
