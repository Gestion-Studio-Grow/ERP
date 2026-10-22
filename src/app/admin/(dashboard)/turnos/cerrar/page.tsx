// ============================================================================
// /admin/turnos/cerrar — «Cerrar lo pendiente» (Tanda 1 de la reingeniería de CH, §2.5).
// ============================================================================
//
// La pantalla que responde a la queja del dueño: los turnos que ya pasaron y nadie cerró, de
// cualquier día (no sólo hoy), en una bandeja compacta con lote. Lee con `turnosSinCerrar()`
// (src/lib/turnos/sin-cerrar.server.ts): `tenantId` + Reservado/Confirmado + hora pasada, con el
// veredicto de cobro de quien mira, y proyecta cada turno a lo mínimo que la bandeja muestra.
//
// REGLA DE INDEPENDENCIA DEL INTERRUPTOR (§0.2): la pantalla se viste con la piel «Renglón» por su
// cuenta —`data-diseno` propio en su contenedor (CerrarPendientes) y la hoja de la piel enlazada
// acá con `ConDiseno`—, así se ve bien para CH aunque «Diseño nuevo» esté apagado. Si está prendido,
// el layout ya enlazó la misma hoja y React no la repite.

import { requireApp } from "@/lib/require-app";
import { todayInBusinessTz } from "@/lib/datetime";
import { ConDiseno } from "@/lib/diseno/ConDiseno";
import { esteticaBackoffice } from "@/lib/estetica-backoffice";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { turnosSinCerrar } from "@/lib/turnos/sin-cerrar.server";
import CerrarPendientes from "./CerrarPendientes";
import type { TurnoPendiente } from "./cerrar-core";

export const metadata = { title: "Cerrar lo pendiente" };

export default async function CerrarLoPendientePage() {
  await requireApp("agenda");
  const [{ turnos, permisos }, slug] = await Promise.all([turnosSinCerrar(), getCurrentTenantSlug()]);
  // Campo por campo, sin spread: al navegador cruza sólo lo que la bandeja muestra.
  const pendientes: TurnoPendiente[] = turnos.map((t) => ({
    id: t.id,
    clienteId: t.clienteId,
    inicio: t.inicio,
    clienta: t.clienta,
    telefono: t.telefono,
    servicio: t.servicio,
    profesional: t.profesional,
    profesionalId: t.profesionalId,
    estado: t.estado,
    precio: t.precio,
    cobrado: t.cobrado,
    saldo: t.saldo,
    veredicto: t.veredicto,
  }));
  return (
    <ConDiseno nuevo precargarLetra={false}>
      <CerrarPendientes
        turnos={pendientes}
        permisos={{ cobrar: permisos.cobrar, terminar: permisos.terminar }}
        hoy={todayInBusinessTz()}
        letraDelNegocio={esteticaBackoffice(slug) !== null}
      />
    </ConDiseno>
  );
}
