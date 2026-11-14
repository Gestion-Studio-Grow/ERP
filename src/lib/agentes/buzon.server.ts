// ============================================================================
// EQUIPO DE AGENTES · buzón: alta, toma, cierre, vencimiento y rescate de pedidos (03 §4.3).
// ============================================================================
// Toda transacción que escribe mira primero la vigencia (03 §12.1). Las únicas escrituras que valen
// sin vigencia: cerrar un pedido como NECESITA_PERSONA (o SIN_RESPONDER si ya pasó su plazo) y su
// fila de registro. Nada de acá toma ni cierra un pedido EN_BANDEJA: todos los `updateMany` piden
// RECIBIDO o EN_CURSO (03 §4.4, invariante 3). Y todo lo que toca un pedido de una persona lleva su
// `userId` en el `where`: el rescate de una persona nunca procesa el pedido de otra (03 §4.3, punto 3).

import "server-only";
import { tenantTransaction } from "@/lib/rls";
import type { Prisma } from "@/generated/prisma/client";
import { exigirCupo, TopeAlcanzado } from "./contadores.server";
import { registrar, type FilaDeRegistro } from "./registro.server";
import { esMigracionPendiente, rutaDelTextoLibre, textoSinVigencia, vigencia } from "./estado.server";
import { buscarPuesto, periodoDelTope, PUESTO_DE_LOS_PEDIDOS, puestosVisibles, TOPES } from "./permisos-core";
import {
  COLGADO_RECIBIDO_MS,
  dentroDelObjetivo,
  estadoMostrado,
  metricas,
  MINIMO_PARA_TOMAR_MS,
  objetivoDelNegocio,
  presupuestoDelIntento,
  TEXTO_MAXIMO,
  venceElDe,
  type MetricasDelBuzon,
} from "./buzon-core";
import type { Equipo, EstadoPedido, Fila, PedidoDelBuzon, TipoPedido, Tx, Vigencia, Vista } from "./tipos";

export type MotivoAltaRechazada = "invalido" | "sin_permiso" | "apagado" | "pausado" | "tope" | "sin_tablas";

export type ResultadoAlta =
  | { ok: true; pedido: { id: string; estado: EstadoPedido; venceEl: Date }; nuevo: boolean; procesar: boolean }
  | { ok: false; motivo: MotivoAltaRechazada; mensaje: string };

export interface EntradaDelPedido {
  puesto: string;
  tipo: TipoPedido;
  frecuente?: string | null;
  argumentos?: Record<string, unknown> | null;
  texto?: string | null;
  /** La genera el navegador AL MONTAR el formulario, no en el clic: dos toques = un pedido. */
  clave: string;
}

const CLAVE_VALIDA = /^[A-Za-z0-9_-]{8,100}$/;
const ESTADOS_TOMABLES = ["RECIBIDO", "EN_CURSO"] as const;

function rechazo(motivo: MotivoAltaRechazada, mensaje: string): ResultadoAlta {
  return { ok: false, motivo, mensaje };
}

function argumentosValidos(a: unknown): a is Record<string, unknown> {
  if (a === null || typeof a !== "object" || Array.isArray(a)) return false;
  if (Object.prototype.hasOwnProperty.call(a, "tenantId")) return false;
  return JSON.stringify(a).length <= 2000;
}

const SELECT_PEDIDO = {
  id: true,
  puesto: true,
  userId: true,
  tipo: true,
  frecuente: true,
  argumentos: true,
  texto: true,
  estado: true,
  pedidoEl: true,
  venceEl: true,
  tomadoHasta: true,
  intentos: true,
  respondidoEl: true,
  respuesta: true,
  filas: true,
  motivo: true,
  conModelo: true,
  respondidoPor: true,
} as const;

type FilaPedido = Prisma.AgentePedidoGetPayload<{ select: typeof SELECT_PEDIDO }>;

