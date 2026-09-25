// ============================================================================
// CARGAS DE LAS PANTALLAS COMERCIALES — lo que sólo lee una página (servidor).
// ============================================================================
//
// Lo que comparte una pantalla con su número del Inicio vive en lecturas.ts (recibe el cliente
// de base por parámetro). Acá va lo que lee UNA sola página: la ficha completa, los grupos de
// duplicadas, los huecos liberados de la lista de espera. Usan el `prisma` del request, así
// que llevan `server-only`: si un componente cliente lo importara por error, el build lo dice
// con todas las letras.
//
// NO lleva "use server": cada export sería un endpoint. La guardia (`requireApp`) la pone la
// página ANTES de llamar a esto; el negocio sale siempre del request (`getCurrentTenantId`),
// nunca de un parámetro.

import "server-only";
import { redondearAlCentavo } from "@/lib/dinero/redondeo";
import { cache } from "react";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { todayInBusinessTz } from "@/lib/datetime";
import { negocioActual } from "@/apps/kpis/negocio.server";
import { cobrosDetalladosPorTurno } from "@/lib/turnos/anulacion";
import type { EventoConstancia } from "./constancias";
import { ultimoPermiso } from "./constancias";
import { resumirFicha, type ResumenFicha } from "./ficha";
import { compradoresSinFicha, gruposDuplicados, pedidosDeLaFicha, type GrupoDuplicadas } from "./identidad";
import { huecosLiberados, type HuecoLiberado, type Anotado } from "./huecos";
import {
  desdeHistorial,
  evaluarFichas,
  leerFichasConActividad,
  whereFichasDelNegocio,
  type ContextoCrm,
} from "./lecturas";
import { ACCION_CONTACTO, CRM_REGLAS, ENTIDAD_CONTACTO, ENTIDAD_PERMISO } from "./reglas";
import type { Evaluacion } from "./segmentos";
import { whereCancelacionesRecientes, whereEsperando } from "./wheres";

// ¿Falta la tabla en la base (migración sin aplicar)? Por forma, como en turnos/anulacion.ts.
function faltaLaTabla(e: unknown): boolean {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  return code === "P2021" || code === "P2022";
}

/** El negocio, el día y el rubro del request, leídos una vez. */
export const contextoCrm = cache(async (): Promise<ContextoCrm> => {
  const [tenantId, negocio] = await Promise.all([getCurrentTenantId(), negocioActual()]);
  return { tenantId, hoy: todayInBusinessTz(), ahora: new Date(), rubro: negocio.isRetail ? "mostrador" : "servicios" };
});

/** El nombre del negocio, para firmar los mensajes. */
export const nombreDelNegocio = cache(async (): Promise<string> => {
  const tenantId = await getCurrentTenantId();
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return t?.name?.trim() || "el negocio";
});

/**
 * La dirección del sitio del negocio, para el link de la reseña. El panel y el sitio se sirven
 * bajo el MISMO host (tenant.ts: el subdominio del negocio), así que alcanza con el del request.
 * `null` si no se puede saber: el texto sale sin link, no con uno roto.
 */
export async function urlDelSitio(): Promise<string | null> {
  try {
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host"))?.split(",")[0]?.trim();
    if (!host) return null;
    const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return null;
  }
}

/** Nombre de cada usuario del negocio, para decir QUIÉN hizo algo ("user:<id>" → "Ana"). */
export async function nombresDeUsuarios(tenantId: string): Promise<Map<string, string>> {
  const usuarios = await prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } });
  return new Map(usuarios.map((u) => [`user:${u.id}`, u.name]));
}

// ── La ficha completa ───────────────────────────────────────────────────────

export type FichaCompleta = NonNullable<Awaited<ReturnType<typeof cargarFichaCompleta>>>;

