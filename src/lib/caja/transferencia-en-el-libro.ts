// ¿La transferencia va a su propia columna del libro? (N2 · M1-C2, orden del dueño 29/10/2026)
//
// Hasta el paquete Gate 2, `CashMethod` no tiene TRANSFERENCIA y el libro junta la transferencia
// con Mercado Pago en `MP` (`cashMethodFromPaymentMethod`). Con prisma/pending-gate2/N2_enums.sql
// aplicada (paso 2.e) Y un cliente de Prisma que conoce el valor (schema.prisma,
// `// N2-enum-encendido:`), cada asiento NUEVO de una transferencia va a `TRANSFERENCIA`. Los de
// antes quedan en `MP`: el cierre del día los sigue separando por el medio de origen.
//
// Se pregunta DENTRO de la transacción del que escribe (no con el probe del proceso, que abre
// otra conexión: con el pool chico de la caja eso puede esperar a la misma tx). El «sí» se guarda
// para siempre en el proceso: Postgres no tiene `DROP VALUE`. El «no» se vuelve a preguntar.

import * as enumsDelCliente from "@/generated/prisma/enums";
import { clienteConoceValor, SQL_VALOR_ENUM } from "@/lib/schema-probe/probe";

type ConsultaCruda = { $queryRawUnsafe?<T = unknown>(sql: string, ...params: unknown[]): Promise<T> };

let enLaBase = false;

export async function transferenciaEnElLibroTx(tx: ConsultaCruda): Promise<boolean> {
  if (!clienteConoceValor(enumsDelCliente, "CashMethod", "TRANSFERENCIA")) return false;
  if (enLaBase) return true;
  // Un cliente sin consultas crudas (los dobles de los tests unitarios) es la base de hoy.
  if (typeof tx.$queryRawUnsafe !== "function") return false;
  const filas = await tx.$queryRawUnsafe<unknown[]>(SQL_VALOR_ENUM, "CashMethod", "TRANSFERENCIA");
  enLaBase = Array.isArray(filas) && filas.length > 0;
  return enLaBase;
}

/** Sólo tests: vuelve a preguntar a la base (una base efímera nueva, sin el valor). */
export function olvidarTransferenciaEnElLibro(): void {
  enLaBase = false;
}
