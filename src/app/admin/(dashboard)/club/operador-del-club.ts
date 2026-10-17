// ============================================================================
// QUIÉN OPERA EL CLUB — el ÚNICO lugar donde Clientes, el Tablero y el aviso 🔔 leen la persona del mostrador.
// ============================================================================
//
// Hoy el almacén opera con el usuario de ejemplo del rol del ERP (`operadorDeLaDemo`: un dueño para OWNER,
// recepción para el resto) y lo expone como `almacen.auth()` (usuario del club y su PIN de ejemplo).
//
// DÓNDE SE ENCHUFA EL PIN REAL (ola 0 de PARIDAD-REACT.md, sesión de terminales): el almacén va a sumar
// `almacen.operador()` / `almacen.cambiarOperador(usuario, auth)` con la persona que entró con su PIN. Cuando
// lleguen, se cambia SÓLO `operadorActual` (una línea: leer el auth de ahí); las pantallas no se tocan. Los
// permisos los sigue decidiendo el motor (`puede`): esconder un botón no es seguridad.

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

/** Quién está usando el sistema ahora. Punto único: acá se cambia a `almacen.operador()` con PIN cuando exista. */
export function operadorActual(almacen: Pick<Almacen, "estado" | "auth">): OperadorDelClub {
  return operadorDesdeAuth(almacen.estado(), almacen.auth());
}
