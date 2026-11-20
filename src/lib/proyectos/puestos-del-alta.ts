// MIA-229 · El alta de usuarios de una productora ofrece PUESTOS, no «Recepción» (orden del dueño, 20/11: «Rol de recepcion
// no existe, debemos crear el rol de cada uno y asignarle los accesos»). Cada puesto deriva el rol del ERP (el techo) y la
// ficha del equipo (el rol de gestión, que decide los módulos y la plata). Sólo en el tenant de Proyectos: CH y los de
// mostrador siguen con sus roles de siempre (`rolesParaAlta`, usuarios/roles.ts). PURO.

import type { Role } from "@/lib/capabilities";
import { DECISIONES_DE_PUESTOS as D } from "./decisiones-puestos";
import { ROL_LABEL, ROLES_GESTION, type RolGestion } from "./gestion-core";

export interface PuestoDelAlta {
  valor: string;
  etiqueta: string;
  rolErp: Role;
  /** La ficha que se crea (o se vincula por mail). Null: el dueño, que entra como Dirección sin ficha (`rolDelActor`). */
  puesto: (typeof ROLES_GESTION)[number] | null;
}

// MIA-237 · orden y nombres del dueño (20/11 13:05Z: «reordenemos? Es productor comercial y productor de campo»).
export const PUESTOS_DEL_ALTA: readonly PuestoDelAlta[] = [
  { valor: "DUENIO", etiqueta: "Dueño/a (todo, también usuarios y precios)", rolErp: "OWNER", puesto: null },
  { valor: "DIRECCION", etiqueta: "Dirección (todos los proyectos y la plata)", rolErp: D.rolErpDeDireccion, puesto: "DIRECCION" },
  // OWNER por Facturación; el techo de puesto (`capacidadesNegadas`) le saca usuarios y permisos.
  { valor: "ADMINISTRACION", etiqueta: "Administración (toda la plata, facturación y los proyectos; sin usuarios ni permisos)", rolErp: D.rolErpDeAdministracion, puesto: "ADMINISTRACION" },
  // Necesita Clientes («clients:read»): RECEPTION. Lo que ve de la plata lo decide su rol de gestión, no el del ERP.
  { valor: "COMERCIAL", etiqueta: "Productor comercial (leads, propuestas, cobros y costos; sin pagos a proveedores)", rolErp: "RECEPTION", puesto: "COMERCIAL" },
  { valor: "PRODUCCION_CAMPO", etiqueta: "Productor de campo (tareas y rendiciones; sin importes)", rolErp: "PROFESSIONAL", puesto: "PRODUCCION_CAMPO" },
  { valor: "PRODUCCION", etiqueta: D.costosSonPlata ? "Producción (arma el evento; sin costos ni plata)" : "Producción (arma el evento y presupuesta; sin cobros ni pagos)", rolErp: "PROFESSIONAL", puesto: "PRODUCCION" },
  { valor: "DISENO", etiqueta: "Diseño (tareas y versiones; sin la plata)", rolErp: "PROFESSIONAL", puesto: "DISENO" },
];

export const puestoDelAlta = (valor: string): PuestoDelAlta | null => PUESTOS_DEL_ALTA.find((p) => p.valor === valor) ?? null;

/** P4: cómo se lee un usuario en la lista de una productora: por el puesto de su ficha. Null: sin cambio (el rol del ERP). */
export function etiquetaPorPuesto(role: string, rolDeLaFicha: string | null | undefined): string | null {
  if (!D.etiquetaPorFicha) return null;
  if ((ROLES_GESTION as readonly string[]).includes(rolDeLaFicha ?? "")) return ROL_LABEL[rolDeLaFicha as RolGestion];
  return role === "OWNER" ? "Dueño/a" : "Sin ficha";
}
