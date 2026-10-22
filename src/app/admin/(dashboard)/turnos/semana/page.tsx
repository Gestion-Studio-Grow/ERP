// ============================================================================
// /admin/turnos/semana — la Semana de la agenda (reingeniería CH, Tanda 3 · §2.2, CH-036).
// ============================================================================
//
// Lun-sáb por profesional con el % de ocupación (descontando el horario de trabajo y los bloqueos) y los
// huecos de 30′ o más; tocar un día abre ese día, tocar una celda abre «Dar turno» con esa profesional y
// ese día. Lee con `agendaDelRango` (src/lib/turnos/agenda-rango.server.ts): una tanda de lecturas con
// `tenantId`, los turnos de los 7 días en UNA consulta. La cuenta es `armarSemana` (semana-core.ts).
//
// Regla de independencia del interruptor (§0.2): se viste con la piel «Renglón» por su cuenta
// (`PielPropia` + `ConDiseno nuevo`), como «Confirmar mañana».

import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { roleHasCapability } from "@/lib/capabilities";
import { todayInBusinessTz } from "@/lib/datetime";
import { agendaDelRango } from "@/lib/turnos/agenda-rango.server";
import { PageContainer, PageHeader, atributosBoton, buttonClasses } from "@/components/ui";
import { ConDiseno } from "@/lib/diseno/ConDiseno";
import { esteticaBackoffice } from "@/lib/estetica-backoffice";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import PielPropia from "../../armazon/PielPropia";
import { minutosDelDia } from "../grilla";
import { hrefNuevoTurno } from "../pasos";
import Semana from "../_agenda/Semana";
import { armarSemana, hrefDeLaSemana, leerSemana, lunesDe } from "../_agenda/semana-core";

export const dynamic = "force-dynamic";
export const metadata = { title: "Semana" };

export default async function SemanaPage({ searchParams }: { searchParams: Promise<{ desde?: string | string[] }> }) {
  const user = await requireApp("agenda");
  const hoy = todayInBusinessTz();
  const lunes = leerSemana((await searchParams).desde, hoy);
  const [agenda, slug] = await Promise.all([agendaDelRango(lunes), getCurrentTenantSlug()]);
  const ahora = new Date();
  const puedeDarTurno = roleHasCapability(user.role, "agenda:manage");
  const semana = armarSemana(agenda, { hoy, ahoraMin: minutosDelDia(ahora), puedeDarTurno, ahora });
  const estaSemana = lunesDe(hoy);

  return (
    <ConDiseno nuevo precargarLetra={false}>
      <PielPropia pantalla="semana" letraDelNegocio={esteticaBackoffice(slug) !== null} className="min-h-full bg-surface text-body">
        <PageContainer>
          <PageHeader
            title="Agenda · Semana"
            estado={[<strong key="s">{semana.titulo}</strong>, semana.totales.turnos === 1 ? "1 turno" : `${semana.totales.turnos} turnos`]}
            actions={
              puedeDarTurno ? (
                <Link href={hrefNuevoTurno(hoy)} className={buttonClasses("solid", "sm")} {...atributosBoton("solid", "sm")}>
                  + Dar turno
                </Link>
              ) : undefined
            }
          />
          <nav aria-label="Vistas de la agenda" className="mb-4 flex flex-wrap gap-4 border-b border-line text-sm">
            <Link href="/admin/turnos" className="inline-flex min-h-11 items-end px-1 pb-2 text-muted hover:text-strong">
              Día
            </Link>
            <span aria-current="page" className="inline-flex min-h-11 items-end border-b-2 border-accent px-1 pb-2 font-medium text-strong">
              Semana
            </span>
            {puedeDarTurno && (
              <Link href="/admin/turnos/lista" className="inline-flex min-h-11 items-end px-1 pb-2 text-muted hover:text-strong">
                Todos los turnos
              </Link>
            )}
          </nav>
          <nav aria-label="Cambiar de semana" className="mb-5 flex flex-wrap items-center gap-2">
            <Link href={hrefDeLaSemana(semana.anterior, hoy)} className={buttonClasses("outline", "sm")} {...atributosBoton("outline", "sm")}>
              ← Semana anterior
            </Link>
            {lunes !== estaSemana && (
              <Link href={hrefDeLaSemana(estaSemana, hoy)} className={buttonClasses("ghost", "sm")} {...atributosBoton("ghost", "sm")}>
                Esta semana
              </Link>
            )}
            <Link href={hrefDeLaSemana(semana.siguiente, hoy)} className={buttonClasses("outline", "sm")} {...atributosBoton("outline", "sm")}>
              Semana siguiente →
            </Link>
          </nav>
          <Semana semana={semana} verPlata={roleHasCapability(user.role, "reports:read")} />
        </PageContainer>
      </PielPropia>
    </ConDiseno>
  );
}
