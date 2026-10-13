// ============================================================================
// UNIFICAR FICHAS — el cuerpo de la transacción (lo llama `unificarFichas`, crm-actions.ts).
// ============================================================================
//
// Vivía adentro del "use server" y ningún test lo ejecutaba: mueve la plata fiada, los turnos
// y los pedidos de una persona. Acá afuera, recibe el negocio por parámetro (en el "use server"
// eso sería un endpoint que unifica fichas de cualquier negocio) y un test lo corre entero.
//
// En UNA transacción:
//   1. vuelve a leer las fichas (si otra persona ya las unificó, no hace nada);
//   2. mueve las claves foráneas a Client de las duplicadas a la que queda, siempre con el
//      negocio en el `where`: Appointment, Order, AccountReceivable (el fiado, sólo si la tabla
//      está) y las del módulo inmobiliaria (propietario de una ficha, inquilino y propietario de
//      un contrato, propietario de una liquidación, interesado de una consulta);
//   3. completa en la que queda los datos que le faltaban y suma las notas (unificar.ts);
//   4. borra las duplicadas;
//   5. deja en la auditoría la foto de cada ficha borrada y los ids movidos, para poder
//      deshacerlo a mano. La auditoría va ADENTRO: sin ella no hay cómo volver.
// Si mientras tanto se cargó un turno nuevo en una duplicada, el borrado falla por la clave
// foránea (P2003), la transacción entera vuelve atrás y la acción pide reintentar.

import type { Prisma } from "@/generated/prisma/client";
import { permisoTrasUnificar, type EventoConstancia } from "./constancias";
import { ENTIDAD_PERMISO } from "./reglas";
import { fotoParaAuditoria, planUnificacion } from "./unificar";

export type ResultadoUnificacion =
  | { ok: true; nombre: string; turnos: number; pedidos: number; fiado: number; inmobiliaria: number; fichas: number }
  | { ok: false; error: string };

/** Los ids movidos en las tablas de la inmobiliaria, por columna. */
interface MovidosInmo {
  propiedades: string[];
  contratosInquilino: string[];
  contratosPropietario: string[];
  liquidaciones: string[];
  consultas: string[];
}

/**
 * Las cinco claves a Client del módulo inmobiliaria. Las tablas existen desde la migración
 * 20261013120000_modulo_inmobiliaria (viaja con este código en prisma/lote-deploy.txt); si en
 * una base no estuvieran, el `findMany` revienta con P2021 y la transacción entera vuelve atrás.
 */
async function moverInmobiliaria(tx: Prisma.TransactionClient, tenantId: string, eliminaIds: readonly string[], conservaId: string): Promise<MovidosInmo> {
  const de = { in: [...eliminaIds] };
  const ids = (filas: { id: string }[]) => filas.map((f) => f.id);
  const propiedades = ids(await tx.inmoPropiedad.findMany({ where: { tenantId, propietarioId: de }, select: { id: true } }));
  const contratosInquilino = ids(await tx.inmoContrato.findMany({ where: { tenantId, inquilinoId: de }, select: { id: true } }));
  const contratosPropietario = ids(await tx.inmoContrato.findMany({ where: { tenantId, propietarioId: de }, select: { id: true } }));
  const liquidaciones = ids(await tx.inmoLiquidacion.findMany({ where: { tenantId, propietarioId: de }, select: { id: true } }));
  const consultas = ids(await tx.inmoConsulta.findMany({ where: { tenantId, clientId: de }, select: { id: true } }));

  if (propiedades.length) await tx.inmoPropiedad.updateMany({ where: { tenantId, id: { in: propiedades } }, data: { propietarioId: conservaId } });
  if (contratosInquilino.length) await tx.inmoContrato.updateMany({ where: { tenantId, id: { in: contratosInquilino } }, data: { inquilinoId: conservaId } });
  if (contratosPropietario.length) await tx.inmoContrato.updateMany({ where: { tenantId, id: { in: contratosPropietario } }, data: { propietarioId: conservaId } });
  if (liquidaciones.length) await tx.inmoLiquidacion.updateMany({ where: { tenantId, id: { in: liquidaciones } }, data: { propietarioId: conservaId } });
  if (consultas.length) await tx.inmoConsulta.updateMany({ where: { tenantId, id: { in: consultas } }, data: { clientId: conservaId } });
  return { propiedades, contratosInquilino, contratosPropietario, liquidaciones, consultas };
}

