// Los roles que se ofrecen al dar de alta un usuario, con las palabras del rubro. PURO.
//
// En un negocio sin agenda (una carnicería, una tienda de velas o de pádel) el rol Profesional
// era un callejón: la persona entraba a /admin/turnos, veía "No hay profesionales activos" y la
// barra vacía. Ahí no se ofrece. Y "Recepción" se dice "Mostrador", como en el resto del panel.
// En un negocio de servicios (CH) todo queda como estaba.
//
// La pantalla ofrece `rolesParaAlta` y el servidor (`createUser`, user-actions.ts) acepta SÓLO
// esos mismos (`rolAdmitidoEnAlta`): un Profesional sin agenda no entra ni por un POST a mano.

import type { Role } from "@/lib/capabilities";

export type OpcionDeRol = { valor: Role; etiqueta: string };

export function rolesParaAlta(esMostrador: boolean): OpcionDeRol[] {
  if (esMostrador) {
    return [
      { valor: "OWNER", etiqueta: "Dueño/a (todo)" },
      { valor: "RECEPTION", etiqueta: "Mostrador (vender, cobrar, clientes y stock)" },
    ];
  }
  return [
    { valor: "OWNER", etiqueta: "Dueño/a (todo)" },
    { valor: "RECEPTION", etiqueta: "Recepción (agenda + clientes + cobrar)" },
    { valor: "PROFESSIONAL", etiqueta: "Profesional (solo su agenda)" },
  ];
}

/** El rol como se lee en la lista de usuarios. */
export function etiquetaDeRol(role: string, esMostrador: boolean): string {
  if (role === "OWNER") return "Dueño/a";
  if (role === "RECEPTION") return esMostrador ? "Mostrador" : "Recepción";
  if (role === "PROFESSIONAL") return "Profesional";
  return role;
}

/** Un Profesional en un negocio sin agenda no tiene ninguna pantalla que abrir. */
export function rolSinPantallas(role: string, esMostrador: boolean): boolean {
  return esMostrador && role === "PROFESSIONAL";
}

/** ¿Se puede dar de alta este rol en este negocio? La misma lista que ofrece la pantalla. */
export function rolAdmitidoEnAlta(role: string, esMostrador: boolean): boolean {
  return rolesParaAlta(esMostrador).some((o) => o.valor === role);
}
