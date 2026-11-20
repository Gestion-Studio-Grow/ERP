// ============================================================================
// ARM como negocio propio — lo que pasa en el negocio DESTINO (GSG-CRM-017 · T4).
// ============================================================================
//
// El ARM (p. ej. `arm-mia`) tiene sólo el CRM; el proyecto nace en el negocio vinculado (MIA Producciones o MIA
// Taller). Estas funciones corren SIEMPRE en la fase de destino de `trasladoTransaction` (rls.ts): el GUC y el candado
// de la app son los del destino, así que cada fila que escriben es del destino y RLS rechaza cualquier otra. Ninguna
// recibe un `tx` del ARM ni lee nada del ARM: lo que viaja llega armado en `Paquete` (V5).
//
// Lo que vuelve al ARM es acotado a propósito (V6, V7): el estado del proyecto (en curso, ganado, perdido y su motivo de catálogo)
// y si un cliente existe o no. Ni datos personales ni montos del destino cruzan de vuelta.

import { randomBytes } from "node:crypto";
import type { TxTraslado } from "@/lib/rls";
import { cierreEntreNegocios, esDominioDeCorreoGenerico, type Motivo } from "./motor";
import { criterioDeContacto, wherePorContacto } from "@/lib/clientes/busqueda-por-contacto";

/** Un tipo de destino del ARM (el que propone el Calificador y confirma Dirección). */
export type DestinoArm = "AGENCIA" | "TALLER";

export const SIN_VINCULO = "Este destino no tiene un negocio vinculado: no se puede asignar ni derivar, y no se creó nada. El vínculo lo carga GSG.";

/** Lo que viaja del ARM al destino (V5): el cliente, el brief y la conversación. Nada de administración del ARM. */
export interface Paquete {
  origenTenantId: string;
  origenOportunidadId: string;
  /** Id del proyecto, generado en el ARM antes de abrir la fase (la oportunidad lo guarda en la misma escritura). */
  proyectoId: string;
  cliente: { nombre: string; email: string | null; telefono: string | null; contacto: string | null };
  nombreProyecto: string;
  brief: string;
  conversacion: string[];
  fechaEvento: Date | null;
  moneda: string;
  presupuestoEstimado: number | null;
  /** Quién asignó, para el registro del destino (nombre, no el id del ARM). */
  asignadoPor: string;
}

/** Id con la misma forma que los de Prisma (`c` + 24), para guardarlo en el ARM antes de crear el proyecto. */
export const nuevoIdDeProyecto = (): string => `c${randomBytes(12).toString("hex")}`;

/** Texto del brief del proyecto: el brief del ARM y, abajo, la conversación con fecha. Tope del campo: 8000. */
export function briefConConversacion(brief: string, conversacion: readonly string[]): string {
  const conv = conversacion.length ? `\n\nConversación en el CRM:\n${conversacion.join("\n")}` : "";
  return `${brief}${conv}`.slice(0, 8000);
}

/**
 * Crea el proyecto en el destino: cliente (el que ya existe por mail o teléfono, o uno nuevo), proyecto en «Lead / brief»,
 * presupuesto v1 vacío, la fila de `AsignacionRecibida` y el registro. Idempotente por oportunidad del ARM: si ya
 * nació, devuelve el que existe (el índice único lo garantiza también a dos a la vez). Corre en la FASE DE DESTINO.
 */