function aPedido(f: FilaPedido): PedidoDelBuzon & { argumentos: Record<string, unknown> | null } {
  return {
    ...f,
    tipo: f.tipo as TipoPedido,
    estado: f.estado as EstadoPedido,
    filas: Array.isArray(f.filas) ? (f.filas as unknown as Fila[]) : null,
    argumentos: f.argumentos && typeof f.argumentos === "object" && !Array.isArray(f.argumentos) ? (f.argumentos as Record<string, unknown>) : null,
  };
}

/**
 * Alta de un pedido (03 §4.3, «Alta»). Una transacción corta: vigencia (en pausa o apagado NO entra),
 * alta con `skipDuplicates` (count 0 = reenvío: se devuelve el que ya estaba) y cupo de pedidos por
 * persona (sin cupo, se deshace todo). Un texto libre sin ruta 1 nace EN_BANDEJA, con el mismo plazo,
 * y no se le agenda ningún proceso (`procesar: false`).
 */
export async function dejarPedido(
  vista: Vista,
  entrada: EntradaDelPedido,
  deps: { equipos: readonly Equipo[]; ahora: Date; nuevoId?: () => string; env?: Readonly<Record<string, string | undefined>> },
): Promise<ResultadoAlta> {
  const tenantId = vista.tenantId;
  const encontrado = buscarPuesto(deps.equipos, entrada.puesto);
  if (!encontrado || !encontrado.puesto.activo) return rechazo("invalido", "Ese puesto no existe.");
  if (!puestosVisibles(deps.equipos, (m) => vista.puedeVer(m)).includes(encontrado.puesto.id)) return rechazo("sin_permiso", "No ves ese equipo.");
  if (typeof entrada.clave !== "string" || !CLAVE_VALIDA.test(entrada.clave)) return rechazo("invalido", "Falta la clave del envío.");
  const { puesto } = encontrado;

  let frecuente: (typeof puesto.frecuentes)[number] | null = null;
  let texto: string | null = null;
  if (entrada.tipo === "LISTA") {
    frecuente = puesto.frecuentes.find((f) => f.id === entrada.frecuente) ?? null;
    if (!frecuente) return rechazo("invalido", "Ese pedido no está en la lista del puesto.");
    if (entrada.argumentos != null && !argumentosValidos(entrada.argumentos)) return rechazo("invalido", "Los datos del pedido no son válidos.");
  } else if (entrada.tipo === "LIBRE") {
    texto = typeof entrada.texto === "string" ? entrada.texto.trim() : "";
    if (!texto) return rechazo("invalido", "Escribí el pedido.");
    if (texto.length > TEXTO_MAXIMO) return rechazo("invalido", `El pedido puede tener hasta ${TEXTO_MAXIMO} caracteres.`);
  } else {
    return rechazo("invalido", "Tipo de pedido inválido.");
  }

  const ahora = deps.ahora;
  try {
    return await tenantTransaction(
      async (tx): Promise<ResultadoAlta> => {
        const v = await vigencia(tx, { tenantId, puesto: puesto.id });
        if (!v.vigente) return rechazo(v.motivo, textoSinVigencia(v));

        const ajuste = await tx.agenteAjuste.findFirst({ where: { tenantId }, select: { objetivoSeg: true } });
        const venceEl = venceElDe(ahora, objetivoDelNegocio(ajuste?.objetivoSeg));
        const estado: EstadoPedido = entrada.tipo === "LIBRE" && (await rutaDelTextoLibre(tx, tenantId, deps.env)) === "bandeja" ? "EN_BANDEJA" : "RECIBIDO";

        const alta = await tx.agentePedido.createMany({
          data: [
            {
              ...(deps.nuevoId ? { id: deps.nuevoId() } : {}),
              tenantId,
              puesto: puesto.id,
              userId: vista.userId,
              tipo: entrada.tipo,
              frecuente: frecuente?.id ?? null,
              argumentos: (entrada.tipo === "LISTA" ? (entrada.argumentos ?? {}) : undefined) as Prisma.InputJsonValue | undefined,
              texto,
              clave: entrada.clave,
              estado,
              pedidoEl: ahora,
              venceEl,
            },
          ],
          skipDuplicates: true,
        });
        const pedido = await tx.agentePedido.findFirst({
          where: { tenantId, userId: vista.userId, clave: entrada.clave },
          select: { id: true, estado: true, venceEl: true },
        });
        if (!pedido) throw new Error("El pedido no quedó guardado.");
        if (alta.count === 0) return { ok: true, pedido: { ...pedido, estado: pedido.estado as EstadoPedido }, nuevo: false, procesar: false };

        // Cupo de pedidos por persona y, si el pedido de la lista lo tiene, su cupo propio.
        await exigirCupo(tx, { tenantId, puesto: PUESTO_DE_LOS_PEDIDOS, tope: "pedidos_por_dia", sujeto: vista.userId, periodo: periodoDelTope("pedidos_por_dia", ahora), max: TOPES.pedidos_por_dia.max });
        if (frecuente?.tope) {
          const t = TOPES[frecuente.tope];
          await exigirCupo(tx, { tenantId, puesto: puesto.id, tope: frecuente.tope, sujeto: t.sujeto === "persona" ? vista.userId : "*", periodo: periodoDelTope(frecuente.tope, ahora), max: t.max });
        }
        return { ok: true, pedido: { ...pedido, estado: pedido.estado as EstadoPedido }, nuevo: true, procesar: estado === "RECIBIDO" };
      },
      { tenantId },
    );
  } catch (e) {
    if (e instanceof TopeAlcanzado) return rechazo("tope", e.tope === "pedidos_por_dia" ? "Llegaste al máximo de pedidos de hoy." : "Llegaste al máximo de hoy para este pedido.");
    if (esMigracionPendiente(e)) return rechazo("sin_tablas", "Falta activar el equipo.");
    throw e;
  }
}

