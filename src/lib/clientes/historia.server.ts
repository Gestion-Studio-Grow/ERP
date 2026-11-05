// ============================================================================
// LA HISTORIA DE UNA CLIENTA — el lector (SÓLO LECTURA).
// ============================================================================
//
// Todo en UNA transacción del negocio (`tenantTransaction`: RLS con su GUC) y con `tenantId` escrito
// en CADA `where`, como el resto de `clientes/[id]`. Consultas por bloque, nunca por turno: la
// clienta, (la puerta de la profesional), la cuenta, la página de 20, su auditoría, sus cobros, los
// nombres de quienes la tocaron y las opciones de los filtros.
//
// LA PUERTA (datos de salud): una PROFESIONAL sólo abre clientas con al menos un turno con ella
// (atendido, que viene, cancelado: «con turno con ella»); sin `professionalId` vinculado, ninguna
// (fail-closed). Una clienta de otro negocio o ajena da `null`: la página contesta «no existe», sin
// decir que existe. Lo que el rol no ve (notas, plata) no se recorta al pintar: NO SE LEE.
//
// LA AUDITORÍA ESTRICTA (datos de salud, certificación del 05/11): `abrirHistoriaDeLaClienta` escribe
// el registro DENTRO de la misma transacción de la lectura: `historia_vista` si se abrió,
// `historia_denegada` (con el motivo) si no. Si el registro no se escribe, la transacción se cae y la
// historia NO se devuelve: sin rastro, no se muestra. Distinto de `audit()` (src/lib/audit-core.ts),
// que nunca lanza porque no debe tumbar una operación de negocio; acá la lectura ES lo que se audita.
//
// Sin chequeo de rol de la app: lo hace la página (`requireApp`). Sin migración: no hay modelo de
// notas clínicas aparte; las notas son las del turno (`Appointment.notes`), que ya existen.

import type { Prisma } from "@/generated/prisma/client";
import { tenantTransaction } from "@/lib/rls";
import { cobrosDetalladosPorTurno } from "@/lib/turnos/anulacion";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";
import {
  ACCION_HISTORIA_DENEGADA,
  ACCION_HISTORIA_VISTA,
  TURNOS_POR_PAGINA,
  armarLineaDeTiempo,
  diaSiguienteDe,
  esRolDeHistoria,
  hayFiltrosDeHistoria,
  usuariosDelRastro,
  veMontosDelTurno,
  vistaDeHistoria,
  type FiltrosDeHistoria,
  type MotivoHistoriaDenegada,
  type TurnoDeLaHistoria,
  type TurnoLeidoDeHistoria,
  type VistaDeHistoria,
} from "./historia-core";

type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

export interface QuienMiraLaHistoria {
  role: string;
  professionalId: string | null;
}

export interface HistoriaDeLaClienta {
  clienta: { id: string; nombre: string };
  vista: VistaDeHistoria;
  turnos: TurnoDeLaHistoria[];
  total: number;
  pagina: number;
  paginas: number;
  opciones: { profesionales: { id: string; nombre: string }[]; servicios: { id: string; nombre: string }[] };
}

/** Las acciones del turno que cuentan para la recepción: sólo las que dicen cómo terminó. */
const ACCIONES_DEL_CIERRE = ["complete", "no_show", "cancel"];

type Lectura = { historia: HistoriaDeLaClienta; denegada?: never } | { historia?: never; denegada: MotivoHistoriaDenegada };

