/**
 * T01b (MIA-075) · dobles de prueba para el candado de la caja (`src/lib/caja/candado-asiento.server.ts`).
 *
 * Todo asiento en `CashMovement` pasa por `asentarEnCajaTx`, que antes de escribir:
 *   · pregunta el nivel de la transacción (`$queryRaw`, tiene que ser «serializable»);
 *   · toma el candado `cierre-dia:<negocio>` (`$executeRaw`);
 *   · relee el día cerrado (`cashMovement.findFirst` del corte inicial + `auditLog.findFirst` del cierre diario) y el
 *     mes congelado (`auditLog.findFirst` del cierre del mes).
 * Los dobles de `tx` de las pruebas unitarias no traen nada de eso. `conCandado(tx)` se lo agrega al MISMO objeto (lo
 * modifica y lo devuelve, así las pruebas que después le cambian un método siguen tocando el doble que usa el código):
 * Serializable, candado libre y sin corte inicial; el nivel, el candado y el corte se contestan acá y NO llegan al
 * doble, así que lo que una prueba anota o asserta sobre sus llamadas sigue igual que antes. El cierre del día y del mes
 * (`auditLog.findFirst`) los contesta el doble si los modela (sus pruebas de día cerrado siguen rechazando); si no, no
 * hay cierre. Cualquier otra consulta se delega al doble tal cual.
 *
 * Las pruebas del período cerrado de verdad (con el candado real) son las de Postgres (t01b-candado-caja-postgres).
 */
import { CORTE_INICIAL_ACTOR_PREFIX } from "@/lib/caja/corte-inicial";
import type { AsentarEnCaja } from "@/lib/caja/candado-asiento.server";

type Metodo = (...args: never[]) => unknown;
type Modelo = Record<string, Metodo | undefined>;
type Consulta = { where?: { createdBy?: { startsWith?: unknown } } } | undefined;

const esCorteInicial = (a: Consulta) => a?.where?.createdBy?.startsWith === CORTE_INICIAL_ACTOR_PREFIX;
const textoSql = (partes: unknown) => (Array.isArray(partes) ? partes.join("?") : String(partes));

/** Agrega al doble `tx` lo que lee y toma el candado de la caja; el resto lo delega al doble. Devuelve el mismo objeto. */
export function conCandado<T>(tx: T): T {
  const doble = tx as unknown as Record<string, unknown>;

  const queryRaw = doble.$queryRaw as Metodo | undefined;
  doble.$queryRaw = (partes: unknown, ...valores: unknown[]) =>
    textoSql(partes).includes("transaction_isolation")
      ? Promise.resolve([{ nivel: "serializable" }])
      : queryRaw
        ? (queryRaw as (...a: unknown[]) => unknown)(partes, ...valores)
        : Promise.reject(new Error(`conCandado: el doble no contesta $queryRaw «${textoSql(partes)}»`));

  const executeRaw = doble.$executeRaw as Metodo | undefined;
  doble.$executeRaw = (partes: unknown, ...valores: unknown[]) =>
    textoSql(partes).includes("pg_advisory_xact_lock")
      ? Promise.resolve(0)
      : executeRaw
        ? (executeRaw as (...a: unknown[]) => unknown)(partes, ...valores)
        : Promise.reject(new Error(`conCandado: el doble no contesta $executeRaw «${textoSql(partes)}»`));

  const cashMovement = (doble.cashMovement ??= {}) as Modelo;
  const corte = cashMovement.findFirst as ((a: Consulta) => unknown) | undefined;
  cashMovement.findFirst = ((a: Consulta) => (esCorteInicial(a) || !corte ? Promise.resolve(null) : corte(a))) as Metodo;

  // Si el doble ya modela el cierre del día (su `auditLog.findFirst`), manda el doble: así sus pruebas de día cerrado
  // siguen rechazando. Si no lo trae, no hay cierre del día ni del mes.
  const auditLog = (doble.auditLog ??= {}) as Modelo;
  auditLog.findFirst ??= (() => Promise.resolve(null)) as Metodo;

  return tx;
}

/**
 * Doble de `asentarEnCajaTx` para `anularVentaInTx` / `anularCobroTurnoInTx` (lo reciben por parámetro): escribe el
 * asiento directo en el `cashMovement.create` del doble, con el mismo `select` (el id, si no se pide nada).
 */
export const asentarDePrueba = ((tx, _que, data, select) =>
  tx.cashMovement.create({ data, select: select ?? { id: true } })) as AsentarEnCaja;