// ── Tomar y cerrar (los usa el motor; cada uno es UNA transacción corta) ───────────────────────

export type ResultadoToma =
  | { tomado: true; pedido: PedidoDelBuzon & { argumentos: Record<string, unknown> | null }; intento: number; hasta: Date; vigencia: Extract<Vigencia, { vigente: true }> }
  | { tomado: false; motivo: "no_existe" | "ocupado" | "sin_tiempo" | "en_bandeja" | "cerrado_sin_vigencia" };

/**
 * Paso 1 · Tomar (03 §4.3). Sólo un pedido de ESA persona (userId en el where), RECIBIDO o EN_CURSO
 * con la toma vencida, y con 30 s o más de plazo. Sin vigencia no sale en silencio: lo cierra como
 * NECESITA_PERSONA con el motivo y su fila de registro.
 */
export async function tomarPedido(p: { tenantId: string; id: string; userId: string; ahora: Date; maxDurationSeg?: number }): Promise<ResultadoToma> {
  const { tenantId, id, userId, ahora } = p;
  return tenantTransaction(
    async (tx): Promise<ResultadoToma> => {
      const fila = await tx.agentePedido.findFirst({ where: { tenantId, id, userId }, select: SELECT_PEDIDO });
      if (!fila) return { tomado: false, motivo: "no_existe" };
      if (fila.estado === "EN_BANDEJA") return { tomado: false, motivo: "en_bandeja" };
      const tomable = {
        tenantId,
        id,
        userId,
        OR: [{ estado: "RECIBIDO" }, { estado: "EN_CURSO", tomadoHasta: { lt: ahora } }],
      } satisfies Prisma.AgentePedidoWhereInput;

      const v = await vigencia(tx, { tenantId, puesto: fila.puesto });
      if (!v.vigente) {
        const cerrados = await cerrarSinVigenciaEnTx(tx, { tenantId, where: tomable, puesto: fila.puesto, pedidoId: id, venceEl: fila.venceEl, ahora, v });
        return cerrados ? { tomado: false, motivo: "cerrado_sin_vigencia" } : { tomado: false, motivo: "ocupado" };
      }
      const presupuesto = presupuestoDelIntento(ahora, fila.venceEl, p.maxDurationSeg);
      if (!presupuesto) return { tomado: false, motivo: "sin_tiempo" };
      const r = await tx.agentePedido.updateMany({
        where: { ...tomable, venceEl: { gte: new Date(ahora.getTime() + MINIMO_PARA_TOMAR_MS) } },
        data: { estado: "EN_CURSO", tomadoHasta: presupuesto.hasta, intentos: { increment: 1 } },
      });
      if (r.count === 0) return { tomado: false, motivo: "ocupado" };
      return { tomado: true, pedido: aPedido({ ...fila, estado: "EN_CURSO", tomadoHasta: presupuesto.hasta, intentos: fila.intentos + 1 }), intento: fila.intentos + 1, hasta: presupuesto.hasta, vigencia: v };
    },
    { tenantId },
  );
}