async function leerEn(tx: Tx, tenantId: string, clienteId: string, quien: QuienMiraLaHistoria, f: FiltrosDeHistoria): Promise<Lectura> {
  const vista = vistaDeHistoria(quien.role);
  const clienta = await tx.client.findFirst({ where: { id: clienteId, tenantId }, select: { id: true, name: true } });
  if (!clienta) return { denegada: "otro negocio" };
  if (vista.soloSusClientas) {
    const sinPuerta: MotivoHistoriaDenegada = esRolDeHistoria(quien.role) ? "sin turno con ella" : "rol";
    if (!quien.professionalId) return { denegada: sinPuerta };
    const suya = await tx.appointment.findFirst({ where: { tenantId, clientId: clienteId, professionalId: quien.professionalId }, select: { id: true } });
    if (!suya) return { denegada: sinPuerta };
  }

  const where: Prisma.AppointmentWhereInput = {
    tenantId,
    clientId: clienteId,
    ...(f.profesional ? { professionalId: f.profesional } : {}),
    ...(f.servicio ? { serviceId: f.servicio } : {}),
    ...(f.desde || f.hasta
      ? {
          startsAt: {
            ...(f.desde ? { gte: businessWallTimeToUtc(f.desde, "00:00") } : {}),
            ...(f.hasta ? { lt: businessWallTimeToUtc(diaSiguienteDe(f.hasta), "00:00") } : {}),
          },
        }
      : {}),
  };
  const total = await tx.appointment.count({ where });
  const paginas = Math.max(1, Math.ceil(total / TURNOS_POR_PAGINA));
  const pagina = Math.min(f.pagina, paginas);
  const filas = await tx.appointment.findMany({
    where,
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
    skip: (pagina - 1) * TURNOS_POR_PAGINA,
    take: TURNOS_POR_PAGINA,
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      notes: vista.notas,
      professionalId: true,
      professional: { select: { name: true } },
      service: { select: { name: true } },
      box: { select: { name: true } },
      ...(vista.montos !== "ninguno" ? { payment: { select: { status: true, amount: true } } } : {}),
    },
  });
  const ids = filas.map((t) => t.id);
  const conPlata = filas.filter((t) => veMontosDelTurno(vista, t.professionalId, quien.professionalId)).map((t) => t.id);

  const auditoria =
    ids.length === 0
      ? []
      : await tx.auditLog.findMany({
          where: { tenantId, entity: "Appointment", entityId: { in: ids }, ...(vista.rastro ? {} : { action: { in: ACCIONES_DEL_CIERRE } }) },
          orderBy: { createdAt: "asc" },
          select: { actor: true, action: true, entityId: true, channel: true, changes: true, createdAt: true },
        });
  const cobros = await cobrosDetalladosPorTurno(tx, tenantId, conPlata);
  const idsDeUsuarios = usuariosDelRastro(auditoria);
  const usuarios = idsDeUsuarios.length
    ? await tx.user.findMany({ where: { tenantId, id: { in: idsDeUsuarios } }, select: { id: true, name: true } })
    : [];

  const [profesionales, servicios] = [
    await tx.appointment.findMany({ where: { tenantId, clientId: clienteId }, distinct: ["professionalId"], select: { professional: { select: { id: true, name: true } } } }),
    await tx.appointment.findMany({ where: { tenantId, clientId: clienteId }, distinct: ["serviceId"], select: { service: { select: { id: true, name: true } } } }),
  ];

  const plata = new Set(conPlata);
  const leidos: TurnoLeidoDeHistoria[] = filas.map((t) => {
    let cobrado: number | null = null;
    if (plata.has(t.id)) {
      const vivos = cobros.get(t.id) ?? [];
      const pago = "payment" in t ? (t.payment as { status: string; amount: number } | null) : null;
      cobrado = vivos.length > 0 ? sumarAlCentavo(vivos.map((c) => c.amount)) : pago?.status === "APPROVED" ? pago.amount : 0;
    }
    return {
      id: t.id,
      startsAt: t.startsAt,
      endsAt: t.endsAt,
      status: t.status,
      notes: vista.notas ? ((t as { notes?: string | null }).notes ?? null) : null,
      professionalId: t.professionalId,
      profesional: t.professional.name,
      servicio: t.service.name,
      box: t.box.name,
      cobrado,
    };
  });

  const porNombre = <T extends { nombre: string }>(a: T, b: T) => a.nombre.localeCompare(b.nombre, "es");
  const historia: HistoriaDeLaClienta = {
    clienta: { id: clienta.id, nombre: clienta.name },
    vista,
    turnos: armarLineaDeTiempo(leidos, auditoria, new Map(usuarios.map((u) => [u.id, u.name])), vista, quien.professionalId),
    total,
    pagina,
    paginas,
    opciones: {
      profesionales: profesionales.map((p) => ({ id: p.professional.id, nombre: p.professional.name })).sort(porNombre),
      servicios: servicios.map((s) => ({ id: s.service.id, nombre: s.service.name })).sort(porNombre),
    },
  };
  return { historia };
}

