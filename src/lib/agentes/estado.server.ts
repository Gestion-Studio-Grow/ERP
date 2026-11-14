// ============================================================================
// EQUIPO DE AGENTES · interruptores, pausa, vigencia sin caché y tolerancia sin tablas (03 §3, §12).
// ============================================================================
// `vigencia(tx, …)` se llama PRIMERO en toda transacción del equipo que escribe: lee con `tx` y sin
// caché la última fila válida del interruptor y la fila del puesto (03 §12.1). La lectura en la
// puerta de las pantallas (`interruptoresDelNegocio`) está guardada por pedido: sirve para mostrar,
// no para seguir escribiendo.
// Este archivo NO escribe auditoría ni usa SQL crudo (lo exige el trinquete de los interruptores,
// src/cambios/interruptores-escritura.test.ts): las decisiones humanas dejan su fila de auditoría en
// las acciones del rubro (acciones-equipo.ts, brief 1B).

import "server-only";
import { tenantTransaction } from "@/lib/rls";
import { EQUIPO_AGENTES, EQUIPO_AGENTES_IA, type InterruptorId } from "@/cambios/interruptores";
import { estadoDesdeFilas, filtroDeFilasValidas } from "@/cambios/interruptores-core";
import { registrar } from "./registro.server";
import { VARIABLE_CLAVE_IA, type MotivoSinVigencia, type Tx, type Vigencia } from "./tipos";

