import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getAgendaDay, getMananaConfirmar } from "@/lib/actions";
import { roleHasCapability } from "@/lib/capabilities";
import { PageContainer, PageHeader, atributosBoton, buttonClasses } from "@/components/ui";
import { ConDiseno } from "@/lib/diseno/ConDiseno";
import { esteticaBackoffice } from "@/lib/estetica-backoffice";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import PielPropia from "../../armazon/PielPropia";
import BotonBuscar from "../../armazon/BotonBuscar";
import { ListaDeManana } from "../_agenda/ParaManana";
import { fechaLarga, type TurnoDelDia } from "../agenda-core";
import { proyectarAgenda } from "../agenda.server";

export const dynamic = "force-dynamic";

// CONFIRMAR TURNOS DE MAÑANA — app propia con su botón en Recepción: la recepción la abre al final
// del día sin ir a la agenda. Cada turno de mañana trae su WhatsApp con el recordatorio armado y queda
// "avisada HH:MM".
//
// REINGENIERÍA CH, TANDA 2 (§3.2, CH-027): la lista en renglones con las respuestas de cada clienta
// ([Confirmó] [Quiere cambiar] [Cancela]) y el contador «7 avisadas · 5 confirmadas · 1 cambia ·
// 1 cancela». Regla de independencia del interruptor (§0.2): se viste con la piel «Renglón» POR SU
// CUENTA (`PielPropia` + `ConDiseno nuevo`), así CH la ve con «Diseño nuevo» apagado. Reemplaza a la
// pantalla vieja (MananaConfirmar, que sigue en la agenda de siempre).
//
// Los datos: `getMananaConfirmar` (el texto del recordatorio y «avisada») y la agenda de mañana
// (`getAgendaDay` → `proyectarAgenda`, el mismo loader y el mismo recorte por rol de la agenda) para
// lo que piden mover y cancelar: el servicio, la profesional, lo cobrado y el veredicto de cobro.
// Al navegador cruza sólo lo de los turnos de esta lista.

export default async function ConfirmarMananaPage() {
  const user = await requireApp("confirmar-manana");
  const { dia, turnos } = await getMananaConfirmar();
  const [agenda, slug] = await Promise.all([turnos.length > 0 ? getAgendaDay(dia) : Promise.resolve(null), getCurrentTenantSlug()]);
  const deLaLista = new Set(turnos.map((t) => t.id));
  const detalle: Record<string, TurnoDelDia> = {};
  if (agenda) {
    for (const t of proyectarAgenda(agenda, { role: user.role, professionalId: user.professionalId }).turnos) {
      if (deLaLista.has(t.id)) detalle[t.id] = t;
    }
  }
  const sinConfirmar = turnos.filter((t) => t.status === "PENDING").length;

  return (
    <ConDiseno nuevo precargarLetra={false}>
      <PielPropia pantalla="confirmar-manana" letraDelNegocio={esteticaBackoffice(slug) !== null} className="min-h-full bg-surface text-body">
        <PageContainer>
          <PageHeader
            title="Confirmar turnos de mañana"
            estado={[
              <strong key="d">{fechaLarga(dia)}</strong>,
              turnos.length === 0 ? "sin turnos" : turnos.length === 1 ? "1 turno" : `${turnos.length} turnos`,
              sinConfirmar > 0 ? `${sinConfirmar} sin confirmar` : null,
            ]}
            actions={
              <>
                <BotonBuscar />
                <Link href="/admin/turnos" className={buttonClasses("ghost", "sm")} {...atributosBoton("ghost", "sm")}>
                  Ir a la agenda →
                </Link>
              </>
            }
          />
          {turnos.length === 0 ? (
            <p className="border-t border-line-strong py-4 text-sm text-muted">
              Mañana no hay turnos. Si alguien llama, dale el turno desde «Dar un turno».
            </p>
          ) : (
            <div data-agenda="manana">
              <ListaDeManana dia={dia} turnos={turnos} detalle={detalle} cobra={roleHasCapability(user.role, "agenda:collect")} />
            </div>
          )}
        </PageContainer>
      </PielPropia>
    </ConDiseno>
  );
}
