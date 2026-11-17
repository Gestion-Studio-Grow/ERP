// CONSOLA DE LA CUADRILLA · accesos del usuario de un agente: leer, comparar e igualar (GSG-MIA-072).
// Regla y alcance: `accesos.ts`. Mismas reglas que consola-core: todo en UNA transacción parada en UN negocio
// (`tenantTransaction` o `enElNegocio`, RLS con `app_rls`), cada consulta filtra tenantId, y antes de escribir se
// pregunta a `permisos.ts`. Igualar lo hace una persona (supervisión del negocio u operador GSG), nunca un agente.
import type { Prisma } from "@/generated/prisma/client";
import { alertaDelTecho, diferenciasDeAccesos, fueraDelTecho, nombreDelRol, overridesQueSeCopian, ROLES_DE_PROYECTOS_FUERA_DEL_TECHO, ROLES_FUERA_DEL_TECHO, type Accesos } from "./accesos";
import { NoPermitido, hiloDeAgente } from "./consola-core";
import { puede, type Actor } from "./permisos";

type Tx = Prisma.TransactionClient;

export type EstadoDeAccesos = {
  /** El agente no tiene usuario propio: no entra al sistema, no hay accesos que comparar. */
  sinUsuario: boolean;
  /** La persona del puesto con la que se compara (`comoUserId`), si sigue en el negocio. */
  como: { id: string; nombre: string; rol: string } | null;
  /** Vacío con `como` puesto = mismos accesos que esa persona, ni más ni menos. */
  diferencias: string[];
  /** El rol que tiene hoy el usuario del agente. */
  rolDelAgente: string | null;
  /** El usuario del agente YA pasa el techo (Dueño/a o Dirección): alerta, no diferencia (C1(f), GSG-MIA-078). */
  alerta: string | null;
};

export type PersonaDelNegocio = { id: string; nombre: string; rol: string };

async function accesosDe(tx: Tx, tenantId: string, userId: string): Promise<(Accesos & { nombre: string }) | null> {
  const u = await tx.user.findFirst({
    where: { id: userId, tenantId, deletedAt: null },
    select: { name: true, role: true, professionalId: true, permissionOverrides: { select: { capability: true, allowed: true } } },
  });
  if (!u) return null;
  const pp = await tx.proyectoPersona.findFirst({ where: { tenantId, userId }, select: { rol: true } });
  return { nombre: u.name, role: u.role, overrides: u.permissionOverrides, rolProyectos: pp?.rol ?? null, conFichaProfesional: !!u.professionalId };
}

/**
 * Las personas del negocio que pueden ser «la persona del puesto»: usuarios activos que NO son de un agente y que no
 * pasan el techo (ni Dueño/a ni Dirección en Proyectos: GSG-MIA-076).
 */
export async function personasDelNegocio(tx: Tx, tenantId: string): Promise<PersonaDelNegocio[]> {
  const deAgentes = (await tx.agenteCuadrilla.findMany({ where: { tenantId, userId: { not: null } }, select: { userId: true } })).map((a) => a.userId!);
  const deDireccion = (
    await tx.proyectoPersona.findMany({ where: { tenantId, rol: { in: [...ROLES_DE_PROYECTOS_FUERA_DEL_TECHO] }, userId: { not: null } }, select: { userId: true } })
  ).map((p) => p.userId!);
  const us = await tx.user.findMany({
    where: { tenantId, active: true, deletedAt: null, id: { notIn: [...deAgentes, ...deDireccion] }, role: { notIn: [...ROLES_FUERA_DEL_TECHO] as ("OWNER" | "RECEPTION" | "PROFESSIONAL")[] } },
    orderBy: { name: "asc" },
    take: 200,
    select: { id: true, name: true, role: true },
  });
  return us.map((u) => ({ id: u.id, nombre: u.name, rol: nombreDelRol(u.role) }));
}

