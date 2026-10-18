// ============================================================================
// Descriptor del módulo CLUB — la gestión de un club de pádel (canchas, la cuenta del turno).
// ============================================================================
//
// Plan: docs/producto/PLAN-TERMINALES-MOSTRADOR.md §4 y BP-2. Es el pase de Break Point del
// backoffice vanilla (public/previews/breakpoint/club) al ERP React: la agenda de canchas del día y
// la cuenta del turno (la cancha y los cargos de cada jugador, cobrar todo, cobrar a uno, «a cargo
// de», «cobrar la cancha y cerrarla · la mesa sigue»). Las reglas de plata son las del motor del
// club (src/lib/club/motor.mjs, copia controlada BP-1).
//
// kind: "capability" (nativo: src/lib/club + src/app/admin/(dashboard)/club). El motor corre en el
// navegador. Con jornada real (Break Point, desde el 18/10/2026) el estado se guarda en la base como
// una FOTO en `AuditLog` (entidad `ClubEstado`, src/lib/club/estado-repo.ts, «modo foto» sin
// migración): por eso `migraciones: []`. Los demás negocios, y `?demo=1`, corren la demo sin tocar
// la base. El schema relacional del plugin llega en BP-4 (Gate 2).
//
// capability "agenda:manage": la pantalla opera la agenda y cobra (abrir la cancha, cobrar, «a
// cargo de»), que es exactamente esa capability (src/lib/capabilities.ts: «crear/mover/cancelar
// turnos, cobrar»). La tienen OWNER y RECEPTION; el PROFESSIONAL (agenda:read) no ve la cuenta de
// todo el club. El plan sugería agenda:read, que es la de la agenda de CH porque el profesional ve
// SU agenda; en el club no hay agenda por profesional.
//
// `rubros: "todos"` es COMPATIBILIDAD, no asignación (ADR-054/055), como taller y terminal: no hay
// blueprint `club` (el `padel` que existe es la TIENDA de A Dos Manos, src/blueprints/retail) y la
// compatibilidad se evalúa contra el blueprint del negocio, que para Break Point no está fijado en el
// repo. Ningún negocio lo recibe por defecto ni por blueprint; se asigna en `Tenant.modules[]` con el
// OK del dueño el día de corte (§4.5).

import type { ModuleDescriptor } from "../contract";

export const clubModule: ModuleDescriptor = {
  id: "club",
  version: "0.1.0",
  nombre: "Club de pádel",
  descripcion:
    "La agenda de canchas del día y la cuenta de cada turno: la cancha y los cargos de cada jugador, cobrar todo o a uno, y «a cargo de».",
  kind: "capability",
  capability: "agenda:manage",
  rubros: "todos",
  dependencias: [
    { id: "clients", rango: "^1.0" },
    { id: "pos", rango: "^1.0" },
  ],
  grupo: "agenda-turnos",
  resumen: "La recepción del club en una tablet: qué cancha está ocupada, quién debe y cobrarle a cada uno sin hacer cuentas.",
  fit: "Clubes de pádel o de tenis con canchas por turno, buffet y cobro por jugador.",
  scopeItems: [
    { label: "Agenda de canchas del día" },
    { label: "Cuenta del turno: cancha y cargos de cada jugador" },
    { label: "Cobrar todo, cobrar a un jugador y «a cargo de»" },
    { label: "Cobrar la cancha y cerrarla mientras la mesa sigue" },
  ],
  migraciones: [],
};
