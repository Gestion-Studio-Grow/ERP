// ============================================================================
// ETAPAS II, OBLIGACIONES Y CANCELADO (MIA-50 T09 · O04, O05, O07). Lecturas y escrituras sobre las tablas de M7b
// (`20261120140000_mia_m7b_etapas`). Gate 2: la migración puede no estar aplicada. Una tabla que falta dentro de una
// transacción la aborta entera, así que se pregunta ANTES de abrirla (`hayM7b`) y, sin M7b, todo sigue como antes:
// el pase de etapa no graba fecha real, el calendario no trae previstas ni obligaciones y la cancelación queda en
// `Proyecto` (motivo con prefijo «Cancelado: »), sin fila de detalle.
// ============================================================================

import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { esTablaInexistente } from "@/lib/rendiciones/pin-core";
import { fechasPorEtapa, type EtapaParam } from "./etapas-core";
import { tocaAvisar, textoDeAviso } from "./obligaciones-core";
import { avisar } from "./gestion.server";

type Db = Prisma.TransactionClient | typeof prisma;
type ConSql = Pick<Prisma.TransactionClient, "$queryRaw">;

let m7bVista = false;

/** Si M7b está aplicada. Sólo se recuerda el «sí»: una base sin migrar se vuelve a mirar en la próxima llamada. */
export async function hayM7b(db: ConSql = prisma): Promise<boolean> {
  if (m7bVista) return true;
  const [fila] = await db.$queryRaw<{ hay: boolean }[]>`SELECT to_regclass('"ProyectoEtapaFecha"') IS NOT NULL
    AND to_regclass('"ProyectoObligacion"') IS NOT NULL AND to_regclass('"ProyectoCancelacion"') IS NOT NULL AS hay`;
  m7bVista = !!fila?.hay;
  return m7bVista;
}

/** Sin la tabla, `null`: la pantalla avisa en vez de caerse. */
async function siHayM7b<T>(leer: () => Promise<T>): Promise<T | null> {
  try {
    return await leer();
  } catch (e) {
    if (esTablaInexistente(e)) return null;
    throw e;
  }
}

/** Las etapas del parámetro con su fecha prevista y real. `null` si M7b no está. */
export async function fechasDeEtapas(tenantId: string, proyectoId: string, lista: readonly EtapaParam[]) {
  const filas = await siHayM7b(() =>
    prisma.proyectoEtapaFecha.findMany({ where: { tenantId, proyectoId }, select: { etapaId: true, prevista: true, real: true } }),
  );
  return filas ? fechasPorEtapa(lista, filas) : null;
}

/** El detalle de la cancelación (motivo, criterio, pendientes). `null` si no hay o si M7b no está. */
export async function cancelacionDe(tenantId: string, proyectoId: string) {
  const c = await siHayM7b(() =>
    prisma.proyectoCancelacion.findFirst({
      where: { tenantId, proyectoId, reabiertoEl: null },
      select: { motivo: true, criterio: true, cuotasAnuladas: true, pendientes: true, autorNombre: true, canceladoEl: true },
    }),
  );
  if (!c) return null;
  return { ...c, pendientes: Array.isArray(c.pendientes) ? c.pendientes.map(String) : [] };
}

/**
 * Graba la fecha real de la etapa en la que se entra, dentro de la transacción del pase. Toma la hora del registro del
 * historial recién escrito, para que las dos coincidan. El que llama ya sabe que M7b está (`hayM7b`, antes de abrir).
 */
