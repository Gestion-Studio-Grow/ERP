// ============================================================================
// EQUIPO DE AGENTES · cupos de los topes (03 §6, punto 4). Atómicos, sin SQL crudo.
// ============================================================================
// Nunca «contar y después escribir»: la fila del cupo se crea con `skipDuplicates` y el cupo se toma
// con UN `updateMany` condicional (`UPDATE … SET n = n + 1 WHERE … AND n < max`). `count = 0` = tope
// alcanzado. Va en la MISMA transacción que la escritura que consume el cupo: si esa escritura no
// ocurre, el cupo vuelve solo con el ROLLBACK.

import "server-only";
import type { Tx } from "./tipos";

export interface Cupo {
  tenantId: string;
  puesto: string;
  tope: string;
  /** "*" si el cupo es del puesto; el userId si es por persona. */
  sujeto: string;
  /** Día `AAAA-MM-DD` (Argentina) o "abiertos". */
  periodo: string;
  max: number;
}

/** Error controlado: el tope se alcanzó y la transacción entera se tiene que deshacer. */
export class TopeAlcanzado extends Error {
  constructor(readonly tope: string) {
    super(`Se alcanzó el tope «${tope}».`);
    this.name = "TopeAlcanzado";
  }
}

const clave = (c: Cupo) => ({ tenantId: c.tenantId, puesto: c.puesto, tope: c.tope, sujeto: c.sujeto, periodo: c.periodo });

/** Toma un cupo. `false` = tope alcanzado (no tomó nada). */
export async function tomarCupo(tx: Tx, c: Cupo): Promise<boolean> {
  if (c.max <= 0) return false;
  await tx.agenteContador.createMany({ data: [{ ...clave(c), n: 0 }], skipDuplicates: true });
  const r = await tx.agenteContador.updateMany({ where: { ...clave(c), n: { lt: c.max } }, data: { n: { increment: 1 } } });
  return r.count === 1;
}

/** Como `tomarCupo`, pero tira `TopeAlcanzado` para deshacer la transacción entera. */
export async function exigirCupo(tx: Tx, c: Cupo): Promise<void> {
  if (!(await tomarCupo(tx, c))) throw new TopeAlcanzado(c.tope);
}

/**
 * Devuelve un cupo de «abiertos a la vez». Sólo se llama DESPUÉS de un cierre condicional que afectó
 * una fila (`updateMany … where estado = 'ABIERTO'` con count = 1): así no se devuelve dos veces.
 */
export async function devolverCupo(tx: Tx, c: Omit<Cupo, "max">): Promise<void> {
  await tx.agenteContador.updateMany({ where: { ...clave({ ...c, max: 0 }), n: { gt: 0 } }, data: { n: { decrement: 1 } } });
}
