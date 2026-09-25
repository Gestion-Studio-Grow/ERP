// Prueba local: el cliente viejo (Float) y el nuevo (Decimal con @map) escriben y leen la misma base
// con el trigger de doble escritura. También: qué devuelve $queryRaw para numeric.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as Viejo } from "../copia/src/generated/prisma/client.ts";
import { PrismaClient as Nuevo, Prisma } from "../nueva/src/generated/prisma/client.ts";
const url = "postgresql://postgres@localhost:5433/erp_d1_lab";
const viejo = new Viejo({ adapter: new PrismaPg({ connectionString: url }) });
const nuevo = new Nuevo({ adapter: new PrismaPg({ connectionString: url }) });
const out: Record<string, unknown> = {};
// 1) el viejo escribe Float con ruido; la nueva columna queda redondeada
const a = await viejo.cashMovement.create({ data: { tenantId: "tA", type: "VENTA", amount: 0.1 + 0.2, createdBy: "viejo" } });
const aN = await nuevo.cashMovement.findUniqueOrThrow({ where: { id: a.id } });
out.viejo_escribe = { viejo_lee: a.amount, tipo_viejo: typeof a.amount, nuevo_lee: aN.amount.toString(), es_decimal: Prisma.Decimal.isDecimal(aN.amount) };
// 2) el nuevo escribe Decimal (sin mandar la Float, que es NOT NULL sin default): el trigger la llena
const b = await nuevo.cashMovement.create({ data: { tenantId: "tA", type: "VENTA", amount: new Prisma.Decimal("1234.56"), createdBy: "nuevo" } });
const bV = await viejo.cashMovement.findUniqueOrThrow({ where: { id: b.id } });
out.nuevo_escribe = { nuevo_lee: b.amount.toString(), viejo_lee: bV.amount };
// 3) el nuevo escribe un number y un string
const c = await nuevo.cashMovement.create({ data: { tenantId: "tA", type: "VENTA", amount: "99999.995", createdBy: "nuevo" } });
out.nuevo_string_medio_centavo = c.amount.toString();
// 4) update del viejo y del nuevo sobre la misma fila
await viejo.cashMovement.update({ where: { id: b.id }, data: { amount: 10.005 } });
const b2 = await nuevo.cashMovement.findUniqueOrThrow({ where: { id: b.id } });
await nuevo.cashMovement.update({ where: { id: b.id }, data: { amount: new Prisma.Decimal("20.10") } });
const b3 = await viejo.cashMovement.findUniqueOrThrow({ where: { id: b.id } });
out.updates = { nuevo_tras_update_viejo_10_005: b2.amount.toString(), viejo_tras_update_nuevo: b3.amount };
// 5) Order: el nuevo crea sin mandar totales (default) y con totales
const o1 = await nuevo.order.create({ data: { tenantId: "tA", code: 900001, customerName: "x", customerPhone: "1" } });
const o2 = await nuevo.order.create({ data: { tenantId: "tA", code: 900002, customerName: "x", customerPhone: "1", subtotal: "100.10", discount: "0.10", total: "100.00" } });
const o2v = await viejo.order.findUniqueOrThrow({ where: { id: o2.id } });
out.order = { default_nuevo: [o1.subtotal.toString(), o1.total.toString()], viejo_lee: [o2v.subtotal, o2v.discount, o2v.total] };
// 6) agregados: el nuevo suma en la base (numeric exacto) vs el viejo (float)
const sv = await viejo.cashMovement.aggregate({ where: { tenantId: "tB" }, _sum: { amount: true } });
const sn = await nuevo.cashMovement.aggregate({ where: { tenantId: "tB" }, _sum: { amount: true } });
out.suma = { viejo_float: sv._sum.amount, nuevo_numeric: sn._sum.amount?.toString() };
// 7) $queryRaw con numeric y con float8
const raw = await nuevo.$queryRaw<{ n: unknown; f: unknown }[]>`SELECT "amountDec" AS n, amount AS f FROM "CashMovement" WHERE id = ${b.id}`;
out.raw = { n: raw[0].n, tipo_n: typeof raw[0].n, n_es_decimal: Prisma.Decimal.isDecimal(raw[0].n), f: raw[0].f, tipo_f: typeof raw[0].f };
// 8) JSON del Decimal (lo que haría un Server Action que lo devuelve tal cual)
out.json = JSON.stringify({ monto: b3.amount, montoNuevo: b2.amount });
console.log(JSON.stringify(out, null, 2));
await viejo.$disconnect(); await nuevo.$disconnect();
