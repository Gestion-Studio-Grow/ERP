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
// PURO: sin base. Las lecturas y la escritura viven en `accesos-core.ts`.

export type Accesos = {
  role: string;
  overrides: { capability: string; allowed: boolean }[];
  rolProyectos: string | null;
  conFichaProfesional: boolean;
};

const ROL: Record<string, string> = { OWNER: "Dueño/a", RECEPTION: "Recepción", PROFESSIONAL: "Profesional" };
export const nombreDelRol = (r: string): string => ROL[r] ?? r;

/** Lo que el agente tiene distinto de la persona, en criollo. Vacío = mismos accesos, ni más ni menos. */
export function diferenciasDeAccesos(agente: Accesos, persona: Accesos): string[] {
  const out: string[] = [];
  if (agente.role !== persona.role) out.push(`rol ${nombreDelRol(agente.role)} (la persona: ${nombreDelRol(persona.role)})`);
  const del = (xs: Accesos["overrides"]) => new Map(xs.map((o) => [o.capability, o.allowed]));
  const a = del(agente.overrides);
  const p = del(persona.overrides);
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
