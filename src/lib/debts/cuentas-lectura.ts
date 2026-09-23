// ============================================================================
// LECTURA de las cuentas a cobrar y a pagar con su saldo — una sola, para las pantallas y el
// flujo de fondos (y para el botón del Inicio, el día que tenga número).
// ============================================================================
//
// Recibe la base con la que leer (el `prisma` del request, o un `db` inyectado) y el negocio:
// nunca lo decide. Por eso NO lleva "use server" (publicaría un endpoint que lee las cuentas de
// cualquier tenantId) ni "server-only" (la ejecutan los tests en node con una base falsa).
//
// DOS consultas por lado, no una: el saldo de una cuenta es su total menos sus cobros o
// pagos (`Collection`), y `Collection` no tiene relación con la cuenta (viaja por
// `originId`, sin FK). Las dos salen en paralelo y el cruce se hace en memoria con la regla
// única del saldo (`conSaldo`).
//
// Si las tablas de cuentas corrientes todavía no existen en la base (su migración es del
// lote de la segunda ventana y en Neon no está medida), la lectura no tira la pantalla:
// devuelve vacío y lo dice (`faltanTablas`), para que la pantalla lo explique.

import type { Prisma } from "@/generated/prisma/client";
import {
  aNumero,
  conSaldo,
  imputadoPorCuenta,
  whereCuentasAbiertas,
  whereImputacionesDe,
  type CuentaAPagarLeida,
  type CuentaConSaldo,
} from "./resumen-cuentas";
import type { ChequeStatus } from "./cheque";

/** La base con la que se lee: el `prisma` del request o una base inyectada (tests). */
export type DbCuentas = Prisma.TransactionClient;

/** ¿El error es "la tabla no existe" (P2021)? Sin importar Prisma de valor. PURA. */
export function esTablaFaltante(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === "P2021";
}

export interface CuentaACobrarConSaldo extends CuentaConSaldo {
  cliente: string;
  clientId: string;
  concepto: string | null;
  orderId: string | null;
}

export interface CuentaAPagarConSaldo extends CuentaAPagarLeida {
  saldado: number;
  saldo: number;
  proveedor: string;
  supplierId: string;
  concepto: string | null;
  purchaseId: string | null;
  cheques: (CuentaAPagarLeida["cheques"][number] & { chequeNumber: string; bank: string })[];
}

/** Las cuentas a cobrar vivas con su saldo, las que vencen antes primero. */
export async function leerCuentasACobrar(
  db: DbCuentas,
  tenantId: string,
): Promise<{ cuentas: CuentaACobrarConSaldo[]; faltanTablas: boolean }> {
  try {
    const [filas, grupos] = await Promise.all([
      db.accountReceivable.findMany({
        where: whereCuentasAbiertas(tenantId),
        select: {
          id: true,
          amount: true,
          issueDate: true,
          dueDate: true,
          concept: true,
          orderId: true,
          clientId: true,
          client: { select: { name: true } },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      }),
      db.collection.groupBy({
        by: ["originId"],
        where: whereImputacionesDe(tenantId, "RECEIVABLE"),
        _sum: { amount: true },
      }),
    ]);
    const cuentas = conSaldo(
      filas.map((r) => ({
        id: r.id,
        amount: aNumero(r.amount),
        issueDate: r.issueDate,
        dueDate: r.dueDate,
        cliente: r.client?.name ?? "Cliente",
        clientId: r.clientId,
        concepto: r.concept,
        orderId: r.orderId,
      })),
      imputadoPorCuenta(grupos),
    );
    return { cuentas, faltanTablas: false };
  } catch (e) {
    if (esTablaFaltante(e)) return { cuentas: [], faltanTablas: true };
    throw e;
  }
}

/** Las cuentas a pagar vivas con su saldo y sus cheques, las que vencen antes primero. */
export async function leerCuentasAPagar(
  db: DbCuentas,
  tenantId: string,
): Promise<{ cuentas: CuentaAPagarConSaldo[]; faltanTablas: boolean }> {
  try {
    const [filas, grupos] = await Promise.all([
      db.accountPayable.findMany({
        where: whereCuentasAbiertas(tenantId),
        select: {
          id: true,
          amount: true,
          issueDate: true,
          dueDate: true,
          concept: true,
          purchaseId: true,
          supplierId: true,
          supplier: { select: { name: true } },
          cheques: {
            select: { id: true, amount: true, dueDate: true, status: true, chequeNumber: true, bank: true },
            orderBy: { dueDate: "asc" },
          },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      }),
      db.collection.groupBy({
        by: ["originId"],
        where: whereImputacionesDe(tenantId, "PAYABLE"),
        _sum: { amount: true },
      }),
    ]);
    const cuentas = conSaldo(
      filas.map((p) => ({
        id: p.id,
        amount: aNumero(p.amount),
        issueDate: p.issueDate,
        dueDate: p.dueDate,
        proveedor: p.supplier?.name ?? "Proveedor",
        supplierId: p.supplierId,
        concepto: p.concept,
        purchaseId: p.purchaseId,
        cheques: (p.cheques ?? []).map((c) => ({
          id: c.id,
          amount: aNumero(c.amount),
          dueDate: c.dueDate,
          status: c.status as ChequeStatus,
          chequeNumber: c.chequeNumber,
          bank: c.bank,
        })),
      })),
      imputadoPorCuenta(grupos),
    );
    return { cuentas, faltanTablas: false };
  } catch (e) {
    if (esTablaFaltante(e)) return { cuentas: [], faltanTablas: true };
    throw e;
  }
}