/** Cierre por falta de vigencia: NECESITA_PERSONA (o SIN_RESPONDER si ya venció), sin respuesta. */
async function cerrarSinVigenciaEnTx(
  tx: Tx,
  p: {
    tenantId: string;
    where: Prisma.AgentePedidoWhereInput;
    puesto: string;
    pedidoId: string;
    venceEl: Date;
    ahora: Date;
    v: Extract<Vigencia, { vigente: false }>;
    detalle?: Record<string, unknown>;
    /** Lo ya gastado en el modelo: se registra aunque no se guarde la respuesta (es plata gastada). */
    consumo?: Partial<Pick<FilaDeRegistro, "proveedor" | "modelo" | "tokensEntrada" | "tokensSalida" | "microUsd">>;
  },
): Promise<boolean> {
  const vencido = p.ahora.getTime() > p.venceEl.getTime();
  const r = await tx.agentePedido.updateMany({
    where: p.where,
    data: vencido
      ? { estado: "SIN_RESPONDER", motivo: "plazo", tomadoHasta: null }
      : { estado: "NECESITA_PERSONA", motivo: textoSinVigencia(p.v), respondidoEl: p.ahora, tomadoHasta: null },
  });
  if (r.count === 0) return false;
  await registrar(tx, {
    tenantId: p.tenantId,
    puesto: p.puesto,
    tipo: vencido ? "VENCIDO" : "PAUSA",
    actor: `agente:${p.puesto}`,
    ahora: p.ahora,
    pedidoId: p.pedidoId,
    ...(p.consumo ?? {}),
    detalle: { motivo: p.v.motivo, ...(p.detalle ?? {}) },
  });
  return true;
}

export interface ResultadoDelProceso {
  estado: "RESPONDIDO" | "NECESITA_PERSONA";
  respuesta: string | null;
  filas: Fila[] | null;
  motivo: string | null;
  conModelo: boolean;
}

/** Lo que el motor quiere dejar en el registro al cerrar (lecturas, rechazos y consumo). */
export interface RastroDelProceso {
  acciones: { tipo: "LECTURA" | "RECHAZO" | "DERIVACION" | "TOPE" | "ERROR"; herramienta: string | null; nivel: number | null; detalle: Record<string, unknown> }[];
  consumo: { proveedor: string; modelo: string | null; tokensEntrada: number; tokensSalida: number; microUsd: number } | null;
}

/**
 * Paso 3 · Cerrar (03 §4.3). Vigencia primero: sin vigencia, NECESITA_PERSONA con el motivo y SIN la
 * respuesta a medio armar. Con vigencia, `updateMany` condicional (EN_CURSO y el mismo intento). Si
 * ya pasó el plazo, SIN_RESPONDER. Una fila RESPUESTA (o VENCIDO) con el tiempo y si entró en el objetivo.
 */