/** Cómo están los accesos del usuario de cada agente frente a su persona del puesto. Sólo lee. */
export async function estadoDeAccesos(tx: Tx, tenantId: string, agentes: { id: string; userId: string | null; comoUserId: string | null }[]): Promise<Map<string, EstadoDeAccesos>> {
  const out = new Map<string, EstadoDeAccesos>();
  for (const a of agentes) {
    if (!a.userId) {
      out.set(a.id, { sinUsuario: true, como: null, diferencias: [], rolDelAgente: null, alerta: null });
      continue;
    }
    const delAgente = await accesosDe(tx, tenantId, a.userId);
    const persona = a.comoUserId ? await accesosDe(tx, tenantId, a.comoUserId) : null;
    out.set(a.id, {
      sinUsuario: !delAgente,
      como: persona && a.comoUserId ? { id: a.comoUserId, nombre: persona.nombre, rol: nombreDelRol(persona.role) } : null,
      diferencias: delAgente && persona ? [...diferenciasDeAccesos(delAgente, persona), ...(fueraDelTecho(persona) ? [`${persona.nombre} pasó el techo: no se puede volver a igualar con esa persona`] : [])] : [],
      rolDelAgente: delAgente ? nombreDelRol(delAgente.role) : null,
      alerta: delAgente ? alertaDelTecho(delAgente) : null,
    });
  }
  return out;
}

/**
 * Deja al usuario del agente con los mismos accesos que la persona del puesto: su rol, su matriz de permisos por
 * usuario y su rol en Proyectos (si el agente ya tiene ficha en Proyectos). Anota quién lo hizo en el hilo del agente.
 * Devuelve las diferencias que quedan (vacío = iguales).
 */
export async function igualarAccesos(tx: Tx, actor: Actor, tenantId: string, agenteId: string, personaUserId: string): Promise<string[]> {
  const r = puede(actor, "igualar_accesos", { tenantId });
  if (!r.ok) throw new NoPermitido(r.motivo);
  const agente = await tx.agenteCuadrilla.findFirst({ where: { id: agenteId, tenantId }, select: { id: true, nombre: true, userId: true } });
  if (!agente) throw new NoPermitido("No existe ese agente en este negocio.");
  if (!agente.userId) throw new NoPermitido("Ese agente no tiene usuario propio: primero se le crea uno.");
  if (personaUserId === agente.userId) throw new NoPermitido("Elegí a la persona del puesto, no al usuario del agente.");
  const esDeOtroAgente = await tx.agenteCuadrilla.findFirst({ where: { tenantId, userId: personaUserId }, select: { id: true } });
  if (esDeOtroAgente) throw new NoPermitido("Esa cuenta es de un agente: elegí a una persona del negocio.");
  const persona = await tx.user.findFirst({
    where: { id: personaUserId, tenantId, active: true, deletedAt: null },
    select: { name: true, role: true, permissionOverrides: { select: { capability: true, allowed: true } } },
  });
  if (!persona) throw new NoPermitido("Esa persona no está en este negocio.");
  // TECHO (GSG-MIA-076): todo se lee y se valida ANTES de la primera escritura; si la persona lo pasa, no se toca nada.
  const ppPersona = await tx.proyectoPersona.findFirst({ where: { tenantId, userId: personaUserId }, select: { rol: true } });
  const techo = fueraDelTecho({ role: persona.role, rolProyectos: ppPersona?.rol ?? null });
  if (techo) throw new NoPermitido(techo);
  const copiados = overridesQueSeCopian(persona.permissionOverrides);

  await tx.user.updateMany({ where: { id: agente.userId, tenantId }, data: { role: persona.role } });
  await tx.userPermissionOverride.deleteMany({ where: { tenantId, userId: agente.userId } });
  if (copiados.length) {
    await tx.userPermissionOverride.createMany({
      data: copiados.map((o) => ({ tenantId, userId: agente.userId!, capability: o.capability, allowed: o.allowed })),
    });
  }
  if (ppPersona) await tx.proyectoPersona.updateMany({ where: { tenantId, userId: agente.userId }, data: { rol: ppPersona.rol } });
  await tx.agenteCuadrilla.updateMany({ where: { id: agente.id, tenantId }, data: { comoUserId: personaUserId } });

  const quien = actor.tipo === "operador" ? `${actor.nombre} (GSG)` : actor.nombre;
  await tx.mensajeCuadrilla.create({
    data: {
      tenantId,
      hilo: hiloDeAgente(agente.id),
      autorTipo: "SISTEMA",
      autor: "Sistema",
      texto: `${quien} dejó los accesos de ${agente.nombre} iguales a los de ${persona.name} (rol ${nombreDelRol(persona.role)}, ${copiados.length} ${copiados.length === 1 ? "permiso propio" : "permisos propios"}).`,
    },
  });
  return (await estadoDeAccesos(tx, tenantId, [{ id: agente.id, userId: agente.userId, comoUserId: personaUserId }])).get(agente.id)!.diferencias;
}
