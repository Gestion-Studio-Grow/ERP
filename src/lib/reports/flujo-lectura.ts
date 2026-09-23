// ============================================================================
// LECTURA del flujo de fondos — saldo del libro, fiado y deudas con sus cheques.
// ============================================================================
//
// La pantalla (/admin/flujo) lee todo con `leerFlujo`; el botón del Inicio lee sólo la plata
// de hoy (`leerSaldoDelLibro`), que es la primera tarjeta de la pantalla y sale de la MISMA
// consulta. Recibe la base y el negocio; sin "use server" ni "server-only" (ver
// cuentas-lectura.ts).
//
// CUÁNTAS CONSULTAS: la pantalla, cinco en paralelo. El saldo del libro sale de UNA suma
// agrupada por tipo (no se traen las filas); las cuentas a cobrar y a pagar, de su lectura con
// saldo (cuentas-lectura.ts, dos cada una: la cuenta y sus cobros o pagos). El botón, UNA (la
// del libro): la regla 8 de la arquitectura pide una operación por número, y la proyección
// cruza tres tablas sin relación. Por eso el botón dice cuánta plata hay hoy y la proyección
// se ve adentro.

import type { Prisma } from "@/generated/prisma/client";
import { leerCuentasACobrar, leerCuentasAPagar } from "@/lib/debts/cuentas-lectura";
import { aNumero } from "@/lib/debts/resumen-cuentas";
import { calcularFlujo, saldoDelLibro, type FlujoDeFondos, type Horizonte } from "./flujo";

/** Todo el libro de caja del negocio (el saldo de hoy es la suma de toda su historia). */
export function whereLibroCompleto(tenantId: string) {
  return { tenantId };
}

/** El saldo del libro de caja hoy, todos los medios: UNA suma agrupada por tipo. */
export async function leerSaldoDelLibro(db: Prisma.TransactionClient, tenantId: string): Promise<number> {
  const grupos = await db.cashMovement.groupBy({
    by: ["type"],
    where: whereLibroCompleto(tenantId),
    _sum: { amount: true },
  });
  return saldoDelLibro(grupos.map((g) => ({ type: g.type, total: aNumero(g._sum?.amount) })));
}

export interface LecturaFlujo {
  flujo: FlujoDeFondos;
  /** Las tablas de cuentas corrientes no existen en esta base: el flujo es sólo el libro. */
  sinCuentasCorrientes: boolean;
}

export async function leerFlujo(
  db: Prisma.TransactionClient,
  tenantId: string,
  hoy: string,
  horizonte: Horizonte,
): Promise<LecturaFlujo> {
  const [saldoLibro, aCobrar, aPagar] = await Promise.all([
    leerSaldoDelLibro(db, tenantId),
    leerCuentasACobrar(db, tenantId),
    leerCuentasAPagar(db, tenantId),
  ]);
  const flujo = calcularFlujo({
    hoy,
    horizonte,
    saldoLibro,
    aCobrar: aCobrar.cuentas.map((c) => ({ ...c, quien: c.cliente })),
    aPagar: aPagar.cuentas.map((c) => ({ ...c, quien: c.proveedor })),
  });
  return { flujo, sinCuentasCorrientes: aCobrar.faltanTablas || aPagar.faltanTablas };
}
