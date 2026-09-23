// ============================================================================
// IDENTIDAD — una persona es un teléfono. PURO.
// ============================================================================
//
// La clave de la clienta es su teléfono normalizado (`normalizarTelefono`, clientes/telefono.ts):
// "11 4000-7919", "1140007919" y "+54 9 11 4000-7919" son la misma persona. Los cuatro caminos
// de alta ya buscan así, pero las fichas duplicadas de ANTES siguen ahí, y parten el historial
// y los números (una clienta frecuente aparece como dos "nuevas"). Acá se agrupan para
// unificarlas, y se atan a la ficha los pedidos que llegaron sin ficha pero con su número.
//
// El mismo algoritmo sirve para N locales: se corre sobre las fichas de todos y se agrupa por
// la misma clave.

import { normalizarTelefono } from "@/lib/clientes/telefono";
import { elegirFicha } from "@/lib/clientes/ficha-por-telefono";

export type FichaIdentidad = {
  id: string;
  name: string;
  phone: string | null;
  createdAt?: Date | string | null;
  turnos?: number;
};

export type GrupoDuplicadas<T extends FichaIdentidad> = {
  clave: string;
  fichas: T[];
  /** La que se propone conservar: la MISMA que hoy usa el alta de turno (`elegirFicha`). */
  sugerida: T;
};

/**
 * Los grupos de fichas que comparten número (dos o más). Un teléfono sin dígitos no agrupa: dos
 * fichas "sin teléfono" no son la misma persona. Ordenados por clave, para que la pantalla y el
 * número del Inicio recorran lo mismo.
 */
export function gruposDuplicados<T extends FichaIdentidad>(fichas: readonly T[]): GrupoDuplicadas<T>[] {
  const porClave = new Map<string, T[]>();
  for (const f of fichas) {
    const clave = normalizarTelefono(f.phone);
    if (!clave) continue;
    porClave.set(clave, [...(porClave.get(clave) ?? []), f]);
  }
  const grupos: GrupoDuplicadas<T>[] = [];
  for (const [clave, grupo] of porClave) {
    if (grupo.length < 2) continue;
    const elegida = elegirFicha(grupo.map((f) => ({ id: f.id, turnos: f.turnos ?? 0, createdAt: f.createdAt ?? null })));
    const sugerida = grupo.find((f) => f.id === elegida?.id) ?? grupo[0];
    grupos.push({ clave, fichas: grupo, sugerida });
  }
  return grupos.sort((a, b) => (a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0));
}

/** ¿Estas fichas son todas el mismo número? (la condición para unificarlas). */
export function mismaClave(fichas: readonly { phone: string | null }[]): boolean {
  const claves = new Set(fichas.map((f) => normalizarTelefono(f.phone)));
  return claves.size === 1 && !claves.has("");
}

/**
 * Los pedidos de una ficha: los atados a ella (`clientId`) más los que llegaron SIN ficha con
 * su mismo número (la tienda online vincula sólo si la ficha ya existía cuando entró el pedido).
 * Sin repetidos.
 */
export function pedidosDeLaFicha<P extends { id: string; clientId: string | null; customerPhone: string }>(
  fichaId: string,
  telefono: string,
  pedidos: readonly P[],
): P[] {
  const clave = normalizarTelefono(telefono);
  const vistos = new Set<string>();
  const out: P[] = [];
  for (const p of pedidos) {
    const suyo = p.clientId === fichaId || (p.clientId === null && clave !== "" && normalizarTelefono(p.customerPhone) === clave);
    if (!suyo || vistos.has(p.id)) continue;
    vistos.add(p.id);
    out.push(p);
  }
  return out;
}

/**
 * Los pedidos sin ficha agrupados por número, sin los números que YA tienen ficha (esos se
 * ven en su ficha por `pedidosDeLaFicha`). Sólo celulares con clave de 10 dígitos: un "0" o
 * un teléfono a medias no identifica a nadie. El nombre y el teléfono son los del pedido más
 * reciente. En orden, el de compra más reciente primero.
 */
export function compradoresSinFicha(
  pedidos: readonly { customerName: string; customerPhone: string; createdAt: Date }[],
  fichas: readonly { phone: string | null }[],
): { clave: string; nombre: string; telefono: string; pedidos: number; ultimo: Date }[] {
  const conFicha = new Set(fichas.map((f) => normalizarTelefono(f.phone)).filter(Boolean));
  const porClave = new Map<string, { clave: string; nombre: string; telefono: string; pedidos: number; ultimo: Date }>();
  for (const p of pedidos) {
    const clave = normalizarTelefono(p.customerPhone);
    if (clave.length !== 10 || conFicha.has(clave)) continue;
    const previo = porClave.get(clave);
    if (!previo) {
      porClave.set(clave, { clave, nombre: p.customerName.trim(), telefono: p.customerPhone.trim(), pedidos: 1, ultimo: p.createdAt });
      continue;
    }
    previo.pedidos++;
    if (p.createdAt.getTime() > previo.ultimo.getTime()) {
      previo.ultimo = p.createdAt;
      previo.nombre = p.customerName.trim() || previo.nombre;
      previo.telefono = p.customerPhone.trim();
    }
  }
  return [...porClave.values()].sort((a, b) => b.ultimo.getTime() - a.ultimo.getTime());
}
