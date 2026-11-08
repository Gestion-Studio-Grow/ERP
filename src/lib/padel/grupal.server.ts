import "server-only";

// ============================================================================
// PADEL-CLASES · E7 — Grupal con integrantes: las piezas de base que corren ADENTRO de una
// transacción (alta de integrantes, su pago al cancelar, pasarlos a otra clase). NO es "use server":
// nada de esto se llama desde el navegador. Las acciones del profe están en acciones-grupal.ts.
// Toda lectura y escritura va con `tenantId` en el where (además del RLS de la tabla).
// ============================================================================

import { prisma } from "@/lib/prisma";
import { ErrorNegocio, alumnoPorTelefono, origen, tokenParaMandar, type Tx } from "./acciones-compartido";
import { linkWhatsApp, pagoDeIntegranteAlCerrar, textoParaIntegrante, type IntegranteEntrada } from "./core";

export type IntegranteCreado = { id: string; nombre: string; telefono: string | null; alumnoId: string | null; token: string | null };

/** Choque del índice único (claseId, alumnoId): el mismo alumno dos veces en la clase. */
export const esIntegranteRepetido = (e: unknown): boolean => (e as { code?: string } | null)?.code === "P2002";

/**
 * Da de alta los integrantes de una clase (ya validados con integrantesValidos). Un alumno existente
 * va vinculado; nombre + celular → `alumnoPorTelefono` (lo crea si no existe) y queda vinculado; sólo
 * nombre → sin alumno (no tiene link ni deuda en su ficha: se cobra en la clase). El titular no
 * puede ser integrante, ni el mismo alumno dos veces.
 */
export async function crearIntegrantesEnTx(
  tx: Tx,
  tenantId: string,
  p: { claseId: string; titularId: string; entradas: readonly IntegranteEntrada[]; monto: number },
): Promise<IntegranteCreado[]> {
  const ya = await tx.padelIntegrante.findMany({ where: { tenantId, claseId: p.claseId }, select: { alumnoId: true } });
  if (ya.length + p.entradas.length > 3) throw new ErrorNegocio("La clase ya tiene 4 personas.");
  const vistos = new Set<string>([p.titularId, ...ya.map((x) => x.alumnoId).filter((x): x is string => Boolean(x))]);
  const creados: IntegranteCreado[] = [];
  for (const e of p.entradas) {
    let alumno: { id: string; token: string; nombre: string; telefono: string | null } | null = null;
    let nombre: string;
    if ("alumnoId" in e) {
      const a = await tx.padelAlumno.findFirst({ where: { tenantId, id: e.alumnoId }, select: { id: true, token: true, client: { select: { name: true, phone: true } } } });
      if (!a) throw new ErrorNegocio("No encontramos a uno de los integrantes.");
      alumno = { id: a.id, token: a.token, nombre: a.client.name, telefono: a.client.phone };
      nombre = a.client.name;
    } else if (e.telefono) {
      const a = await alumnoPorTelefono(tx, tenantId, e.telefono, e.nombre);
      alumno = { id: a.id, token: a.token, nombre: a.nombre, telefono: e.telefono };
      nombre = a.nombre;
    } else {
      nombre = e.nombre;
    }
    if (alumno) {
      if (alumno.id === p.titularId) throw new ErrorNegocio(`${nombre.split(" ")[0]} ya es el titular de la clase.`);
      if (vistos.has(alumno.id)) throw new ErrorNegocio(`${nombre.split(" ")[0]} ya está en la clase.`);
      vistos.add(alumno.id);
    }
    const fila = await tx.padelIntegrante.create({
      data: { tenantId, claseId: p.claseId, alumnoId: alumno?.id ?? null, nombre, telefono: alumno?.telefono ?? null, monto: p.monto },
      select: { id: true, nombre: true, telefono: true, alumnoId: true },
    });
    creados.push({ ...fila, token: alumno?.token ?? null });
  }
  return creados;
}

export type IntegranteAFavor = { id: string; alumnoId: string | null; nombre: string; telefono: string | null; monto: number };

/**
 * La clase se canceló, se rechazó o «no vino → no se cobra»: el pago de cada integrante sigue la
 * MISMA regla que el del titular (pagoDeIntegranteAlCerrar). Pagado → ACREDITADO (a favor suyo).
 * Cada escritura va condicionada al pago leído: si cambió en el medio, se aborta TODO (la
 * transacción de la clase vuelve atrás) y no se pisa nada.
 */
export async function cerrarIntegrantesEnTx(
  tx: Tx,
  tenantId: string,
  claseIds: readonly string[],
  como: Parameters<typeof pagoDeIntegranteAlCerrar>[1],
): Promise<IntegranteAFavor[]> {
  if (!claseIds.length) return [];
  const filas = await tx.padelIntegrante.findMany({
    where: { tenantId, claseId: { in: [...claseIds] } },
    select: { id: true, alumnoId: true, nombre: true, telefono: true, monto: true, pagoEstado: true, pagoMedio: true },
  });
  const aFavor: IntegranteAFavor[] = [];
  for (const i of filas) {
    const pago = pagoDeIntegranteAlCerrar(i, como);
    if (!pago) continue;
    const n = await tx.padelIntegrante.updateMany({ where: { tenantId, id: i.id, pagoEstado: i.pagoEstado }, data: pago });
    if (n.count === 0) throw new ErrorNegocio("El pago de un integrante cambió recién. Actualizá la pantalla.");
    if (pago.pagoEstado === "ACREDITADO") aFavor.push({ id: i.id, alumnoId: i.alumnoId, nombre: i.nombre, telefono: i.telefono, monto: Number(i.monto) });
  }
  return aFavor;
}

/** Los integrantes de una clase pasan a otra (el alumno cambió el horario): conservan su pago. */
export async function moverIntegrantesEnTx(tx: Tx, tenantId: string, deClaseId: string, aClaseId: string): Promise<number> {
  const n = await tx.padelIntegrante.updateMany({ where: { tenantId, claseId: deClaseId }, data: { claseId: aClaseId } });
  return n.count;
}

/** Cuántos integrantes tiene la clase (para el precio del titular). */
export async function contarIntegrantesEnTx(tx: Tx, tenantId: string, claseId: string): Promise<number> {
  return tx.padelIntegrante.count({ where: { tenantId, claseId } });
}

/**
 * El WhatsApp para un integrante con SU monto. Si está vinculado a un alumno, va su link (el de
 * `tokenParaMandar`: si el profe todavía no lo reconoció, uno recién hecho, O-1) para que mande el
 * comprobante de su parte. Sin celular: null (el profe le avisa por otro lado).
 */
export async function waParaIntegrante(
  tenantId: string,
  p: { integrante: { nombre: string; telefono: string | null; alumnoId: string | null; monto: number }; titular: string; empiezaEn: Date; alias?: string | null; club?: string | null },
): Promise<string | null> {
  if (!p.integrante.telefono) return null;
  let link: string | null = null;
  if (p.integrante.alumnoId) {
    const a = await prisma.padelAlumno.findFirst({ where: { tenantId, id: p.integrante.alumnoId }, select: { id: true, token: true } });
    if (a) link = `${await origen()}/alumno/${(await tokenParaMandar(tenantId, a)).token}`;
  }
  return linkWhatsApp(p.integrante.telefono, textoParaIntegrante({ nombre: p.integrante.nombre, titular: p.titular, empiezaEn: p.empiezaEn, monto: p.integrante.monto, alias: p.alias, club: p.club, link }));
}