export async function cargarFichaCompleta(id: string) {
  const c = await contextoCrm();
  const { tenantId, ahora } = c;
  const client = await prisma.client.findFirst({
    where: { id, tenantId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      notes: true,
      birthDate: true,
      isResident: true,
      createdAt: true,
      appointments: {
        orderBy: { startsAt: "desc" },
        select: {
          id: true,
          status: true,
          startsAt: true,
          notes: true,
          priceAtBooking: true,
          service: { select: { name: true, price: true } },
          professional: { select: { name: true } },
          payment: { select: { status: true, amount: true } },
          review: { select: { rating: true } },
        },
      },
    },
  });
  if (!client) return null;

  const [cobros, pedidosCrudos, fiado, eventos, usuarios, fichas] = await Promise.all([
    cobrosDetalladosPorTurno(prisma, tenantId, client.appointments.map((a) => a.id)),
    prisma.order.findMany({
      where: {
        tenantId,
        OR: [{ clientId: client.id }, { clientId: null, createdAt: { gte: desdeHistorial(ahora) } }],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, code: true, createdAt: true, status: true, total: true, paid: true, paymentMethod: true, channel: true, clientId: true, customerPhone: true },
    }),
    cargarFiado(tenantId, client.id),
    prisma.auditLog.findMany({
      where: { tenantId, entity: { in: [ENTIDAD_PERMISO, ENTIDAD_CONTACTO] }, entityId: client.id },
      orderBy: { createdAt: "asc" },
      select: { entity: true, action: true, entityId: true, createdAt: true, actor: true, changes: true },
    }),
    nombresDeUsuarios(tenantId),
    // La base entera, para que el ciclo y el segmento de ESTA ficha salgan con la misma cuenta que
    // las listas (el ciclo de un servicio se calcula sobre todas las clientas).
    leerFichasConActividad(prisma, tenantId, { desde: desdeHistorial(ahora), rubro: c.rubro }),
  ]);

  const pedidos = pedidosDeLaFicha(client.id, client.phone, pedidosCrudos);
  const turnos = client.appointments.map((a) => ({
    ...a,
    precio: a.priceAtBooking ?? a.service.price,
    cobros: cobros.get(a.id) ?? [],
  }));
  const resumen: ResumenFicha = resumirFicha({
    turnos: turnos.map((t) => ({
      id: t.id,
      status: t.status,
      startsAt: t.startsAt,
      precio: t.precio,
      cobros: t.cobros,
      pagoLegado: t.payment,
      servicio: t.service.name,
      profesional: t.professional.name,
    })),
    pedidos: pedidos.map((p) => ({ id: p.id, status: p.status, createdAt: p.createdAt, total: p.total, paid: p.paid, paymentMethod: p.paymentMethod })),
    fiado: fiado ? fiado.map((f) => ({ id: f.id, saldo: f.saldo })) : null,
    ahora,
  });
  const evaluada = evaluarFichas(fichas, c.rubro, c.hoy, ahora).find((x) => x.persona.id === client.id);
  const permisos: EventoConstancia[] = eventos.filter((e) => e.entity === ENTIDAD_PERMISO);
  const permiso = ultimoPermiso(permisos, client.id);
  const ultimoContacto = eventos.filter((e) => e.entity === ENTIDAD_CONTACTO && e.action === ACCION_CONTACTO).at(-1) ?? null;

  return {
    client,
    turnos,
    pedidos,
    fiado,
    resumen,
    ev: (evaluada?.ev ?? null) as Evaluacion | null,
    cumple: evaluada?.persona.cumple ?? null,
    rubro: c.rubro,
    hoy: c.hoy,
    permiso: permiso
      ? { accion: permiso.action, el: permiso.createdAt, por: usuarios.get(permiso.actor ?? "") ?? null }
      : null,
    ultimoContacto: ultimoContacto
      ? {
          el: ultimoContacto.createdAt,
          por: usuarios.get(ultimoContacto.actor) ?? null,
          motivo: (ultimoContacto.changes as { motivo?: unknown } | null)?.motivo ?? null,
        }
      : null,
  };
}

/** El fiado abierto de una ficha con su saldo, o `null` si la tabla no está en esta base. */
async function cargarFiado(tenantId: string, clientId: string) {
  try {
    const deudas = await prisma.accountReceivable.findMany({
      where: { tenantId, clientId, status: "OPEN" },
      orderBy: { issueDate: "desc" },
      select: { id: true, amount: true, concept: true, issueDate: true, dueDate: true },
    });
    if (deudas.length === 0) return [];
    const cobrado = await prisma.collection.groupBy({
      by: ["originId"],
      where: { tenantId, originType: "RECEIVABLE", originId: { in: deudas.map((d) => d.id) } },
      _sum: { amount: true },
    });
    const porDeuda = new Map(cobrado.map((g) => [g.originId, g._sum.amount?.toNumber() ?? 0]));
    return deudas
      .map((d) => ({
        id: d.id,
        concepto: d.concept,
        emitida: d.issueDate,
        vence: d.dueDate,
        total: d.amount.toNumber(),
        saldo: redondearAlCentavo(d.amount.toNumber() - (porDeuda.get(d.id) ?? 0)),
      }))
      .filter((d) => d.saldo > 0);
  } catch (e) {
    if (faltaLaTabla(e)) return null;
    throw e;
  }
}