/**
 * La historia de la clienta, o `null` si no es de este negocio o quien mira no puede abrirla, SIN
 * auditar. Sólo para la demo (que no persiste nada, ver la página) y los tests del lector: la pantalla
 * real usa `abrirHistoriaDeLaClienta`.
 */
export async function leerHistoriaDeLaClienta(
  tenantId: string,
  clienteId: string,
  quien: QuienMiraLaHistoria,
  filtros: FiltrosDeHistoria,
): Promise<HistoriaDeLaClienta | null> {
  return (await tenantTransaction((tx) => leerEn(tx, tenantId, clienteId, quien, filtros), { tenantId })).historia ?? null;
}

/** Tope del id pedido que se guarda en la auditoría (viene de la URL: un cuid mide 25). */
const LARGO_MAXIMO_DEL_ID = 64;

/**
 * Abre la historia AUDITANDO EN MODO ESTRICTO, en la misma transacción: deja `historia_vista` (quién,
 * qué clienta, qué página, si filtró) o `historia_denegada` (quién, qué id pidió y por qué). Devuelve
 * la historia o `null` (a quien mira no se le dice si la clienta existe). Si el registro no se puede
 * escribir, LANZA y no devuelve nada: la página muestra «No pudimos registrar el acceso».
 * `actor`: el de la sesión, `user:<id>`, como `auditAdmin`.
 */
export async function abrirHistoriaDeLaClienta(
  tenantId: string,
  clienteId: string,
  quien: QuienMiraLaHistoria,
  filtros: FiltrosDeHistoria,
  actor: string,
): Promise<HistoriaDeLaClienta | null> {
  return tenantTransaction(
    async (tx) => {
      const lectura = await leerEn(tx, tenantId, clienteId, quien, filtros);
      await tx.auditLog.create({
        data: lectura.historia
          ? {
              tenantId,
              actor,
              action: ACCION_HISTORIA_VISTA,
              entity: "Client",
              entityId: lectura.historia.clienta.id,
              changes: { pagina: lectura.historia.pagina, filtros: hayFiltrosDeHistoria(filtros) },
              channel: "admin",
            }
          : {
              tenantId,
              actor,
              action: ACCION_HISTORIA_DENEGADA,
              entity: "Client",
              entityId: clienteId.slice(0, LARGO_MAXIMO_DEL_ID),
              changes: { motivo: lectura.denegada, rol: quien.role.slice(0, 32) },
              channel: "admin",
            },
      });
      return lectura.historia ?? null;
    },
    { tenantId },
  );
}

export interface ClientaDelBuscador {
  id: string;
  nombre: string;
  telefono: string;
}

/**
 * Las clientas de una PROFESIONAL (con al menos un turno con ella), por nombre o teléfono. La dueña
 * y la recepción usan el listado de fichas de siempre (`leerPaginaDeFichas`); la profesional, éste,
 * que nunca le muestra una clienta ajena. Sin tildes en la comparación: `contains` insensible a
 * mayúsculas (deuda anotada: el listado de fichas sí las ignora).
 */
export function clientasDeLaProfesional(tenantId: string, professionalId: string, q: string): Promise<ClientaDelBuscador[]> {
  const t = q.trim().slice(0, 60);
  return tenantTransaction(
    async (tx) =>
      (
        await tx.client.findMany({
          where: {
            tenantId,
            appointments: { some: { tenantId, professionalId } },
            ...(t ? { OR: [{ name: { contains: t, mode: "insensitive" as const } }, { phone: { contains: t } }] } : {}),
          },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take: 50,
          select: { id: true, name: true, phone: true },
        })
      ).map((c) => ({ id: c.id, nombre: c.name, telefono: c.phone })),
    { tenantId },
  );
}
