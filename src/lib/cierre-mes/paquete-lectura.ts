// ============================================================================
// EL PAQUETE DEL MES — lo que se lee para armarlo, y el registro de quién lo bajó. SERVIDOR.
// ============================================================================
//
// Lo usan dos puertas, y las dos resuelven el negocio ANTES de llegar acá:
//   · la dueña, desde Cierre del mes (`requireApp("cierre-del-mes")`, su propio negocio);
//   · el estudio contable, desde su cartera (/contador/paquete), DESPUÉS de verificar que el
//     cliente es de su cartera. Por eso todo se lee con `tenantTransaction({ tenantId })`:
//     el GUC de RLS es el del cliente y ninguna consulta puede tocar otro negocio.
// Sin "use server": estas funciones reciben un tenantId y, publicadas, leerían cualquiera.
//
// Dos transacciones y no una: las tablas de cuentas corrientes pueden no estar en la base
// (migraciones sin medir en Neon), y en Postgres un error adentro de una transacción la
// aborta entera. Lo seguro va en una; lo que puede faltar, en otra que se tolera.

import "server-only";
import { tenantTransaction } from "@/lib/rls";
import { isPrismaError } from "@/lib/prisma-errors";
import { leerLibroIva } from "@/lib/libros/libro-iva-loader";
import { bordesDelMes, etiquetaDelMes, type MesKey } from "@/lib/libros/fecha-fiscal";
import { dateToIso } from "@/lib/libros/libro-iva";
import {
  CASH_METHOD_LABEL,
  buildLibro,
  movimientoDelLedger,
  openingFromHistory,
  totalOf,
} from "@/lib/caja/libro-caja";
import { buildLibroCsv } from "@/lib/caja/libro-csv";
import type { CashMethod, CashMovementType } from "@/lib/caja/cash-register";
import { costosVigentesEnTx } from "@/lib/stock/costo";
import { round2 } from "@/lib/round";
import { ACCION_PAQUETE, CIERRE_MES_ENTITY, estadoDesdeAuditoria, type Paso } from "./cierre-mes";
import { leerAuditoriaCierre, type DbCierre } from "./lectura";
import type { DatosPaquete, FilaStock, MovimientoCuentaCorriente, SaldoCuenta } from "./paquete";

const MEDIO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  MERCADOPAGO: "Mercado Pago",
};