export async function crearEnDestino(tx: TxTraslado, destinoTenantId: string, p: Paquete): Promise<{ proyectoId: string; yaEstaba: boolean }> {
  const ya = await tx.asignacionRecibida.findFirst({
    where: { tenantId: destinoTenantId, origenTenantId: p.origenTenantId, origenOportunidadId: p.origenOportunidadId },
    select: { proyectoId: true },
  });
  if (ya) return { proyectoId: ya.proyectoId, yaEstaba: true };

  const telefono = p.cliente.telefono?.replace(/\D/g, "") || null;
  const existente =
    p.cliente.email || telefono
      ? await tx.client.findFirst({
          where: {
            tenantId: destinoTenantId,
            // El teléfono, con el criterio común de búsqueda por contacto (lo mira el sistema: ve el contacto completo).
            OR: [...(p.cliente.email ? [{ email: { equals: p.cliente.email, mode: "insensitive" as const } }] : []), ...wherePorContacto(criterioDeContacto(telefono, true))],
          },
          select: { id: true },
        })
      : null;
  const clientId =
    existente?.id ??
    (
      await tx.client.create({
        data: { tenantId: destinoTenantId, name: p.cliente.nombre.slice(0, 120), email: p.cliente.email, phone: telefono ?? `sin-tel-${randomBytes(4).toString("hex")}` },
        select: { id: true },
      })
    ).id;

  const ultimo = await tx.proyecto.findFirst({ where: { tenantId: destinoTenantId }, orderBy: { numero: "desc" }, select: { numero: true } });
  await tx.proyecto.create({
    data: {
      id: p.proyectoId,
      tenantId: destinoTenantId,
      numero: (ultimo?.numero ?? 0) + 1,
      clientId,
      nombre: p.nombreProyecto.slice(0, 120),
      servicio: "EVENTOS",
      etapa: "PEDIDO",
      fechaEvento: p.fechaEvento,
      moneda: p.moneda,
      presupuestoEstimado: p.presupuestoEstimado,
      contactoNombre: p.cliente.contacto,
      contactoEmail: p.cliente.email,
      brief: briefConConversacion(p.brief, p.conversacion),
    },
    select: { id: true },
  });
  await tx.proyectoPresupuesto.create({
    data: { tenantId: destinoTenantId, proyectoId: p.proyectoId, version: 1, token: randomBytes(18).toString("base64url"), creadoPor: "CRM comercial", nota: "Versión inicial" },
    select: { id: true },
  });
  await tx.asignacionRecibida.create({
    data: { tenantId: destinoTenantId, origenTenantId: p.origenTenantId, origenOportunidadId: p.origenOportunidadId, proyectoId: p.proyectoId },
    select: { id: true },
  });
  // Registro del lado del destino (V6): quién lo mandó y desde qué oportunidad, sin datos del ARM.
  await tx.auditLog.create({
    data: {
      tenantId: destinoTenantId,
      actor: `crm:${p.asignadoPor}`.slice(0, 200),
      action: "proyecto.crear",
      entity: "Proyecto",
      entityId: p.proyectoId,
      changes: { desde: "CRM comercial (asignación)", oportunidad: p.origenOportunidadId, clienteExistente: !!existente },
      channel: "admin",
    },
    select: { id: true },
  });
  return { proyectoId: p.proyectoId, yaEstaba: false };
}

/** El estado que el destino le devuelve al ARM (V6): sólo esto cruza. */
export type EstadoEnDestino = { proyectoId: string; cierre: { destino: "GANADA" | "PERDIDA"; motivo: Motivo | null; nota: string | null } | null };

/**
 * Estado de los proyectos que nacieron de ESTE ARM (acotado por `AsignacionRecibida`: el ARM no puede preguntar por
 * un proyecto que no le pertenece). Corre en la FASE DE DESTINO. Devuelve sólo el cierre.
 */
export async function estadosEnDestino(tx: TxTraslado, destinoTenantId: string, origenTenantId: string, proyectoIds: readonly string[]): Promise<EstadoEnDestino[]> {
  if (proyectoIds.length === 0) return [];
  const suyas = await tx.asignacionRecibida.findMany({
    where: { tenantId: destinoTenantId, origenTenantId, proyectoId: { in: [...proyectoIds] } },
    select: { proyecto: { select: { id: true, etapa: true, perdidoEl: true, motivoPerdida: true } } },
  });
  // GSG-CRM-018c: del motivo de pérdida cruza sólo el de catálogo; el detalle libre del destino no sale de esta fase.
  return suyas.map(({ proyecto: p }) => ({ proyectoId: p.id, cierre: cierreEntreNegocios({ etapa: p.etapa, perdidoEl: p.perdidoEl, motivoPerdida: p.motivoPerdida }) }));
}

/** Qué se busca para «ya es cliente» (V7): el nombre de la marca, su dominio web y los mails conocidos. */
export interface Huella {
  nombre: string | null;
  dominio: string | null;
  emails: readonly string[];
}

/**
 * ¿Existe ya como cliente en este negocio? Lectura ACOTADA (V7): devuelve sólo sí o no, nunca la fila. Corre en la
 * FASE DE DESTINO. Mira el nombre exacto (sin mayúsculas), un mail conocido o un mail con el dominio de la marca
 * (salvo que sea de correo genérico).
 */
export async function existeClienteEnDestino(tx: TxTraslado, destinoTenantId: string, h: Huella): Promise<boolean> {
  const nombre = h.nombre?.trim();
  const dominio = h.dominio?.trim().toLowerCase().replace(/^www\./, "");
  const o = [
    ...(nombre ? [{ name: { equals: nombre, mode: "insensitive" as const } }] : []),
    ...h.emails.filter(Boolean).map((e) => ({ email: { equals: e, mode: "insensitive" as const } })),
    // GSG-CRM-018c: con un dominio de correo genérico (gmail, hotmail…) no se compara por dominio: daba falso «ya es cliente».
    ...(dominio && !esDominioDeCorreoGenerico(dominio) ? [{ email: { endsWith: `@${dominio}`, mode: "insensitive" as const } }] : []),
  ];
  if (o.length === 0) return false;
  const c = await tx.client.findFirst({ where: { tenantId: destinoTenantId, OR: o }, select: { id: true } });
  return c !== null;
}
