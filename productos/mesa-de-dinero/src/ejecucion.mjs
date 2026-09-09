/**
 * Ejecución — STUB DELIBERADO. La Mesa de Dinero NO opera.
 *
 * Regla GSG: la plata real es irreversible y la eleva el dueño. Este módulo existe
 * solo para que quede explícito, en código, que operar en vivo no es una feature
 * "que falta" sino una decisión que no se tomó. Cualquier llamada lanza error.
 */
export const MODO = 'paper';

export class OperacionNoAutorizada extends Error {
  constructor() {
    super('MODO PAPEL: la Mesa de Dinero no opera. Operar con plata real es irreversible y requiere el OK explícito del dueño (regla GSG). No hay API keys, no hay firma de órdenes, no hay endpoints privados.');
    this.name = 'OperacionNoAutorizada';
  }
}

/** @throws {OperacionNoAutorizada} siempre. */
export function ejecutar(/* orden */) {
  throw new OperacionNoAutorizada();
}