/** Decimal de Prisma → number (ADR-057). */
function num(v: unknown): number {
  if (v != null && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Las líneas del libro de caja del mes, armadas con las MISMAS funciones que el export del libro. */
async function lineasLibroCaja(tx: DbCierre, tenantId: string, mes: MesKey): Promise<string[]> {
  const b = bordesDelMes(mes);
  const [previos, filas] = await Promise.all([
    tx.cashMovement.groupBy({
      by: ["type", "method"],
      where: { tenantId, occurredAt: { lt: b.instantes.gte } },
      _sum: { amount: true },
    }),
    // Sin `collectionId`/`paymentId`: son columnas de migraciones que pueden faltar, y un
    // error acá abortaría la transacción. Sólo alimentan la columna "Referencia".
    tx.cashMovement.findMany({
      where: { tenantId, occurredAt: { gte: b.instantes.gte, lt: b.instantes.lt } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: { id: true, occurredAt: true, type: true, method: true, amount: true, reason: true, orderId: true, createdBy: true },
    }),
  ]);
  const opening = openingFromHistory(
    previos.map((g, i) => ({
      id: `prev-${i}`,
      occurredAt: b.instantes.gte,
      type: g.type as CashMovementType,
      method: g.method as CashMethod,
      amount: g._sum.amount ?? 0,
      detail: "",
    })),
  );
  const libro = buildLibro(
    opening,
    filas.map((r) => movimientoDelLedger({ ...r, type: r.type as CashMovementType, method: r.method as CashMethod })),
  );
  const csv = buildLibroCsv(libro, { methodLabel: (m) => CASH_METHOD_LABEL[m], monthLabel: etiquetaDelMes(mes), totalOf });
  return csv.split(/\r?\n/).filter((l, i, arr) => !(i === arr.length - 1 && l === ""));
}

/** Stock de los productos que se controlan, valuado al costo vigente (el mismo de Stock y Margen). */
async function stockValorizado(tx: DbCierre, tenantId: string): Promise<FilaStock[]> {
  const productos = await tx.product.findMany({
    where: { tenantId, active: true, deletedAt: null, trackStock: true },
    select: { id: true, name: true, unit: true, stock: true },
    orderBy: { name: "asc" },
  });
  if (productos.length === 0) return [];
  const costos = await costosVigentesEnTx(tx, tenantId, productos.map((p) => p.id));
  return productos.map((p) => {
    const costo = costos.get(p.id) ?? null;
    return {
      nombre: p.name,
      unidad: p.unit,
      stock: p.stock,
      costo,
      // Un stock negativo es un error de carga que hay que recontar, no mercadería: no resta.
      valor: costo != null && p.stock > 0 ? round2(p.stock * costo) : 0,
    };
  });
}

type CuentasCorrientes = NonNullable<DatosPaquete["cuentasCorrientes"]>;

/** Cobranzas y pagos del mes y saldos al último día. `null` si las tablas no están en la base. */
async function cuentasCorrientes(tenantId: string, mes: MesKey): Promise<CuentasCorrientes | null> {
  const b = bordesDelMes(mes);
  try {
    return await tenantTransaction(
      async (tx) => {
        const hastaFinDeMes = { lt: b.instantes.lt };
        const [cobros, deudasClientes, deudasProveedores] = await Promise.all([
          tx.collection.findMany({
            where: { tenantId, originType: { in: ["RECEIVABLE", "PAYABLE"] }, createdAt: { gte: b.instantes.gte, lt: b.instantes.lt } },
            orderBy: { createdAt: "asc" },
            select: { originType: true, originId: true, amount: true, method: true, note: true, createdAt: true },
          }),
          tx.accountReceivable.findMany({
            where: { tenantId, issueDate: hastaFinDeMes },
            select: { id: true, amount: true, concept: true, dueDate: true, status: true, client: { select: { name: true } } },
          }),
          tx.accountPayable.findMany({
            where: { tenantId, issueDate: hastaFinDeMes },
            select: { id: true, amount: true, concept: true, dueDate: true, status: true, supplier: { select: { name: true } } },
          }),
        ]);
        const [pagadoClientes, pagadoProveedores] = await Promise.all([
          tx.collection.groupBy({
            by: ["originId"],
            where: { tenantId, originType: "RECEIVABLE", originId: { in: deudasClientes.map((d) => d.id) }, createdAt: hastaFinDeMes },
            _sum: { amount: true },
          }),
          tx.collection.groupBy({
            by: ["originId"],
            where: { tenantId, originType: "PAYABLE", originId: { in: deudasProveedores.map((d) => d.id) }, createdAt: hastaFinDeMes },
            _sum: { amount: true },
          }),
        ]);

        const nombreCliente = new Map(deudasClientes.map((d) => [d.id, d.client.name]));
        const nombreProveedor = new Map(deudasProveedores.map((d) => [d.id, d.supplier.name]));
        const movimientos: MovimientoCuentaCorriente[] = cobros.map((c) => ({
          fecha: dateToIso(c.createdAt),
          tipo: c.originType === "RECEIVABLE" ? "Cobro de cuenta corriente" : "Pago a proveedor",
          contraparte:
            (c.originType === "RECEIVABLE" ? nombreCliente.get(c.originId) : nombreProveedor.get(c.originId)) ?? "—",
          medio: MEDIO[c.method] ?? c.method,
          monto: num(c.amount),
          nota: c.note ?? "",
        }));

        const saldos = (
          deudas: { id: string; amount: unknown; concept: string | null; dueDate: Date | null; status: string; nombre: string }[],
          pagado: { originId: string; _sum: { amount: unknown } }[],
        ): SaldoCuenta[] => {
          const porDeuda = new Map(pagado.map((p) => [p.originId, num(p._sum.amount)]));
          return deudas
            .filter((d) => d.status === "OPEN")
            .map((d) => ({
              nombre: d.nombre,
              concepto: d.concept ?? "",
              vence: d.dueDate ? dateToIso(d.dueDate) : "",
              saldo: round2(num(d.amount) - (porDeuda.get(d.id) ?? 0)),
            }))
            .filter((s) => s.saldo > 0)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
        };

        return {
          movimientos,
          clientes: saldos(deudasClientes.map((d) => ({ ...d, nombre: d.client.name })), pagadoClientes),
          proveedores: saldos(deudasProveedores.map((d) => ({ ...d, nombre: d.supplier.name })), pagadoProveedores),
        };
      },
      { tenantId },
    );
  } catch (e) {
    if (isPrismaError(e, "P2021") || isPrismaError(e, "P2022")) return null;
    throw e;
  }
}

/**
 * Todo lo del paquete de UN negocio y UN mes. `pasos` los calcula quien llama (la dueña los
 * tiene; el estudio contable los omite). `negocio` es el nombre que va en la primera línea.
 */
export async function leerDatosPaquete(
  tenantId: string,
  mes: MesKey,
  opts: { negocio: string; pasos: Paso[] | null; ahora: Date },
): Promise<DatosPaquete> {
  const [base, cc] = await Promise.all([
    tenantTransaction(
      async (tx) => {
        const libroIva = await leerLibroIva(tx, tenantId, mes);
        const libroCaja = await lineasLibroCaja(tx, tenantId, mes);
        const auditoria = await leerAuditoriaCierre(tx, tenantId, mes);
        const stock = await stockValorizado(tx, tenantId);
        return { libroIva, libroCaja, estado: estadoDesdeAuditoria(auditoria), stock };
      },
      { tenantId },
    ),
    cuentasCorrientes(tenantId, mes),
  ]);
  return {
    mes,
    negocio: opts.negocio,
    generado: opts.ahora,
    estado: base.estado,
    pasos: opts.pasos,
    libroCaja: base.libroCaja,
    libroIva: base.libroIva,
    cuentasCorrientes: cc,
    stock: base.stock,
  };
}

/**
 * Deja escrito quién bajó el paquete ("descargado por"). Con la base del negocio del
 * paquete: si lo baja el estudio contable, la fila queda en el negocio del CLIENTE, que es
 * donde la dueña la ve. `actor` sigue la forma de AuditLog ("user:<id>", "estudio:<id>").
 */
export async function registrarDescarga(
  db: DbCierre,
  tenantId: string,
  mes: MesKey,
  quien: { actor: string; por: string; borrador: boolean },
): Promise<void> {
  await db.auditLog.create({
    data: {
      tenantId,
      actor: quien.actor,
      action: ACCION_PAQUETE,
      entity: CIERRE_MES_ENTITY,
      entityId: mes,
      changes: { por: quien.por, borrador: quien.borrador },
      channel: "admin",
    },
  });
}
