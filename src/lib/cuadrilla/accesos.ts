// CONSOLA DE LA CUADRILLA · el usuario de un agente tiene los MISMOS accesos que la persona de su puesto
// (GSG-MIA-072). Orden del dueño, 17/11/2026 07:38Z: «los agentes tienen absoluta autorización del rol, mismos
// accesos que una persona». Lectura del brief: los mismos permisos que la persona del puesto, ni más ni menos.
//
// «Accesos» es lo que decide qué ve y qué hace un usuario del panel en el ERP:
//   · el rol (`User.role`: OWNER, RECEPTION, PROFESSIONAL), con su mapa de capacidades (capabilities.ts);
//   · la matriz por usuario (`UserPermissionOverride`: las casillas distintas del default del rol);
//   · el rol en Proyectos (`ProyectoPersona.rol`), si el negocio usa Proyectos.
// Lo que NO se copia, a propósito: la contraseña, el PIN, el cambio obligatorio y la ficha profesional
// (`professionalId` es única: es la agenda de una persona). Si la persona tiene ficha, se avisa como diferencia.
//
// Lo que sigue igual para el agente aunque tenga el rol de la dueña: en la consola es AGENTE (habla en su hilo y
// levanta excepciones) y nunca aprueba (`permisos.ts`, criterio 4 de MIA-062: plata y envíos los aprueba una persona).
//
// TECHO (GSG-MIA-076, seguridad): el usuario de un agente NUNCA queda OWNER ni Dirección en Proyectos. Igualar con
// una persona así se rechaza entero, y de la matriz sólo se copian las casillas que se dan por usuario
// (`CAPACIDADES_POR_USUARIO`): un override de otra capability no se copia aunque la persona lo tenga cargado.
// PURO: sin base. Las lecturas y la escritura viven en `accesos-core.ts`.

import { esCapacidadPorUsuario } from "@/lib/capabilities";

export type Accesos = {
  role: string;
  overrides: { capability: string; allowed: boolean }[];
  rolProyectos: string | null;
  conFichaProfesional: boolean;
};

const ROL: Record<string, string> = { OWNER: "Dueño/a", RECEPTION: "Recepción", PROFESSIONAL: "Profesional" };
export const nombreDelRol = (r: string): string => ROL[r] ?? r;

/** Roles que el usuario de un agente no puede tener nunca. */
export const ROLES_FUERA_DEL_TECHO: readonly string[] = ["OWNER"];
export const ROLES_DE_PROYECTOS_FUERA_DEL_TECHO: readonly string[] = ["DIRECCION"];

/** Por qué no se puede igualar con esa persona (pasa el techo), o null si se puede. */
export function fueraDelTecho(persona: { role: string; rolProyectos: string | null }): string | null {
  if (ROLES_FUERA_DEL_TECHO.includes(persona.role)) {
    return `Esa persona es ${nombreDelRol(persona.role)}: el usuario de un agente nunca queda con ese rol. Elegí a alguien del puesto.`;
  }
  if (persona.rolProyectos && ROLES_DE_PROYECTOS_FUERA_DEL_TECHO.includes(persona.rolProyectos)) {
    return "Esa persona es Dirección en Proyectos: el usuario de un agente nunca queda con ese rol. Elegí a alguien del puesto.";
  }
  return null;
}

/**
 * ALERTA (C1(f) de GSG-MIA-076, GSG-MIA-078): el usuario del agente YA pasa el techo (cargado antes de MIA-076 o a
 * mano en la base). No es una diferencia más: en Usuarios se le niega todo (`user-actions.ts`), y la consola lo
 * muestra para que una persona lo iguale con alguien del puesto. Null si no pasa el techo.
 */
export function alertaDelTecho(agente: { role: string; rolProyectos: string | null }): string | null {
  // OWNER: lo frenan la guardia (`session.ts`) y G5 (`exigirSinAgenteDuenio`), y el aviso lo dice.
  if (ROLES_FUERA_DEL_TECHO.includes(agente.role)) {
    return `Su usuario es ${nombreDelRol(agente.role)}, y un agente nunca lo es: no entra al panel (tampoco a Usuarios) y no se puede reanudar a ningún agente. Igualalo con alguien del puesto.`;
  }
  // Dirección en Proyectos: la guardia y G5 sólo miran OWNER (E1 de GSG-MIA-080). El aviso no promete un freno que
  // no existe; extenderlos a Dirección cambia el alcance y lo decide el dueño.
  if (agente.rolProyectos && ROLES_DE_PROYECTOS_FUERA_DEL_TECHO.includes(agente.rolProyectos)) {
    return "Su usuario es Dirección en Proyectos, y un agente nunca lo es. Para este caso no hay freno: entra al panel con lo que Dirección puede en Proyectos y los agentes se pueden reanudar. Igualalo con alguien del puesto cuanto antes.";
  }
  return null;
}

/** De la matriz de la persona, lo que se copia: sólo las casillas que se dan por usuario. */
export const overridesQueSeCopian = <T extends { capability: string }>(xs: readonly T[]): T[] => xs.filter((o) => esCapacidadPorUsuario(o.capability));

/** Lo que el agente tiene distinto de la persona, en criollo. Vacío = mismos accesos, ni más ni menos. */
export function diferenciasDeAccesos(agente: Accesos, persona: Accesos): string[] {
  const out: string[] = [];
  if (agente.role !== persona.role) out.push(`rol ${nombreDelRol(agente.role)} (la persona: ${nombreDelRol(persona.role)})`);
  const del = (xs: Accesos["overrides"]) => new Map(xs.map((o) => [o.capability, o.allowed]));
  const a = del(agente.overrides);
  const p = del(overridesQueSeCopian(persona.overrides)); // lo que no se copia no cuenta como diferencia
  for (const cap of [...new Set([...a.keys(), ...p.keys()])].sort()) {
    const va = a.get(cap);
    const vp = p.get(cap);
    if (va === vp) continue;
    const como = (v: boolean | undefined) => (v === undefined ? "lo del rol" : v ? "sí" : "no");
    out.push(`permiso «${cap}»: ${como(va)} (la persona: ${como(vp)})`);
  }
  if ((agente.rolProyectos ?? null) !== (persona.rolProyectos ?? null)) {
    out.push(`rol en Proyectos ${agente.rolProyectos ?? "ninguno"} (la persona: ${persona.rolProyectos ?? "ninguno"})`);
  }
  if (persona.conFichaProfesional && !agente.conFichaProfesional) out.push("la persona tiene agenda propia (ficha profesional): no se copia");
  return out;
}
