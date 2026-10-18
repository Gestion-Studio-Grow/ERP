// ============================================================================
// QUIÉN OPERA EL CLUB — el ÚNICO lugar donde Clientes, el Tablero y el aviso 🔔 leen la persona del mostrador.
// ============================================================================
//
// Lee `almacen.operador()`: en la demo, el usuario de ejemplo del rol del ERP (`operadorDeLaDemo`); en la jornada
// real, la persona que entró con su PIN (`cambiarOperador`), o nadie hasta entonces. Para repintar cuando cambia, la
// pantalla se suscribe con `useOperador(almacen)`. Los permisos los sigue decidiendo el motor (`puede`): esconder un
// botón no es seguridad.

import { puede, usuario as usuarioDe } from "@/lib/club/motor.mjs";
import type { Auth, EstadoClub, Usuario } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";

export interface OperadorDelClub {
  usuario: Usuario | null;
  auth: Auth;
  /** Puede autorizar créditos y dar accesos (rol dueño del club). */
  esDuenio: boolean;
  nombre: string;
}

/** Puro: la persona y sus permisos a partir del auth (lo usan los tests y `operadorActual`). */
export function operadorDesdeAuth(estado: EstadoClub, auth: Auth): OperadorDelClub {
  const u = auth.usuarioId ? (usuarioDe(estado, auth.usuarioId) ?? null) : null;
  const activo = u && u.activo !== false ? u : null;
  return { usuario: activo, auth, esDuenio: !!activo && puede(estado, activo.id, "autorizarCC"), nombre: activo?.nombre ?? "" };
}

/** Quién está usando el sistema ahora; sin operador (jornada real antes del PIN) no es nadie. */
export function operadorActual(almacen: Pick<Almacen, "estado" | "operador">): OperadorDelClub {
  const op = almacen.operador();
  return operadorDesdeAuth(almacen.estado(), op?.auth ?? {});
}