export async function cerrarPedido(p: {
  tenantId: string;
  id: string;
  userId: string;
  puesto: string;
  intento: number;
  ahora: Date;
  resultado: ResultadoDelProceso;
  rastro: RastroDelProceso;
}): Promise<{ cerrado: boolean; estado: EstadoPedido | null }> {
  const { tenantId, id, userId, ahora } = p;
  return tenantTransaction(
    async (tx) => {
      const fila = await tx.agentePedido.findFirst({ where: { tenantId, id, userId }, select: { pedidoEl: true, venceEl: true } });
      if (!fila) return { cerrado: false, estado: null };
      const enCurso = { tenantId, id, userId, estado: "EN_CURSO", intentos: p.intento } satisfies Prisma.AgentePedidoWhereInput;
      const consumo = p.rastro.consumo
        ? { proveedor: p.rastro.consumo.proveedor, modelo: p.rastro.consumo.modelo, tokensEntrada: p.rastro.consumo.tokensEntrada, tokensSalida: p.rastro.consumo.tokensSalida, microUsd: p.rastro.consumo.microUsd }
        : {};

      const v = await vigencia(tx, { tenantId, puesto: p.puesto });
      if (!v.vigente) {
        const herramientas = p.rastro.acciones.map((a) => a.herramienta).filter(Boolean);
        const ok = await cerrarSinVigenciaEnTx(tx, { tenantId, where: enCurso, puesto: p.puesto, pedidoId: id, venceEl: fila.venceEl, ahora, v, detalle: { herramientas }, consumo });
        return { cerrado: ok, estado: ok ? (ahora.getTime() > fila.venceEl.getTime() ? "SIN_RESPONDER" : "NECESITA_PERSONA") : null };
      }

      const vencido = ahora.getTime() > fila.venceEl.getTime();
      const estado: EstadoPedido = vencido ? "SIN_RESPONDER" : p.resultado.estado;
      const r = await tx.agentePedido.updateMany({
        where: enCurso,
        data: vencido
          ? { estado, motivo: "plazo", tomadoHasta: null, conModelo: p.resultado.conModelo }
          : {
              estado,
              respondidoEl: ahora,
              respuesta: p.resultado.respuesta,
              filas: (p.resultado.filas ?? undefined) as Prisma.InputJsonValue | undefined,
              motivo: p.resultado.motivo,
              conModelo: p.resultado.conModelo,
              tomadoHasta: null,
            },
      });
      if (r.count === 0) return { cerrado: false, estado: null };

      for (const a of p.rastro.acciones) {
        await registrar(tx, { tenantId, puesto: p.puesto, tipo: a.tipo, actor: `agente:${p.puesto}`, ahora, pedidoId: id, herramienta: a.herramienta, nivel: a.nivel, detalle: a.detalle });
      }
      const ms = ahora.getTime() - fila.pedidoEl.getTime();
      await registrar(tx, {
        tenantId,
        puesto: p.puesto,
        tipo: vencido ? "VENCIDO" : "RESPUESTA",
        actor: `agente:${p.puesto}`,
        ahora,
        pedidoId: id,
        ms,
        ...consumo,
        detalle: { estado, dentroDelObjetivo: !vencido && dentroDelObjetivo({ respondidoEl: ahora, venceEl: fila.venceEl }), respondio: "agente", motivo: p.resultado.motivo },
      });
      return { cerrado: true, estado };
    },
    { tenantId },
  );
}

// ── Lo que hace «Mi buzón» (acción del rubro, brief 1B): sólo lo propio ────────────────────────

/**
 * Cierra los pedidos PROPIOS vencidos (RECIBIDO o EN_CURSO con `venceEl` pasado) como SIN_RESPONDER,
 * con su fila VENCIDO. Vale sin vigencia (03 §12.1). Nunca toca EN_BANDEJA. Devuelve cuántos cerró.
 */