export async function unificarFichasEnTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  p: {
    conservaId: string;
    eliminaIds: readonly string[];
    actor: string;
    /** ¿Está la tabla del fiado en la base? (la migración puede no estar aplicada) */
    conFiado: boolean;
    /** Constancias de permiso de mensajes de todas las fichas en juego (leídas antes). */
    eventos: readonly EventoConstancia[];
  },
): Promise<ResultadoUnificacion> {
  const { conservaId, actor, conFiado, eventos } = p;
  const eliminaIds = [...p.eliminaIds];
  const fichas = await tx.client.findMany({
    where: { tenantId, id: { in: [conservaId, ...eliminaIds] } },
    select: { id: true, name: true, phone: true, email: true, notes: true, birthDate: true, isResident: true, createdAt: true },
  });
  const conserva = fichas.find((f) => f.id === conservaId) ?? null;
  const eliminadas = fichas.filter((f) => f.id !== conservaId);
  const plan = planUnificacion(conserva, eliminadas, eliminaIds.length);
  if (!plan.ok) return plan;
  // `planUnificacion` ya rechaza la ficha que queda inexistente; esto es para el tipo.
  if (!conserva) return { ok: false, error: "La ficha que queda ya no existe." };

  const turnos = (await tx.appointment.findMany({ where: { tenantId, clientId: { in: eliminaIds } }, select: { id: true } })).map((t) => t.id);
  const pedidos = (await tx.order.findMany({ where: { tenantId, clientId: { in: eliminaIds } }, select: { id: true } })).map((o) => o.id);
  const fiado = conFiado
    ? (await tx.accountReceivable.findMany({ where: { tenantId, clientId: { in: eliminaIds } }, select: { id: true } })).map((d) => d.id)
    : [];

  if (turnos.length) await tx.appointment.updateMany({ where: { tenantId, id: { in: turnos } }, data: { clientId: conservaId } });
  if (pedidos.length) await tx.order.updateMany({ where: { tenantId, id: { in: pedidos } }, data: { clientId: conservaId } });
  if (fiado.length) await tx.accountReceivable.updateMany({ where: { tenantId, id: { in: fiado } }, data: { clientId: conservaId } });
  // Un propietario o inquilino duplicado: sus fichas, contratos, liquidaciones y consultas pasan
  // a la persona que queda (si no, el borrado fallaría por la clave foránea o la ficha de la
  // propiedad quedaría sin dueño).
  const inmo = await moverInmobiliaria(tx, tenantId, eliminaIds, conservaId);
  const movidosInmo = inmo.propiedades.length + inmo.contratosInquilino.length + inmo.contratosPropietario.length + inmo.liquidaciones.length + inmo.consultas.length;

  const antes: Record<string, unknown> = {};
  for (const k of Object.keys(plan.cambios) as (keyof typeof plan.cambios)[]) antes[k] = conserva[k];
  if (Object.keys(plan.cambios).length > 0) {
    // `updateMany` con el negocio: el id sale de una fila ya leída con el negocio, pero la
    // escritura no depende de eso.
    await tx.client.updateMany({ where: { tenantId, id: conservaId }, data: plan.cambios });
  }
  await tx.client.deleteMany({ where: { tenantId, id: { in: eliminaIds } } });

  // El permiso de mensajes que queda es el último que expresó la persona en cualquiera de sus
  // fichas (constancias.ts). Si la última palabra estaba en una duplicada, se copia.
  const permiso = permisoTrasUnificar(eventos, conservaId, eliminaIds);
  if (permiso) {
    await tx.auditLog.create({
      data: {
        tenantId,
        actor,
        action: permiso,
        entity: ENTIDAD_PERMISO,
        entityId: conservaId,
        changes: { fuente: "unificacion", de: eliminaIds },
        channel: "admin",
      },
    });
  }

  await tx.auditLog.create({
    data: {
      tenantId,
      actor,
      action: "unificar",
      entity: "Client",
      entityId: conservaId,
      changes: JSON.parse(
        JSON.stringify({
          conserva: { id: conserva.id, name: conserva.name, phone: conserva.phone },
          eliminadas: eliminadas.map(fotoParaAuditoria),
          movidos: { turnos, pedidos, fiado, inmobiliaria: inmo },
          cambios: { antes, despues: plan.cambios },
          ...(permiso ? { permisoCopiado: permiso } : {}),
        }),
      ),
      channel: "admin",
    },
  });

  return { ok: true, nombre: conserva.name, turnos: turnos.length, pedidos: pedidos.length, fiado: fiado.length, inmobiliaria: movidosInmo, fichas: eliminadas.length };
}
