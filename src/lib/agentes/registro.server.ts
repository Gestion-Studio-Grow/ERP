// ============================================================================
// EQUIPO DE AGENTES · registro (03 §9). Una fila por acción; nunca se edita ni se borra.
// ============================================================================
// `registrar` es la ÚNICA puerta de escritura del registro y recibe la transacción (`tx`): se llama
// desde el motor, el buzón y la bandeja, nunca desde una herramienta. `detalle` guarda nombres de
// herramienta, identificadores y resultado; NO el texto de los datos leídos ni datos bancarios. La
// base tampoco deja editar ni borrar (REVOKE UPDATE, DELETE a app_rls, migración agentes_base).

import "server-only";
import { tenantTransaction } from "@/lib/rls";
import type { Prisma } from "@/generated/prisma/client";
import type { TipoAccion, Tx } from "./tipos";

export interface FilaDeRegistro {
  tenantId: string;
  puesto: string;
  tipo: TipoAccion;
  /** `agente:<puesto>`, el userId de una persona del negocio u `operator:<nombre>` (GSG). */
  actor: string;
  ahora: Date;
  herramienta?: string | null;
  detalle?: Record<string, unknown> | null;
  nivel?: number | null;
  pedidoId?: string | null;
  propuestaId?: string | null;
  proveedor?: string | null;
  modelo?: string | null;
  tokensEntrada?: number | null;
  tokensSalida?: number | null;
  microUsd?: number | null;
  ms?: number | null;
}

/** Claves de `detalle` que nunca se guardan (datos leídos o bancarios). */
const CLAVES_PROHIBIDAS = /^(texto|datos|filas|respuesta|cbu|cvu|alias|mail|email|telefono|clave|apiKey|api_key)$/i;

function detalleSeguro(d: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined {
  if (!d) return undefined;
  const limpio: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) if (!CLAVES_PROHIBIDAS.test(k) && v !== undefined) limpio[k] = v;
  return limpio as Prisma.InputJsonValue;
}

export async function registrar(tx: Tx, f: FilaDeRegistro): Promise<void> {
  await tx.agenteAccion.create({
    data: {
      tenantId: f.tenantId,
      puesto: f.puesto,
      tipo: f.tipo,
      actor: f.actor,
      herramienta: f.herramienta ?? null,
      detalle: detalleSeguro(f.detalle),
      nivel: f.nivel ?? null,
      pedidoId: f.pedidoId ?? null,
      propuestaId: f.propuestaId ?? null,
      proveedor: f.proveedor ?? null,
      modelo: f.modelo ?? null,
      tokensEntrada: f.tokensEntrada ?? null,
      tokensSalida: f.tokensSalida ?? null,
      microUsd: f.microUsd ?? null,
      ms: f.ms ?? null,
      createdAt: f.ahora,
    },
  });
}

export interface AccionDelRegistro {
  id: string;
  puesto: string;
  tipo: string;
  herramienta: string | null;
  actor: string;
  nivel: number | null;
  pedidoId: string | null;
  ms: number | null;
  detalle: unknown;
  createdAt: Date;
}

/**
 * La pestaña Registro: las últimas filas de los puestos que la persona ve (03 §2: Administración no
 * ve el registro de Dirección). Lee en una transacción corta parada en el negocio.
 */
export async function leerRegistro(p: { tenantId: string; puestos: readonly string[]; desde?: Date; limite?: number }): Promise<AccionDelRegistro[]> {
  if (p.puestos.length === 0) return [];
  return tenantTransaction(
    (tx) =>
      tx.agenteAccion.findMany({
        where: { tenantId: p.tenantId, puesto: { in: [...p.puestos] }, ...(p.desde ? { createdAt: { gte: p.desde } } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: Math.min(Math.max(p.limite ?? 100, 1), 500),
        select: { id: true, puesto: true, tipo: true, herramienta: true, actor: true, nivel: true, pedidoId: true, ms: true, detalle: true, createdAt: true },
      }),
    { tenantId: p.tenantId },
  );
}
