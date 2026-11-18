// ============================================================================
// TALLER DE STANDS — pedidos de materiales (GSG-MIA-004 · T4). PEDIDO → RECIBIDO | ANULADO.
// Al RECIBIR se crea UN `ProyectoGasto` rubro «Materiales» en el mismo stand (impago: se paga desde Costos) y el
// pedido guarda `gastoId`. No usa StockPurchase (es fiscal, libro IVA); el stock real es T6.
// Validación y transiciones: puras. `recibirPedidoTx` / `anularPedidoTx` corren dentro de una transacción que ya fijó
// el negocio (tenantTransaction en la app, set_config en el test de Postgres): no importan Next ni la app.
// ============================================================================

import type { Prisma } from "@/generated/prisma/client";
import { redondear } from "@/lib/proyectos/core";
import { RUBRO_DESPIECE } from "./core";

export const ESTADOS_PEDIDO = ["PEDIDO", "RECIBIDO", "ANULADO"] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = { PEDIDO: "Pedido", RECIBIDO: "Recibido", ANULADO: "Anulado" };

export interface PedidoValido {
  proveedorNombre: string;
  descripcion: string;
  total: number;
  iva: number;
}

/** Proveedor y qué se pide, obligatorios; total neto > 0; IVA opcional (≥ 0). Montos al centavo. */
export function validarPedido(d: { proveedor: string; descripcion: string; total: number; iva: number | null }): { ok: true; pedido: PedidoValido } | { ok: false; error: string } {
  const proveedorNombre = d.proveedor.trim().slice(0, 120);
  const descripcion = d.descripcion.trim().slice(0, 200);
  if (!proveedorNombre) return { ok: false, error: "Escribí a qué proveedor se le pide." };
  if (!descripcion) return { ok: false, error: "Escribí qué materiales se piden." };
  if (!Number.isFinite(d.total)) return { ok: false, error: "El total no se entiende: escribilo como un número." };
  const total = redondear(d.total);
  if (!(total > 0)) return { ok: false, error: "Escribí el total neto del pedido, sin IVA." };
  const iva = d.iva == null ? 0 : redondear(d.iva);
  if (!Number.isFinite(iva) || iva < 0) return { ok: false, error: "El IVA no se entiende: escribilo como un número." };
  return { ok: true, pedido: { proveedorNombre, descripcion, total, iva } };
}

export type ResultadoRecibir =
  | { ok: true; gastoId: string; descripcion: string; total: number }
  | { ok: false; motivo: "NO_EXISTE" | "YA_RECIBIDO" | "ANULADO" };

/** Qué pasa si se intenta recibir un pedido en este estado. Sólo un PEDIDO sin gasto se recibe. */
export function chequearRecibir(p: { estado: string; gastoId: string | null } | null): "OK" | "NO_EXISTE" | "YA_RECIBIDO" | "ANULADO" {
  if (!p) return "NO_EXISTE";
  if (p.estado === "RECIBIDO" || p.gastoId) return "YA_RECIBIDO";
  if (p.estado !== "PEDIDO") return "ANULADO";
  return "OK";
}

export const MENSAJE_RECIBIR: Record<Exclude<ResultadoRecibir, { ok: true }>["motivo"], string> = {
  NO_EXISTE: "Ese pedido no existe.",
  YA_RECIBIDO: "Ese pedido ya estaba recibido: el gasto de materiales se cargó una sola vez.",
  ANULADO: "Ese pedido está anulado: no se puede recibir.",
};

/** El gasto que deja un pedido recibido: rubro «Materiales», neto = total, IVA del pedido, impago. */
export function gastoDelPedido(p: { proyectoId: string; supplierId: string | null; descripcion: string; total: number; iva: number }, cuando: Date, autor: string) {
  return {
    proyectoId: p.proyectoId,
    supplierId: p.supplierId,
    rubro: RUBRO_DESPIECE,
    descripcion: `Pedido de materiales: ${p.descripcion}`.slice(0, 200),
    neto: p.total,
    iva: p.iva,
    fecha: cuando,
    cargadoPor: autor,
  };
}

export type ResultadoAnular = "ANULADO" | "ANULADO_CON_GASTO" | "YA_ANULADO" | "NO_EXISTE";