export async function grabarFechaReal(tx: Prisma.TransactionClient, d: { tenantId: string; proyectoId: string; etapaId: string; autor: string }) {
  const cambio = await tx.proyectoCambio.findFirst({
    where: { tenantId: d.tenantId, proyectoId: d.proyectoId, entidad: "Proyecto", campo: "Etapa" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const real = cambio?.createdAt ?? new Date();
  await tx.proyectoEtapaFecha.upsert({
    where: { tenantId_proyectoId_etapaId: { tenantId: d.tenantId, proyectoId: d.proyectoId, etapaId: d.etapaId } },
    create: { tenantId: d.tenantId, proyectoId: d.proyectoId, etapaId: d.etapaId, real, realPor: d.autor },
    update: { real, realPor: d.autor },
  });
}

/** Obligaciones abiertas con vencimiento en el rango. `[]` si M7b no está. */
export async function obligacionesEntre(tenantId: string, desde: Date, hasta: Date, proyectos: Prisma.ProyectoWhereInput, sueltas: boolean) {
  const filas = await siHayM7b(() =>
    prisma.proyectoObligacion.findMany({
      where: { tenantId, venceEl: { gte: desde, lte: hasta }, hechaEl: null, OR: [...(sueltas ? [{ proyectoId: null }] : []), { proyecto: proyectos }] },
      select: { id: true, tipo: true, titulo: true, venceEl: true, responsableId: true, responsableNombre: true, proyectoId: true, proyecto: { select: { nombre: true } } },
      orderBy: { venceEl: "asc" },
      take: 500,
    }),
  );
  return filas ?? [];
}

/** Fechas previstas de etapa en el rango, de los proyectos visibles y vivos. `[]` si M7b no está. */
export async function previstasEntre(tenantId: string, desde: Date, hasta: Date, proyectos: Prisma.ProyectoWhereInput) {
  const filas = await siHayM7b(() =>
    prisma.proyectoEtapaFecha.findMany({
      where: { tenantId, prevista: { gte: desde, lte: hasta }, real: null, proyecto: { ...proyectos, perdidoEl: null } },
      select: { id: true, etapaId: true, prevista: true, proyectoId: true, proyecto: { select: { nombre: true } } },
      take: 500,
    }),
  );
  return filas ?? [];
}

/** Las obligaciones abiertas del negocio (para la lista bajo el calendario). `[]` si M7b no está. */
export async function obligacionesAbiertas(tenantId: string, proyectos: Prisma.ProyectoWhereInput) {
  const filas = await siHayM7b(() =>
    prisma.proyectoObligacion.findMany({
      where: { tenantId, hechaEl: null, OR: [{ proyectoId: null }, { proyecto: proyectos }] },
      select: { id: true, tipo: true, titulo: true, venceEl: true, diasAviso: true, responsableNombre: true, avisadaEl: true, proyecto: { select: { nombre: true } } },
      orderBy: { venceEl: "asc" },
      take: 100,
    }),
  );
  return filas;
}

/**
 * El aviso de las obligaciones: corre en el barrido diario, en la transacción del negocio. Cada obligación avisa una sola
 * vez: se marca `avisadaEl` con una condición (`avisadaEl IS NULL`) y sólo quien la marcó manda el aviso, así dos barridos
 * a la vez no avisan dos veces. Devuelve cuántas avisó.
 */
export async function avisarObligaciones(tx: Prisma.TransactionClient, tenantId: string, hoy: Date, origen: string | null): Promise<number> {
  const candidatas = await tx.proyectoObligacion.findMany({
    where: { tenantId, avisadaEl: null, hechaEl: null },
    select: { id: true, tipo: true, titulo: true, venceEl: true, diasAviso: true, avisadaEl: true, hechaEl: true, responsableId: true, proyectoId: true },
    take: 500,
  });
  let avisadas = 0;
  for (const o of candidatas) {
    if (!tocaAvisar(o, hoy)) continue;
    const { count } = await tx.proyectoObligacion.updateMany({ where: { id: o.id, tenantId, avisadaEl: null, hechaEl: null }, data: { avisadaEl: hoy } });
    if (count !== 1) continue;
    avisadas++;
    const persona = o.responsableId ? await tx.proyectoPersona.findFirst({ where: { id: o.responsableId, tenantId }, select: { userId: true } }) : null;
    if (!persona?.userId) continue;
    await avisar(tx, { tenantId, destinatarios: [persona.userId], tipo: "deadline", texto: textoDeAviso(o, hoy), enlace: "/admin/proyectos/calendario", origen });
  }
  return avisadas;
}