// ── Fichas duplicadas ───────────────────────────────────────────────────────

export type FichaDuplicada = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: Date;
  turnos: number;
  pedidos: number;
  fiado: number | null;
};

/**
 * Los grupos de fichas con el mismo teléfono. El `where` es el de la lista de Clientes
 * (`whereFichasDelNegocio`): el número del Inicio cuenta los mismos grupos.
 */
export async function cargarDuplicadas(): Promise<GrupoDuplicadas<FichaDuplicada>[]> {
  const { tenantId } = await contextoCrm();
  const base = { id: true, name: true, phone: true, email: true, createdAt: true } as const;
  let fichas: FichaDuplicada[];
  try {
    const filas = await prisma.client.findMany({
      where: whereFichasDelNegocio(tenantId),
      select: { ...base, _count: { select: { appointments: true, orders: true, receivables: true } } },
    });
    fichas = filas.map((f) => ({ ...f, turnos: f._count.appointments, pedidos: f._count.orders, fiado: f._count.receivables }));
  } catch (e) {
    // Sin la tabla del fiado en esta base, se cuentan turnos y pedidos igual.
    if (!faltaLaTabla(e)) throw e;
    const filas = await prisma.client.findMany({
      where: whereFichasDelNegocio(tenantId),
      select: { ...base, _count: { select: { appointments: true, orders: true } } },
    });
    fichas = filas.map((f) => ({ ...f, turnos: f._count.appointments, pedidos: f._count.orders, fiado: null }));
  }
  return gruposDuplicados(fichas);
}

/** Las últimas unificaciones, con quién las hizo y qué movieron (la auditoría, para deshacer). */
export async function cargarUnificacionesRecientes() {
  const { tenantId } = await contextoCrm();
  const [filas, usuarios] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId, entity: "Client", action: "unificar" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, createdAt: true, actor: true, entityId: true, changes: true },
    }),
    nombresDeUsuarios(tenantId),
  ]);
  return filas.map((f) => {
    const ch = (f.changes ?? {}) as {
      conserva?: { name?: string };
      eliminadas?: { name?: string; phone?: string }[];
      movidos?: { turnos?: string[]; pedidos?: string[]; fiado?: string[] };
    };
    return {
      id: f.id,
      el: f.createdAt,
      por: usuarios.get(f.actor) ?? "alguien del equipo",
      queda: ch.conserva?.name ?? "—",
      eliminadas: (ch.eliminadas ?? []).map((e) => e.name ?? "—"),
      turnos: ch.movidos?.turnos?.length ?? 0,
      pedidos: ch.movidos?.pedidos?.length ?? 0,
      fiado: ch.movidos?.fiado?.length ?? 0,
    };
  });
}

// ── Huecos liberados (lista de espera) ──────────────────────────────────────

export type AnotadoConAviso = Anotado & {
  clientEmail: string | null;
  preferenceNote: string | null;
  avisadoPor: string | null;
};

/**
 * Los turnos cancelados en las últimas 48 h que todavía no pasaron, siguen libres y le sirven a
 * alguien de la lista (huecos.ts). Cuatro lecturas chicas: cancelaciones (auditoría), esos
 * turnos, lo que se agendó encima y los anotados.
 */