export function chequearAnular(p: { estado: string } | null): ResultadoAnular {
  if (!p) return "NO_EXISTE";
  if (p.estado === "ANULADO") return "YA_ANULADO";
  return p.estado === "RECIBIDO" ? "ANULADO_CON_GASTO" : "ANULADO";
}

export const MENSAJE_ANULAR: Record<ResultadoAnular, string> = {
  ANULADO: "Pedido anulado.",
  // Anular el pedido NO borra el gasto: la plata (y su pago, si ya se pagó) se maneja desde Costos.
  ANULADO_CON_GASTO: "Pedido anulado. El gasto de materiales que generó sigue cargado: si corresponde, anulalo desde Costos.",
  YA_ANULADO: "Ese pedido ya estaba anulado.",
  NO_EXISTE: "Ese pedido no existe.",
};

type Tx = Prisma.TransactionClient;

interface FilaBloqueada {
  id: string;
  proyectoId: string;
  supplierId: string | null;
  descripcion: string;
  estado: string;
  total: number;
  iva: number;
  gastoId: string | null;
}

/** Bloquea la fila del pedido (FOR UPDATE): dos recepciones simultáneas quedan en fila y la segunda ve la primera. */
async function bloquear(tx: Tx, tenantId: string, pedidoId: string, proyectoId: string): Promise<FilaBloqueada | null> {
  const filas = await tx.$queryRaw<FilaBloqueada[]>`
    SELECT "id", "proyectoId", "supplierId", "descripcion", "estado", "total", "iva", "gastoId"
    FROM "TallerPedido" WHERE "id" = ${pedidoId} AND "tenantId" = ${tenantId} AND "proyectoId" = ${proyectoId} FOR UPDATE`;
  return filas[0] ?? null;
}

/**
 * Recibe el pedido: crea UN gasto «Materiales» y marca el pedido RECIBIDO con ese `gastoId`. Idempotente en tres
 * capas: el bloqueo de la fila, la transición condicional (estado PEDIDO y sin gasto) y el único de `gastoId`.
 */
export async function recibirPedidoTx(tx: Tx, d: { tenantId: string; pedidoId: string; proyectoId: string; autor: string; ahora?: Date }): Promise<ResultadoRecibir> {
  const { tenantId } = d;
  const p = await bloquear(tx, tenantId, d.pedidoId, d.proyectoId);
  const chequeo = chequearRecibir(p);
  if (chequeo !== "OK" || !p) return { ok: false, motivo: chequeo === "OK" ? "NO_EXISTE" : chequeo };
  const cuando = d.ahora ?? new Date();
  const gasto = await tx.proyectoGasto.create({ data: { tenantId, ...gastoDelPedido(p, cuando, d.autor) }, select: { id: true } });
  const n = await tx.tallerPedido.updateMany({ where: { id: p.id, tenantId, estado: "PEDIDO", gastoId: null }, data: { estado: "RECIBIDO", recibidoEl: cuando, gastoId: gasto.id } });
  // Con el bloqueo no debería pasar; si pasa, se revierte todo (gasto incluido) en vez de dejar un gasto huérfano.
  if (n.count !== 1) throw new Error("El pedido cambió mientras se recibía: no se cargó el gasto.");
  return { ok: true, gastoId: gasto.id, descripcion: p.descripcion, total: p.total };
}

/** Anula el pedido (PEDIDO o RECIBIDO). Si ya estaba recibido, el gasto queda: se anula desde Costos. */
export async function anularPedidoTx(tx: Tx, d: { tenantId: string; pedidoId: string; proyectoId: string; ahora?: Date }): Promise<ResultadoAnular> {
  const p = await bloquear(tx, d.tenantId, d.pedidoId, d.proyectoId);
  const r = chequearAnular(p);
  if (r === "ANULADO" || r === "ANULADO_CON_GASTO") {
    await tx.tallerPedido.updateMany({ where: { id: d.pedidoId, tenantId: d.tenantId, estado: p!.estado }, data: { estado: "ANULADO", anuladoEl: d.ahora ?? new Date() } });
  }
  return r;
}