export async function vencerPropios(p: { tenantId: string; userId: string; ahora: Date }): Promise<number> {
  const { tenantId, userId, ahora } = p;
  return tenantTransaction(
    async (tx) => {
      const vencidos = await tx.agentePedido.updateManyAndReturn({
        where: { tenantId, userId, estado: { in: [...ESTADOS_TOMABLES] }, venceEl: { lt: ahora } },
        data: { estado: "SIN_RESPONDER", motivo: "plazo", tomadoHasta: null },
        select: { id: true, puesto: true },
      });
      for (const v of vencidos) {
        await registrar(tx, { tenantId, puesto: v.puesto, tipo: "VENCIDO", actor: `agente:${v.puesto}`, ahora, pedidoId: v.id, detalle: { motivo: "plazo" } });
      }
      return vencidos.length;
    },
    { tenantId },
  );
}

/**
 * Los pedidos PROPIOS que el rescate tiene que relanzar: RECIBIDO hace más de 10 s, o EN_CURSO con la
 * toma vencida, y con 30 s o más de plazo (la misma condición del paso 1). Nunca EN_BANDEJA ni de otra
 * persona. Sólo lee: relanzar es `procesarPedido(id, vista)` con la vista de esa misma persona.
 */
export async function pedidosParaRescatar(p: { tenantId: string; userId: string; ahora: Date }): Promise<string[]> {
  const { tenantId, userId, ahora } = p;
  const filas = await tenantTransaction(
    (tx) =>
      tx.agentePedido.findMany({
        where: {
          tenantId,
          userId,
          venceEl: { gte: new Date(ahora.getTime() + MINIMO_PARA_TOMAR_MS) },
          OR: [
            { estado: "RECIBIDO", pedidoEl: { lt: new Date(ahora.getTime() - COLGADO_RECIBIDO_MS) } },
            { estado: "EN_CURSO", tomadoHasta: { lt: ahora } },
          ],
        },
        select: { id: true },
        orderBy: { pedidoEl: "asc" },
        take: 20,
      }),
    { tenantId },
  );
  return filas.map((f) => f.id);
}

/** El buzón de una persona: sus pedidos, con el estado que se muestra calculado con el reloj. */
export async function listarPedidos(p: { tenantId: string; userId: string; puestos: readonly string[]; ahora: Date; limite?: number }): Promise<PedidoDelBuzon[]> {
  if (p.puestos.length === 0) return [];
  const filas = await tenantTransaction(
    (tx) =>
      tx.agentePedido.findMany({
        where: { tenantId: p.tenantId, userId: p.userId, puesto: { in: [...p.puestos] } },
        orderBy: [{ pedidoEl: "desc" }, { id: "desc" }],
        take: Math.min(Math.max(p.limite ?? 50, 1), 200),
        select: SELECT_PEDIDO,
      }),
    { tenantId: p.tenantId },
  );
  return filas.map((f) => {
    const ped = aPedido(f);
    return { ...ped, estado: estadoMostrado(ped, p.ahora) };
  });
}

/**
 * Métricas reales del servicio (03 §4.3), por período, SOBRE AgentePedido (la única fuente): entran
 * los abiertos y los vencidos sin marcar. `puestos` = los de los equipos que la persona ve.
 */
export async function metricasDelBuzon(p: { tenantId: string; puestos: readonly string[]; desde: Date; hasta: Date; ahora: Date }): Promise<MetricasDelBuzon> {
  const pedidos =
    p.puestos.length === 0
      ? []
      : await tenantTransaction(
          (tx) =>
            tx.agentePedido.findMany({
              where: { tenantId: p.tenantId, puesto: { in: [...p.puestos] }, pedidoEl: { gte: p.desde, lt: p.hasta } },
              select: { estado: true, pedidoEl: true, venceEl: true, respondidoEl: true, respondidoPor: true },
            }),
          { tenantId: p.tenantId },
        );
  return metricas(
    pedidos.map((x) => ({ ...x, estado: x.estado as EstadoPedido })),
    p.ahora,
  );
}