export async function cargarHuecosLiberados(): Promise<HuecoLiberado<AnotadoConAviso>[]> {
  const { tenantId, ahora } = await contextoCrm();
  const desde = new Date(ahora.getTime() - CRM_REGLAS.huecoVentanaHoras * 3_600_000);
  const cancelaciones = await prisma.auditLog.findMany({
    where: whereCancelacionesRecientes(tenantId, desde),
    select: { entityId: true },
  });
  const ids = [...new Set(cancelaciones.flatMap((c) => (c.entityId ? [c.entityId] : [])))];
  if (ids.length === 0) return [];
  const cancelados = await prisma.appointment.findMany({
    where: { tenantId, id: { in: ids }, status: "CANCELLED", startsAt: { gt: ahora } },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      serviceId: true,
      professionalId: true,
      service: { select: { name: true } },
      professional: { select: { name: true } },
    },
  });
  if (cancelados.length === 0) return [];
  const desdeT = new Date(Math.min(...cancelados.map((a) => a.startsAt.getTime())));
  const hastaT = new Date(Math.max(...cancelados.map((a) => a.endsAt.getTime())));
  const [vivos, anotados] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        tenantId,
        professionalId: { in: [...new Set(cancelados.map((a) => a.professionalId))] },
        status: { not: "CANCELLED" },
        startsAt: { lt: hastaT },
        endsAt: { gt: desdeT },
      },
      select: { professionalId: true, startsAt: true, endsAt: true },
    }),
    prisma.waitlistEntry.findMany({
      where: whereEsperando(tenantId),
      select: {
        id: true,
        clientName: true,
        clientPhone: true,
        clientEmail: true,
        serviceId: true,
        professionalId: true,
        status: true,
        notifiedAt: true,
        preferenceNote: true,
        createdAt: true,
      },
    }),
  ]);
  const huecos = huecosLiberados({
    cancelados: cancelados.map((a) => ({
      appointmentId: a.id,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      serviceId: a.serviceId,
      servicio: a.service.name,
      professionalId: a.professionalId,
      profesional: a.professional.name,
    })),
    vivos,
    anotados: anotados.map((a) => ({ ...a, avisadoPor: null as string | null })),
    ahora,
  });
  if (huecos.length === 0) return [];
  // Quién avisó a cada anotado (la constancia del botón de WhatsApp).
  const entradas = [...new Set(huecos.flatMap((h) => h.anotados.map((a) => a.id)))];
  const [avisos, usuarios] = await Promise.all([
    prisma.auditLog.findMany({
      where: { tenantId, entity: "WaitlistEntry", action: "notify", entityId: { in: entradas } },
      orderBy: { createdAt: "asc" },
      select: { entityId: true, actor: true },
    }),
    nombresDeUsuarios(tenantId),
  ]);
  const quien = new Map(avisos.map((a) => [a.entityId, usuarios.get(a.actor) ?? null]));
  return huecos.map((h) => ({ ...h, anotados: h.anotados.map((a) => ({ ...a, avisadoPor: quien.get(a.id) ?? null })) }));
}

// ── Quién compró sin ficha (mostrador) ───────────────────────────────────────

export type CompradorSinFicha = { clave: string; nombre: string; telefono: string; pedidos: number; ultimo: Date };

/**
 * Los que compraron dejando un teléfono que no es de ninguna ficha, agrupados por el número
 * (identidad.ts). En un mostrador la venta no crea la ficha (el pedido se ata sólo si ya
 * existía, order-core.ts): ésta es la lista para crearlas, y al crearla sus pedidos quedan en
 * su historial. Los 20 de compra más reciente.
 */
export async function cargarCompradoresSinFicha(): Promise<CompradorSinFicha[]> {
  const { tenantId, ahora } = await contextoCrm();
  const [pedidos, fichas] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId, clientId: null, status: { not: "CANCELLED" }, createdAt: { gte: desdeHistorial(ahora) } },
      orderBy: { createdAt: "desc" },
      select: { customerName: true, customerPhone: true, createdAt: true },
    }),
    prisma.client.findMany({ where: whereFichasDelNegocio(tenantId), select: { phone: true } }),
  ]);
  return compradoresSinFicha(pedidos, fichas).slice(0, 20);
}

// ── Faltazos por ficha (el aviso al dar un turno) ───────────────────────────

/** Cuántas veces faltó sin avisar cada ficha, sólo las que llegan al umbral del aviso. */
export async function cargarFaltazosPorFicha(): Promise<Record<string, number>> {
  const { tenantId } = await contextoCrm();
  const grupos = await prisma.appointment.groupBy({
    by: ["clientId"],
    where: { tenantId, status: "NO_SHOW" },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const g of grupos) {
    const n = g._count._all;
    if (n >= CRM_REGLAS.faltazosParaAviso) out[g.clientId] = n;
  }
  return out;
}