async function interruptorEnTx(tx: Tx, tenantId: string, id: InterruptorId): Promise<boolean> {
  const filas = await tx.auditLog.findMany({
    where: { ...filtroDeFilasValidas(tenantId), entityId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: { id: true, entity: true, entityId: true, action: true, actor: true, channel: true, createdAt: true },
  });
  return estadoDesdeFilas(filas)[id]?.encendido === true;
}

/** ¿Está el equipo prendido en este negocio? Leído con `tx`, sin caché. */
export function equipoPrendidoEnTx(tx: Tx, tenantId: string): Promise<boolean> {
  return interruptorEnTx(tx, tenantId, EQUIPO_AGENTES);
}

/** ¿Está prendida la IA del equipo en este negocio? Leído con `tx`, sin caché. */
export function iaPrendidaEnTx(tx: Tx, tenantId: string): Promise<boolean> {
  return interruptorEnTx(tx, tenantId, EQUIPO_AGENTES_IA);
}

/**
 * Vigencia (03 §12.1): `apagado` si el interruptor del negocio no está prendido; `pausado` si el
 * puesto está en pausa. Si no, los niveles guardados del puesto (los recorta `nivelEfectivo`).
 */
export async function vigencia(tx: Tx, p: { tenantId: string; puesto: string }): Promise<Vigencia> {
  if (!(await equipoPrendidoEnTx(tx, p.tenantId))) return { vigente: false, motivo: "apagado", pausadoPor: null };
  const fila = await tx.agentePuesto.findFirst({
    where: { tenantId: p.tenantId, puesto: p.puesto },
    select: { estado: true, pausadoPor: true, niveles: true },
  });
  if (fila?.estado === "PAUSADO") return { vigente: false, motivo: "pausado", pausadoPor: fila.pausadoPor };
  const niveles = fila?.niveles && typeof fila.niveles === "object" && !Array.isArray(fila.niveles) ? (fila.niveles as Record<string, number>) : {};
  return { vigente: true, niveles };
}

/** La vigencia cayó en medio de una transacción que escribe: se lanza para deshacerla entera. */
export class VigenciaCaida extends Error {
  constructor(readonly vigencia: Extract<Vigencia, { vigente: false }>) {
    super(`La vigencia cayó durante la transacción (${vigencia.motivo}).`);
    this.name = "VigenciaCaida";
  }
}

/**
 * Vigencia para una transacción que ESCRIBE (alta, toma, cierre, reserva de gasto): primero traba la
 * fila del puesto y recién después lee. `pausarPuestos` actualiza esa misma fila, así que una pausa
 * o se confirmó antes (y acá se ve) o espera a que esta transacción confirme: no hay ventana
 * (hallazgo F2 de la 2ª certificación 1A). La traba es un UPDATE de `updatedAt` sobre la fila del puesto;
 * si la fila no existe se crea igual que en `pausarPuestos`. Sin SQL crudo.
 */
export async function vigenciaParaEscribir(tx: Tx, p: { tenantId: string; puesto: string; ahora: Date }): Promise<Vigencia> {
  await tx.agentePuesto.createMany({ data: [{ tenantId: p.tenantId, puesto: p.puesto, updatedAt: p.ahora }], skipDuplicates: true });
  // Traba siempre (también un puesto PAUSADO, para que un reanudar no abra la ventana), con el reloj lógico.
  await tx.agentePuesto.updateMany({ where: { tenantId: p.tenantId, puesto: p.puesto }, data: { updatedAt: p.ahora } });
  return vigencia(tx, p);
}

/**
 * Segunda lectura, al FINAL de la transacción que escribe (después de sus escrituras). La pausa ya
 * no puede colarse (la traba de `vigenciaParaEscribir`); esto cubre el APAGADO del equipo, que es una
 * fila del registro y no traba el puesto: un apagado confirmado durante la transacción la deshace.
 * Queda el hueco de lo que tarda el COMMIT para el apagado (riesgo aceptado, anotado en el PR).
 */
export async function exigirVigenciaAlFinal(tx: Tx, p: { tenantId: string; puesto: string }): Promise<void> {
  const v = await vigencia(tx, p);
  if (!v.vigente) throw new VigenciaCaida(v);
}

/** ¿Está cargada la clave propia del equipo? Mira SÓLO que exista: el valor nunca sale de acá. */
export function hayClaveDeIa(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return (env[VARIABLE_CLAVE_IA] ?? "").trim().length > 0;
}

/**
 * Por dónde va un pedido de texto libre, leído en la transacción del alta (03 §4.3): «modelo» sólo
 * con la clave cargada Y `equipo-agentes-ia` prendido en el negocio; si no, «bandeja» (lo contesta
 * una persona de GSG, 03 §4.4). La falta de saldo NO manda a la bandeja: eso lo decide el motor al
 * reservar (sigue cerrando «necesita una persona»). Brief 1C completa esta elección con el saldo.
 */
export async function rutaDelTextoLibre(tx: Tx, tenantId: string, env: Readonly<Record<string, string | undefined>> = process.env): Promise<"modelo" | "bandeja"> {
  if (!hayClaveDeIa(env)) return "bandeja";
  return (await iaPrendidaEnTx(tx, tenantId)) ? "modelo" : "bandeja";
}

export const TEXTO_SIN_VIGENCIA: Readonly<Record<MotivoSinVigencia, string>> = {
  apagado: "El equipo está apagado en este negocio.",
  pausado: "El puesto está en pausa.",
};

export function textoSinVigencia(v: Extract<Vigencia, { vigente: false }>): string {
  return v.motivo === "pausado" && v.pausadoPor ? `${TEXTO_SIN_VIGENCIA.pausado} Lo pausó ${v.pausadoPor}.` : TEXTO_SIN_VIGENCIA[v.motivo];
}

// ── Tolerancia a la ausencia de la migración (03 §3) ─────────────────────────────────────────────

/** P2021 (tabla inexistente) / P2022 (columna inexistente): el código llegó antes que su migración. */
export function esMigracionPendiente(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
}

/**
 * ¿Están las 11 tablas del equipo? `SELECT … LIMIT 1` del propio negocio en cada una. Sin tablas:
 * el panel muestra el cartel, las acciones devuelven `{ ok: false }` y el barrido saltea al negocio.
 */
export async function tablasDeAgentes(tenantId: string): Promise<boolean> {
  try {
    await tenantTransaction(
      async (tx) => {
        const w = { where: { tenantId }, select: { tenantId: true } } as const;
        await tx.agentePuesto.findFirst(w);
        await tx.agentePedido.findFirst({ where: { tenantId }, select: { id: true, respondidoPor: true } });
        await tx.agenteCompromiso.findFirst(w);
        await tx.agenteNota.findFirst(w);
        await tx.agentePropuesta.findFirst(w);
        await tx.agenteParte.findFirst(w);
        await tx.agenteContador.findFirst(w);
        await tx.agenteAccion.findFirst(w);
        await tx.agenteGasto.findFirst(w);
        await tx.agenteReserva.findFirst(w);
        await tx.agenteAjuste.findFirst(w);
      },
      { tenantId },
    );
    return true;
  } catch (e) {
    if (esMigracionPendiente(e)) return false;
    throw e;
  }
}

/** Para la puerta de una pantalla o del barrido (fuera de transacción). Si la lectura falla, apagado. */
export async function equipoPrendidoEn(tenantId: string): Promise<boolean> {
  try {
    return await tenantTransaction((tx) => equipoPrendidoEnTx(tx, tenantId), { tenantId });
  } catch {
    return false;
  }
}

// ── Pausa por puesto (03 §12). La acción del rubro pone exigirEditar y la auditoría ──────────────

/**
 * Pausa los puestos, en una transacción. Pausar nunca necesita vigencia: sólo frena (con el equipo
 * apagado también tiene que poder frenarse). Deja una fila PAUSA por puesto que cambió.
 */
export async function pausarPuestos(p: { tenantId: string; puestos: readonly string[]; quien: string; actor: string; ahora: Date }): Promise<{ pausados: number }> {
  return tenantTransaction(
    async (tx) => {
      // Siempre en el mismo orden: dos pausas de varios puestos no se traban entre sí.
      const puestos = [...new Set(p.puestos)].sort();
      await tx.agentePuesto.createMany({
        data: puestos.map((puesto) => ({ tenantId: p.tenantId, puesto, updatedAt: p.ahora })),
        skipDuplicates: true,
      });
      let pausados = 0;
      for (const puesto of puestos) {
        const r = await tx.agentePuesto.updateMany({
          where: { tenantId: p.tenantId, puesto, estado: "ACTIVO" },
          data: { estado: "PAUSADO", pausadoPor: p.quien, pausadoEl: p.ahora, updatedAt: p.ahora },
        });
        if (r.count === 1) {
          pausados++;
          await registrar(tx, { tenantId: p.tenantId, puesto, tipo: "PAUSA", actor: p.actor, ahora: p.ahora, detalle: { accion: "pausar" } });
        }
      }
      return { pausados };
    },
    { tenantId: p.tenantId },
  );
}

/** Reanuda un puesto. Con el equipo apagado no se reanuda nada (eso sí es seguir trabajando). */
export async function reanudarPuesto(p: { tenantId: string; puesto: string; actor: string; ahora: Date }): Promise<{ ok: true } | { ok: false; motivo: "apagado" }> {
  return tenantTransaction(
    async (tx) => {
      if (!(await equipoPrendidoEnTx(tx, p.tenantId))) return { ok: false as const, motivo: "apagado" as const };
      const r = await tx.agentePuesto.updateMany({
        where: { tenantId: p.tenantId, puesto: p.puesto, estado: "PAUSADO" },
        data: { estado: "ACTIVO", pausadoPor: null, pausadoEl: null, updatedAt: p.ahora },
      });
      if (r.count === 1) await registrar(tx, { tenantId: p.tenantId, puesto: p.puesto, tipo: "PAUSA", actor: p.actor, ahora: p.ahora, detalle: { accion: "reanudar" } });
      return { ok: true as const };
    },
    { tenantId: p.tenantId },
  );
}

/** Estado de cada puesto para el panel (Ajustes): sin fila = activo. */
export async function estadoDeLosPuestos(tenantId: string, puestos: readonly string[]): Promise<Map<string, { estado: "ACTIVO" | "PAUSADO"; pausadoPor: string | null; pausadoEl: Date | null }>> {
  const filas = await tenantTransaction(
    (tx) => tx.agentePuesto.findMany({ where: { tenantId, puesto: { in: [...puestos] } }, select: { puesto: true, estado: true, pausadoPor: true, pausadoEl: true } }),
    { tenantId },
  );
  const m = new Map<string, { estado: "ACTIVO" | "PAUSADO"; pausadoPor: string | null; pausadoEl: Date | null }>();
  for (const p of puestos) m.set(p, { estado: "ACTIVO", pausadoPor: null, pausadoEl: null });
  for (const f of filas) m.set(f.puesto, { estado: f.estado === "PAUSADO" ? "PAUSADO" : "ACTIVO", pausadoPor: f.pausadoPor, pausadoEl: f.pausadoEl });
  return m;
}
